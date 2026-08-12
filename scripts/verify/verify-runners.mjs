// Closing the Runner panel must take the Runner out of the address too.
const PORT = process.env.CDP_PORT ?? "9333";
const APP = process.env.APP ?? "http://localhost:5180";

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
const go = async (url, waitFor, tries = 40) => {
    await send("Page.navigate", { url });
    await wait(2500);
    for (let i = 0; i < tries; i++) {
        if (await evaluate(`return ${waitFor};`)) return;
        await wait(500);
    }
    throw new Error(`timed out on ${url}`);
};
/** A real click where the element actually is; a synthetic one misses rows. */
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
    await wait(1200);
};
const results = [];
const check = (ok, what) => {
    results.push(`${ok ? "  ok  " : " FAIL "} ${what}`);
    if (!ok) process.exitCode = 1;
};
const address = () => evaluate(`return location.search;`);
const panelOpen = () => evaluate(`return document.querySelector("[class*=Modal-content]") !== null;`);

await send("Page.enable");
await send("Runtime.enable");
await send("Page.setDeviceMetricsOverride", { width: 1400, height: 1000, deviceScaleFactor: 1, mobile: false });

await go(`${APP}/manager/runners?fakeUser=amy`, `document.querySelectorAll("tbody tr").length > 0`);
check(true, "the Runner list opens");

await click(`document.querySelector("tbody tr td")`);
check(/runner=/.test(await address()), `opening one puts it in the address (${await address()})`);
check(await panelOpen(), "and opens the panel");

// An attachment tab, which is the only thing here that reads stored bytes.
//
// **This was missing until 2026-08-12**, and its absence mattered: the panel
// stopped fetching through a dedicated endpoint and started reading
// `GET /files/{id}` like every other stored file, so the fake had to seed those
// bytes into the shared store instead of a private map of its own. Every check
// above passed throughout, because none of them ever opened a file. Two halves
// of the fake disagreeing is exactly what this suite is for.
await click(`[...document.querySelectorAll("[role=tab]")].find(t => /lscpu/.test(t.textContent))`);

check(/file=/.test(await address()), `the tab is in the address too (${await address()})`);

// **The visible one.** Mantine keeps every panel mounted, so the first `code`
// in the modal is the public key on the General tab — which is how the first
// version of this check passed while looking at entirely the wrong element.
const shown = await evaluate(`
    const blocks = [...document.querySelectorAll("[class*=Modal-content] code, [class*=Modal-content] pre")]
        .filter(element => element.offsetParent !== null);
    return blocks.length ? blocks[blocks.length - 1].textContent.trim() : "";
`);
check(shown.length > 0, "opening an attachment tab shows its contents");
check(/Architecture|CPU/.test(shown), `and they are the file's own bytes (${shown.slice(0, 40).replace(/\n/g, " ")}…)`);

await click(`[...document.querySelectorAll("button")].find(b => ["Back", "Wróć", "Powrót"].includes(b.textContent.trim()))`);
check(!await panelOpen(), "Back closes the panel");
check(!/runner=/.test(await address()), `and takes it out of the address (${await address() || "empty"})`);

console.log(results.join("\n"));
console.log(process.exitCode ? "\nFAILED" : "\nall checks passed");
socket.close();
