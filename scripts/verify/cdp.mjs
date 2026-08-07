// The harness the verification scripts share: a tab over the DevTools protocol.
//
// Small on purpose. Everything here is either something the protocol makes
// awkward — a click needs a point, not an element — or something that was got
// wrong once and is worth not getting wrong again; `README.md` beside this file
// lists the rest of those.
import { mkdirSync, writeFileSync } from "node:fs";

export async function open({
    port = process.env.CDP_PORT ?? "9333",
    out = ".",
    origin = process.env.APP ?? "http://localhost:5180",
} = {}) {
    const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json();
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
        // Created here rather than assumed: a missing directory failed the
        // script at its first screenshot, which reads as the screen being wrong.
        mkdirSync(out, { recursive: true });
        writeFileSync(`${out}/${name}.png`, Buffer.from(reply.result.data, "base64"));
    };
    const go = async (url, waitFor, tries = 40) => {
        await send("Page.navigate", { url });
        await wait(2500);
        for (let i = 0; i < tries; i++) {
            if (await evaluate(`return ${waitFor};`)) return;
            await wait(500);
        }
        throw new Error(`timed out on ${url} waiting for ${waitFor}`);
    };
    /** In-app, so the fake is not rebuilt and anything published in this tab survives. */
    const visit = async (path, waitFor, tries = 40) => {
        await evaluate(`
            window.history.pushState({}, "", ${JSON.stringify(path)});
            window.dispatchEvent(new PopStateEvent("popstate"));
            return true;
        `);
        await wait(1200);
        for (let i = 0; i < tries; i++) {
            if (await evaluate(`return ${waitFor};`)) return;
            await wait(500);
        }
        throw new Error(`timed out visiting ${path} waiting for ${waitFor}`);
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
    const type = async (selector, value) => {
        await evaluate(`
            const input = document.querySelector(${JSON.stringify(selector)});
            if (!input) throw new Error("no such field: " + ${JSON.stringify(selector)});
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, ${JSON.stringify(value)});
            input.dispatchEvent(new Event("input", { bubbles: true }));
            return true;
        `);
        await wait(300);
    };
    const setTextarea = async (value) => {
        await evaluate(`
            // The **visible** one. Mantine keeps every tab panel mounted, so the
            // first textarea in the document is whichever language was open
            // first, not the one on screen.
            const area = [...document.querySelectorAll("textarea")].find(a => a.offsetParent !== null)
                ?? document.querySelector("textarea");
            Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(area, ${JSON.stringify(value)});
            area.dispatchEvent(new Event("input", { bubbles: true }));
            return true;
        `);
        await wait(700);
    };
    // By prefix: some tabs carry a count — "Uczestnicy (3)" — and an exact match
    // silently finds nothing.
    const tab = (label) =>
        `[...document.querySelectorAll("[role=tab]")].find(t => t.textContent.trim().startsWith(${JSON.stringify(label)}))`;

    await send("Page.enable");
    await send("Runtime.enable");
    await send("DOM.enable");
    await send("Page.setDeviceMetricsOverride", { width: 1500, height: 1200, deviceScaleFactor: 1, mobile: false });

    // Every script starts from a browser that remembers nothing.
    //
    // The language and the colour scheme are kept in `localStorage`, which is
    // shared by every tab on the origin — so a script that switched to English
    // and left it there made every later script fail on Polish text it was
    // right to expect. `sessionStorage` is per tab and needs no clearing, which
    // is why the signed-in user survives inside one script and not between two.
    await send("Storage.clearDataForOrigin", { origin, storageTypes: "local_storage,cookies" });

    return { send, evaluate, wait, shot, go, visit, click, type, setTextarea, tab, close: () => socket.close() };
}

export function results() {
    const lines = [];
    return {
        check(ok, what) {
            lines.push(`${ok ? "  ok  " : " FAIL "} ${what}`);
            if (!ok) process.exitCode = 1;
        },
        report() {
            console.log(lines.join("\n"));
            console.log(process.exitCode ? "\nFAILED" : "\nall checks passed");
        },
    };
}
