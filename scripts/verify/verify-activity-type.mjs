// The activity type is chosen from what this Client can present, in both the
// create form and the settings form — as a problem's type already was.
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
        const box = element.getBoundingClientRect();
        return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
    `);
    if (!point) throw new Error(`nothing to click: ${locator}`);
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1 });
    await wait(1000);
};
const results = [];
const check = (ok, what) => {
    results.push(`${ok ? "  ok  " : " FAIL "} ${what}`);
    if (!ok) process.exitCode = 1;
};
/**
 * The options of one Select, by its label.
 *
 * Scoped through `aria-controls` to the dropdown that input owns: a settings
 * form has half a dozen Selects and Mantine keeps every one of their option
 * lists in the document, so an unscoped query returns all of them at once.
 */
const inputFor = (label) => `[...document.querySelectorAll("label")]
    .filter(l => l.textContent.trim() === ${JSON.stringify(label)})
    .map(l => document.getElementById(l.getAttribute("for")))
    .find(Boolean)`;

const optionsOf = async (label) => {
    await click(inputFor(label));
    return await evaluate(`
        const input = ${inputFor(label)};
        const dropdown = document.getElementById(input?.getAttribute("aria-controls") ?? "");
        if (!dropdown) return null;
        return [...dropdown.querySelectorAll("[role=option]")].map(o => o.textContent.trim());
    `);
};

await send("Page.enable");
await send("Runtime.enable");
await send("Page.setDeviceMetricsOverride", { width: 1500, height: 1100, deviceScaleFactor: 1, mobile: false });

// 1 — the create form.
await go(`${APP}/manager/activities?fakeUser=amy`, `document.querySelectorAll("tbody tr").length > 0`);
await click(`[...document.querySelectorAll("button")].find(b => /Nowa aktywno|New activity/i.test(b.textContent))`);
const creating = await optionsOf("Typ");
check(creating.length === 2, `the create form offers a list, not a field (${creating.join(", ")})`);
check(creating.every(option => /contest@1|course@1/.test(option)),
    "and only the types this Client can present");
check(await evaluate(`
    const modal = document.querySelector("[class*=Modal-content]");
    return modal ? /runda|round|termin|deadline/i.test(modal.innerText) : false;
`), "the chosen type explains itself");
await shot("at-create");

// 2 — the settings form on an activity that exists.
await go(`${APP}/manager/activities`, `document.querySelectorAll("tbody tr").length > 0`);
await click(`document.querySelector("tbody tr td p")`);
await wait(1500);
// The activity opens on its series, not on its settings.
await click(`[...document.querySelectorAll("[role=tab]")].find(t => /Ustawienia|Settings/i.test(t.textContent))`);
await wait(1200);
const editing = await optionsOf("Typ");
check(editing.length === 2, `the settings form offers the same list (${editing.join(", ")})`);
await shot("at-settings");

// 3 — the ranking type was already a list and stays one.
const ranking = await optionsOf("Typ rankingu");
check(ranking.length === 2, `the ranking type is still its own list (${ranking.join(", ")})`);

console.log(results.join("\n"));
console.log(process.exitCode ? "\nFAILED" : "\nall checks passed");
socket.close();
