// Stage 9: an operator writes what the instance says about itself, and the
// screens follow — including the state where it says nothing at all.
import { writeFileSync } from "node:fs";

const PORT = process.env.CDP_PORT ?? "9333";
const APP = process.env.APP ?? "http://localhost:5180";
const OUT = process.env.OUT ?? ".";

const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" })).json();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(resolve => socket.addEventListener("open", resolve, { once: true }));

let nextId = 0;
const pending = new Map();
socket.addEventListener("message", event => {
    const message = JSON.parse(event.data);
    if (message.id !== undefined && pending.has(message.id)) {
        pending.get(message.id)(message);
        pending.delete(message.id);
    }
});
const send = (method, params = {}) => new Promise(resolve => {
    const id = ++nextId;
    pending.set(id, resolve);
    socket.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => {
    const reply = await send("Runtime.evaluate", {
        expression: `(async () => { ${expression} })()`,
        returnByValue: true,
        awaitPromise: true,
    });
    if (reply.result?.exceptionDetails) {
        throw new Error(reply.result.exceptionDetails.exception?.description ?? "evaluation failed");
    }
    return reply.result?.result?.value;
};
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const shot = async (name) => {
    const reply = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(`${OUT}/${name}.png`, Buffer.from(reply.result.data, "base64"));
};
const go = async (url, waitFor, tries = 40) => {
    await send("Page.navigate", { url });
    await wait(2500);
    for (let i = 0; i < tries; i++) {
        if (await evaluate(`return ${waitFor};`)) return;
        await wait(500);
    }
    throw new Error(`timed out on ${url}`);
};
const click = async (locator) => {
    const point = await evaluate(`
        const element = ${locator};
        if (!element) return null;
        element.scrollIntoView({ block: "center" });
        const box = element.getBoundingClientRect();
        return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
    `);
    if (!point) throw new Error(`nothing to click: ${locator}`);
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1 });
    await wait(1200);
};
const results = [];
const check = (ok, what) => {
    results.push(`${ok ? "  ok  " : " FAIL "} ${what}`);
    if (!ok) process.exitCode = 1;
};
const button = (label) => `[...document.querySelectorAll("button")].find(b => b.textContent.trim() === ${JSON.stringify(label)})`;
const tab = (label) => `[...document.querySelectorAll("[role=tab]")].find(t => t.textContent.trim() === ${JSON.stringify(label)})`;
/**
 * Moves inside the application rather than reloading it.
 *
 * A full page load rebuilds the fake — a new file store and a new instance —
 * so anything published in this tab would be gone before it could be read. The
 * router listens to `popstate`, which is what a real click through the shell
 * does to it.
 */
const navigate = async (path) => {
    await evaluate(`
        history.pushState({}, "", ${JSON.stringify(path)});
        window.dispatchEvent(new PopStateEvent("popstate"));
        return true;
    `);
    await wait(2500);
};

await send("Page.enable");
await send("Runtime.enable");
await send("Page.setDeviceMetricsOverride", { width: 1500, height: 1200, deviceScaleFactor: 1, mobile: false });

// 1 — a manager who does not administer the installation is refused it.
await go(`${APP}/manager?fakeUser=amy`, `document.body.innerText.includes("Panel")`);
check(!await evaluate(`return document.body.innerText.includes("Instancja");`),
    "a manager is not offered the instance screen");
await go(`${APP}/manager/instance`, `document.body.innerText.length > 100`);
check(await evaluate(`return /instance:update/.test(document.body.innerText);`),
    "and asking for it names the permission they lack");

// 2 — an administrator gets it.
await go(`${APP}/manager/instance?fakeUser=john`, `document.body.innerText.includes("Ustawienia")`);
check(true, "an administrator opens it");
await shot("in-settings");

// 3 — publishing a replacement for a template.
await click(tab("Dokumenty"));
check(await evaluate(`return /szablon/i.test(document.body.innerText);`),
    "the documents that ship are shown as templates");
await click(`[...document.querySelectorAll("tbody tr")]
    .find(r => r.innerText.includes("Polityka prywatno"))
    ?.querySelector("button")`);
await wait(2500);
check(await evaluate(`return document.querySelector("textarea") !== null;`),
    "one opens in the same editor a statement is written in");

const TEXT = "---\\nversion: 1\\n---\\n\\n# Polityka prywatnosci\\n\\nTa instancja przetwarza dane tak, jak opisano ponizej.\\n";
await evaluate(`
    const area = document.querySelector("textarea");
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(area, "${TEXT}");
    area.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
`);
await wait(1200);
await click(button("Opublikuj"));
await wait(2500);
// Mantine uppercases badge text, so these are matched case-insensitively.
check(await evaluate(`
    const row = [...document.querySelectorAll("tbody tr")].find(r => r.innerText.includes("Polityka prywatno"));
    return row ? /publikowany/i.test(row.innerText) && !/szablon/i.test(row.innerText) : false;
`), "publishing replaces the template");
await shot("in-documents");

// 4 — the reader sees it, in the shell, with no template warning.
await navigate("/privacy");
check(await evaluate(`return document.body.innerText.includes("przetwarza dane");`),
    "and a reader gets the operator's own text");
check(!await evaluate(`return /szablon dostarczony/i.test(document.body.innerText);`),
    "with no warning that it is a template");

// 5 — withdrawing it takes its links with it. Still without a reload: what was
//     published lives in this tab.
await navigate("/manager/instance");
await click(tab("Dokumenty"));
await click(`[...document.querySelectorAll("tbody tr")]
    .find(r => r.innerText.includes("Polityka prywatno"))
    ?.querySelector("button")`);
await wait(2000);
await click(button("Przestań publikować"));
await wait(2000);
check(await evaluate(`
    const navbar = document.querySelector("[class*=AppShell-navbar]");
    return [...navbar.querySelectorAll("a")].every(a => a.getAttribute("href") !== "/privacy");
`), "withdrawing it removes it from the navigation at once");
check(await evaluate(`
    const row = [...document.querySelectorAll("tbody tr")].find(r => r.innerText.includes("Polityka prywatno"));
    return row ? /niepublikowany/i.test(row.innerText) : false;
`), "and the screen says it is no longer published");
check(await evaluate(`return /Wcze[śs]niejsze wersje/.test(document.body.innerText);`),
    "while the revisions already published stay in the history");

await navigate("/privacy");
check(await evaluate(`return /Nie ma tu takiej strony|no such page/i.test(document.body.innerText);`),
    "and its address says there is no such page");
await shot("in-withdrawn");

console.log(results.join("\n"));
console.log(process.exitCode ? "\nFAILED" : "\nall checks passed");
socket.close();
