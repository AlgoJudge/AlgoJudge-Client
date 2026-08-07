// The instance names itself: beside the mark in both shells, and in the tab.
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
const NAME = "Wydział Informatyki";

await send("Page.enable");
await send("Runtime.enable");
await send("Page.setDeviceMetricsOverride", { width: 1500, height: 1000, deviceScaleFactor: 1, mobile: false });

// 1 — the visitor's shell.
await go(`${APP}/`, `document.body !== null`);
await evaluate(`localStorage.clear(); sessionStorage.clear(); return true;`);
await go(`${APP}/`, `document.body.innerText.includes("AlgoJudge")`);
check(await evaluate(`
    const header = document.querySelector("header");
    return header ? header.innerText.includes(${JSON.stringify(NAME)}) : false;
`), "a visitor sees the instance name beside the mark");
check(await evaluate(`return document.title;`) === `AlgoJudge | ${NAME}`,
    `and the tab carries the product first (${await evaluate(`return document.title;`)})`);
await shot("nm-public");

// 2 — the application shell.
await go(`${APP}/activities?fakeUser=amy`, `document.querySelector("[class*=AppShell-navbar]") !== null`);
check(await evaluate(`
    const header = document.querySelector("[class*=AppShell-header]");
    return header ? header.innerText.includes(${JSON.stringify(NAME)}) : false;
`), "so does somebody signed in");
check(await evaluate(`
    const header = document.querySelector("[class*=AppShell-header]");
    const name = [...header.querySelectorAll("p")].find(p => p.textContent.trim() === ${JSON.stringify(NAME)});
    const box = name.getBoundingClientRect();
    return box.right < header.getBoundingClientRect().right;
`), "and it does not push the clock and the account menu off the header");
await shot("nm-shell");

// 3 — an installation nobody has named says only what software it is.
await go(`${APP}/?fakeName=off`, `document.body.innerText.includes("AlgoJudge")`);
await wait(1200);
check(await evaluate(`return document.title;`) === "AlgoJudge",
    `an unnamed installation is just the product (${await evaluate(`return document.title;`)})`);
check(!await evaluate(`
    const header = document.querySelector("header");
    return header ? header.innerText.includes(${JSON.stringify(NAME)}) : false;
`), "and the header shows nothing beside the mark");
await shot("nm-unnamed");

console.log(results.join("\n"));
console.log(process.exitCode ? "\nFAILED" : "\nall checks passed");
socket.close();
