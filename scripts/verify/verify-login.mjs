// The one behavioural path the ApiError rewrite could break: a refused sign-in
// must still be recognised as refused, not reported as an unknown failure.
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
const type = async (selector, value) => {
    await evaluate(`
        const input = document.querySelector(${JSON.stringify(selector)});
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, ${JSON.stringify(value)});
        input.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
    `);
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
await go(`${APP}/login`, `document.querySelector("input[type=password]") !== null`);

await type("input:not([type=password])", "jkowalski");
await type("input[type=password]", "definitely-not-the-password");
await evaluate(`
    [...document.querySelectorAll("button")].find(b => b.type === "submit"
        || /Zaloguj|Sign in|Login/i.test(b.textContent))?.click();
    return true;
`);
await wait(2500);
const refused = await evaluate(`return document.body.innerText.replace(/\\s+/g, " ");`);
check(/nieprawid|niepoprawn|invalid|incorrect|błędn/i.test(refused),
    "a wrong password is reported as a wrong password");
check(!/status \\d\\d\\d|InvalidStatus/i.test(refused), "and not as a bare status");
check(await evaluate(`return location.pathname;`) === "/login", "and the reader stays on the screen");

// The right one still works, so the rewrite did not break the ordinary path.
await type("input[type=password]", "Test1!");
await evaluate(`
    [...document.querySelectorAll("button")].find(b => b.type === "submit"
        || /Zaloguj|Sign in|Login/i.test(b.textContent))?.click();
    return true;
`);
await wait(3500);
check(await evaluate(`return location.pathname;`) !== "/login", "the right password signs in");

console.log(results.join("\n"));
console.log(process.exitCode ? "\nFAILED" : "\nall checks passed");
socket.close();
