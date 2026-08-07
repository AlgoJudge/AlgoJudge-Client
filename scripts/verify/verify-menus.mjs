// Requirement 9: an image menu that offers only images, and a link menu for the
// rest. Stages one .png and one .md, then reads both menus.
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
    const reply = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
    writeFileSync(`${OUT}/${name}.png`, Buffer.from(reply.result.data, "base64"));
};
const until = async (expression, what, tries = 40) => {
    for (let i = 0; i < tries; i++) {
        if (await evaluate(`return ${expression};`)) return;
        await wait(500);
    }
    throw new Error(`timed out waiting for ${what}`);
};
const results = [];
const check = (ok, what) => {
    results.push(`${ok ? "  ok  " : " FAIL "} ${what}`);
    if (!ok) process.exitCode = 1;
};

await send("Page.enable");
await send("Runtime.enable");
await send("Page.setDeviceMetricsOverride", { width: 1500, height: 1400, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: `${APP}/manager/problems/prob-graf?fakeUser=amy&tab=files` });
await wait(3000);
await until(`document.body.innerText.includes("Dodaj plik")`, "the attachments tab");

// A one-pixel PNG and a Markdown note, staged the way the file input stages them.
await evaluate(`
    const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="), c => c.charCodeAt(0));
    const input = [...document.querySelectorAll("input[type=file]")].find(i => !i.accept);
    const stage = (file) => {
        const data = new DataTransfer();
        data.items.add(file);
        input.files = data.files;
        input.dispatchEvent(new Event("change", { bubbles: true }));
    };
    stage(new File([png], "rysunek.png", { type: "image/png" }));
    await new Promise(r => setTimeout(r, 400));
    stage(new File(["# notatki"], "notatki.md", { type: "text/markdown" }));
    await new Promise(r => setTimeout(r, 400));
    stage(new File(["%PDF-1.4"], "instrukcja.pdf", { type: "application/pdf" }));
    return true;
`);
await until(`document.body.innerText.includes("instrukcja.pdf")`, "the staged files");
await shot("m-files");

await evaluate(`
    [...document.querySelectorAll("[role=tab]")].find(t => t.textContent.includes("Treść")).click();
    return true;
`);
await until(`document.body.innerText.includes("Osadź plik")`, "the statement tab");

// Read the dropdown that is actually on screen: Mantine leaves a closed one in
// the DOM, so querying every menu item at once merges the two menus.
// Read the dropdown that is actually on screen, then toggle it shut: Mantine
// leaves a closed one in the DOM, so querying every menu item at once would
// merge the two menus.
const menuItems = async (label) => evaluate(`
    const button = [...document.querySelectorAll("button")].find(b => b.textContent.trim() === "${label}");
    if (button.disabled) return "disabled";
    button.click();
    await new Promise(r => setTimeout(r, 600));
    const open = [...document.querySelectorAll("[role=menu]")].filter(d => d.getClientRects().length > 0);
    const items = open.length === 1
        ? [...open[0].querySelectorAll("[role=menuitem]")].map(i => i.textContent.trim()).join(", ")
        : "menus open: " + open.length;
    button.click();
    await new Promise(r => setTimeout(r, 600));
    return items;
`);

const embeds = await menuItems("Osadź plik");
check(embeds === "rysunek.png, instrukcja.pdf" || embeds === "rysunek.png",
    `only what can be shown is offered as an embed (${embeds})`);
const links = await menuItems("Odnośnik");
check(links.includes("notatki.md") && links.includes("rysunek.png"),
    `every attachment can be linked (${links})`);

await evaluate(`
    const button = [...document.querySelectorAll("button")].find(b => b.textContent.trim() === "Osadź plik");
    button.click();
    return true;
`);
await wait(600);
await shot("m-image-menu");

console.log(results.join("\n"));
console.log(process.exitCode ? "\nFAILED" : "\nall checks passed");
socket.close();
