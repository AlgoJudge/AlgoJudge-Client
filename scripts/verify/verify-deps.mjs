// The two dependency lists that changed shape: the activity filters must still
// refetch once and only once, and a link straight to a Runner must still open it.
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

await send("Page.enable");
await send("Runtime.enable");
await send("Page.setDeviceMetricsOverride", { width: 1400, height: 1400, deviceScaleFactor: 1, mobile: false });

// 1 — the activity filters, now listed as the arrays themselves.
await go(`${APP}/activities?fakeUser=amy`, `document.querySelectorAll("[class*=Card-root]").length > 0`);
const before = await evaluate(`return document.querySelectorAll("[class*=Card-root]").length;`);
check(before > 0, `the activity list loads (${before} shown)`);

// Watch for a list that never settles: a dependency changing identity on every
// render would refetch for ever, and the cards would keep being replaced.
await evaluate(`
    window.__churn = 0;
    const root = document.querySelector("main") ?? document.body;
    new MutationObserver(records => { window.__churn += records.length; }).observe(root, { childList: true, subtree: true });
    return true;
`);

// The filters are chips; ticking one is a click on its label.
const chip = await evaluate(`
    const label = document.querySelector("[class*=Chip-label]");
    return label ? label.textContent.trim() : null;
`);
check(Boolean(chip), `a filter is offered (${chip ?? "none"})`);
await click(`document.querySelector("[class*=Chip-label]")`);
await wait(2500);
const after = await evaluate(`return document.querySelectorAll("[class*=Card-root]").length;`);
check(after !== before, `ticking "${chip}" refetches the list (${before} then ${after})`);

await evaluate(`window.__churn = 0; return true;`);
await wait(3000);
const churn = await evaluate(`return window.__churn;`);
check(churn < 30, `and the list then stands still (${churn} mutations in three seconds)`);

// 2 — a link straight to one Runner, which is what the ref exists for.
await go(`${APP}/manager/runners?fakeUser=amy`, `document.querySelectorAll("tbody tr").length > 0`);
await click(`document.querySelector("tbody tr td")`);
const id = (await evaluate(`return location.search;`)).match(/runner=([^&]+)/)?.[1];
check(Boolean(id), `a Runner can be opened by clicking (${id ?? "none"})`);
await click(`[...document.querySelectorAll("button")].find(b => ["Back", "Wróć", "Powrót"].includes(b.textContent.trim()))`);

await go(`${APP}/manager/runners?runner=${id}`, `document.querySelectorAll("tbody tr").length > 0`);
await wait(2000);
check(await evaluate(`return document.querySelector("[class*=Modal-content]") !== null;`),
    "and arriving with that link opens the panel by itself");
check(await evaluate(`return location.search;`).then(s => s.includes(id)),
    "with the address left as the sender wrote it");

console.log(results.join("\n"));
console.log(process.exitCode ? "\nFAILED" : "\nall checks passed");
socket.close();
