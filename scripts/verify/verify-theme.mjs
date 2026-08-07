// The colour-scheme preference: still applied, still remembered, and no longer
// re-applied on every render of the header.
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
const results = [];
const check = (ok, what) => {
    results.push(`${ok ? "  ok  " : " FAIL "} ${what}`);
    if (!ok) process.exitCode = 1;
};

await send("Page.enable");
await send("Runtime.enable");
await send("Page.setDeviceMetricsOverride", { width: 1400, height: 1000, deviceScaleFactor: 1, mobile: false });

await go(`${APP}/`, `document.body !== null`);
await evaluate(`localStorage.clear(); sessionStorage.clear(); return true;`);
await go(`${APP}/`, `document.body.innerText.includes("AlgoJudge")`);

const scheme = () => evaluate(`return document.documentElement.getAttribute("data-mantine-color-scheme");`);
check(await scheme() === "light", "the page starts in the light scheme");

// The footer's own theme menu, which is what a reader would use.
await evaluate(`
    const menu = [...document.querySelectorAll("a, button")].find(e => e.textContent.trim() === "Theme");
    menu.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    await new Promise(r => setTimeout(r, 700));
    [...document.querySelectorAll("[role=menuitem]")].find(i => i.textContent.trim() === "Dark").click();
    return true;
`);
await wait(1500);
check(await scheme() === "dark", "choosing Dark switches the scheme");
// Mantine's own key. There is no second store of ours beside it any more.
check(await evaluate(`return localStorage.getItem("mantine-color-scheme-value");`) === "dark",
    "and the choice is stored where Mantine keeps it");
check(await evaluate(`return localStorage.getItem("theme");`) === null,
    "with nothing written to a store of our own");

// Re-render the header without changing anything. The burger's own state is the
// cheapest way to force one, and it is in the document at every width.
const churn = await evaluate(`
    window.__writes = 0;
    window.__styles = 0;
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
        if (key.includes("mantine-color-scheme")) window.__writes++;
        return setItem.call(this, key, value);
    };
    new MutationObserver(records => {
        for (const record of records) {
            for (const node of record.addedNodes) {
                if (node.nodeName === "STYLE" && node.hasAttribute?.("data-mantine-disable-transition")) {
                    window.__styles++;
                }
            }
        }
    }).observe(document.head, { childList: true });

    const burger = document.querySelector("button[class*=mantine-Burger-root]");
    for (let i = 0; i < 6; i++) {
        burger.click();
        await new Promise(r => setTimeout(r, 120));
    }
    await new Promise(r => setTimeout(r, 600));
    return { writes: window.__writes, styles: window.__styles, scheme: document.documentElement.getAttribute("data-mantine-color-scheme") };
`);
check(churn.writes === 0, `re-rendering the header stores nothing again (${churn.writes} writes)`);
check(churn.styles === 0, `and suppresses no transitions (${churn.styles} stylesheets)`);
check(churn.scheme === "dark", "the scheme is untouched by all of it");

// The preference outlives a reload, which is the whole point of storing it.
await go(`${APP}/`, `document.body.innerText.includes("AlgoJudge")`);
await wait(1200);
check(await scheme() === "dark", "the stored preference is applied again after a reload");

// A page with almost nothing on it: the footer belongs at the bottom of the
// window, not halfway up it with white space underneath.
await go(`${APP}/login`, `document.querySelector("input") !== null`);
const short = await evaluate(`
    const element = [...document.querySelectorAll("div")].find(d =>
        d.className && String(d.className).includes("footer"));
    const box = element.getBoundingClientRect();
    return {
        bottom: Math.round(box.bottom + window.scrollY),
        page: document.documentElement.scrollHeight,
        viewport: window.innerHeight,
        contentEnds: Math.round(element.getBoundingClientRect().top + window.scrollY),
    };
`);
check(short.page <= short.viewport + 2, `the short page does not scroll (${short.page} of ${short.viewport})`);
check(Math.abs(short.bottom - short.viewport) < 4,
    `and its footer ends at the bottom of the window (${short.bottom} of ${short.viewport})`);

console.log(results.join("\n"));
console.log(process.exitCode ? "\nFAILED" : "\nall checks passed");
socket.close();
