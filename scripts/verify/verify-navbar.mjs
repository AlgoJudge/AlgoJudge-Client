// A navigation with more entries than window: the middle scrolls, the mark and
// the foot links stay where they are, and the project is reachable from inside.
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
const results = [];
const check = (ok, what) => {
    results.push(`${ok ? "  ok  " : " FAIL "} ${what}`);
    if (!ok) process.exitCode = 1;
};

await send("Page.enable");
await send("Runtime.enable");
// Deliberately short: this is the window the entries used to run off the bottom of.
await send("Page.setDeviceMetricsOverride", { width: 1400, height: 620, deviceScaleFactor: 1, mobile: false });

await go(`${APP}/manager?fakeUser=amy`, `document.querySelector("[class*=AppShell-navbar]") !== null`);
await wait(1500);

const measure = `
    const navbar = document.querySelector("[class*=AppShell-navbar]");
    const viewport = navbar.querySelector("[class*=ScrollArea-viewport]");
    const mark = navbar.querySelector("img");
    const foot = [...navbar.querySelectorAll("a")].find(a => a.getAttribute("href") === "/terms");
    const inside = element => {
        if (!element) return false;
        const box = element.getBoundingClientRect();
        const bounds = navbar.getBoundingClientRect();
        return box.height > 0 && box.top >= bounds.top - 1 && box.bottom <= bounds.bottom + 1;
    };
    return {
        overflowing: viewport ? viewport.scrollHeight - viewport.clientHeight : 0,
        scrollTop: viewport?.scrollTop ?? -1,
        markVisible: inside(mark),
        footVisible: inside(foot),
        markTop: mark?.getBoundingClientRect().top ?? -1,
        footTop: foot?.getBoundingClientRect().top ?? -1,
        entries: [...navbar.querySelectorAll("a")].length,
    };
`;

const before = await evaluate(`return (() => { ${measure} })();`);
check(before.entries > 12, `the manager panel fills the navigation (${before.entries} links)`);
check(before.overflowing > 0, `and overflows it (${before.overflowing}px past the bottom)`);
check(before.markVisible, "the mark is visible without scrolling");
check(before.footVisible, "and so are the documents at the foot");
await shot("nb-top");

await evaluate(`
    document.querySelector("[class*=AppShell-navbar] [class*=ScrollArea-viewport]").scrollTop = 10000;
    return true;
`);
await wait(800);
const after = await evaluate(`return (() => { ${measure} })();`);
check(after.scrollTop > 0, `the middle scrolls (${Math.round(after.scrollTop)}px)`);
check(Math.abs(after.markTop - before.markTop) < 2, "the mark does not move with it");
check(Math.abs(after.footTop - before.footTop) < 2, "nor do the documents");
check(await evaluate(`
    const navbar = document.querySelector("[class*=AppShell-navbar]");
    const last = [...navbar.querySelectorAll("[class*=ScrollArea-viewport] a")].pop();
    const box = last.getBoundingClientRect();
    const bounds = navbar.getBoundingClientRect();
    return box.top >= bounds.top && box.bottom <= bounds.bottom + 1;
`), "and the last entry can be reached");
await shot("nb-scrolled");

// The project, beside the operator's documents.
const about = await evaluate(`
    const navbar = document.querySelector("[class*=AppShell-navbar]");
    const link = [...navbar.querySelectorAll("a")].find(a => (a.getAttribute("href") ?? "").startsWith("http"));
    if (!link) return null;
    const documents = [...navbar.querySelectorAll("a")].filter(a => a.getAttribute("href") === "/terms");
    return {
        href: link.getAttribute("href"),
        target: link.getAttribute("target"),
        rel: link.getAttribute("rel"),
        label: link.textContent.trim(),
        sameStyle: documents.length === 1
            && getComputedStyle(link).fontSize === getComputedStyle(documents[0]).fontSize
            && getComputedStyle(link).color === getComputedStyle(documents[0]).color,
        first: link.compareDocumentPosition(documents[0]) & Node.DOCUMENT_POSITION_FOLLOWING ? true : false,
    };
`);
check(about !== null, "the project is linked from the navigation");
check(about.href === "https://algojudge.pl", `to the product's own site (${about.href})`);
check(about.target === "_blank" && about.rel === "noreferrer",
    "in a new tab, and without handing over the address it was opened from");
check(about.sameStyle, `drawn like the documents beside it (${about.label})`);
check(about.first, "and offered before them, as in the public footer");

console.log(results.join("\n"));
console.log(process.exitCode ? "\nFAILED" : "\nall checks passed");
socket.close();
