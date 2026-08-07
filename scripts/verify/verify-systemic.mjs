// Who counts as competing, and the sheet a manager cuts up.
import { open, results } from "./cdp.mjs";

const APP = process.env.APP ?? "http://localhost:5180";
const { send, evaluate, wait, shot, go, visit, click, tab, close } =
    await open({ out: process.env.OUT ?? "." });
const { check, report } = results();

const MANAGER_LIST = `[...document.querySelectorAll("tbody tr")].some(r => r.innerText.includes("PROG-1-LA"))`;
const openActivity = async () => {
    await click(`[...document.querySelectorAll("tbody tr")]
        .find(r => r.innerText.includes("PROG-1-LA"))?.querySelector("td")`);
    await wait(2500);
};

await go(`${APP}/manager/activities?fakeUser=john`, MANAGER_LIST);
await openActivity();
await click(tab("Uczestnicy"));
await wait(1200);

// 4 — staff are systemic, and it is not a preference.
const rows = await evaluate(`
    return [...document.querySelectorAll("tbody tr")].map(r => r.innerText.replace(/\\s+/g, " ").trim());
`);
check(rows.some(r => /Jan Kowalski.*systemowe/i.test(r)),
    "the activity's manager is marked systemic without anybody saying so");
const counted = await evaluate(`
    const tab = [...document.querySelectorAll("[role=tab]")].find(t => /Uczestnicy/.test(t.textContent));
    return tab ? tab.textContent.trim() : "";
`);
check(/\(0\)|\(1\)/.test(counted),
    `and the count is the people actually competing (${counted}), not everybody with a grant`);
await shot("sys-rows");

await click(`[...document.querySelectorAll("tbody tr")]
    .find(r => r.innerText.includes("Jan Kowalski"))
    ?.querySelector("button")`);
await wait(1500);
check(await evaluate(`
    const modal = document.querySelector("[class*=Modal-content]");
    const box = [...(modal?.querySelectorAll("input[type=checkbox]") ?? [])]
        .find(b => b.closest("[class*=Switch-root]") !== null);
    return box ? box.checked && box.disabled : false;
`), "the switch on a staff grant is on and refuses to be turned off");
await shot("sys-staff");
await click(`[...document.querySelectorAll("[class*=Modal-content] button")].find(b => b.textContent.trim() === "Wróć")`);
await wait(1200);

// A membership that is only a participation, where it is a choice. Opened as a
// new one: every grant this activity already holds is a staff grant, which is
// itself the point of the previous check.
await click(`[...document.querySelectorAll("button")].find(b => b.textContent.trim() === "Zapisz osobę")`);
await wait(1500);
check(await evaluate(`
    const modal = document.querySelector("[class*=Modal-content]");
    const box = [...(modal?.querySelectorAll("input[type=checkbox]") ?? [])]
        .find(b => b.closest("[class*=Switch-root]") !== null);
    return box ? !box.disabled : false;
`), "on an ordinary membership it moves freely");
await click(`[...document.querySelectorAll("[class*=Modal-content] button")].find(b => b.textContent.trim() === "Wróć")`);
await wait(1200);

// 5 — the printed sheet, and where it points.
await click(`[...document.querySelectorAll("button")].find(b => b.textContent.trim() === "Konta tymczasowe")`);
await wait(1200);
await evaluate(`
    const modal = document.querySelector("[class*=Modal-content]");
    const prefix = modal.querySelector("input");
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(prefix, "druk");
    prefix.dispatchEvent(new Event("input", { bubbles: true }));
    const count = [...modal.querySelectorAll("input")].find(i => i.value === "20");
    if (count) {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(count, "3");
        count.dispatchEvent(new Event("input", { bubbles: true }));
    }
    return true;
`);
await wait(600);
await click(`[...document.querySelectorAll("[class*=Modal-content] button")].find(b => b.textContent.trim() === "Utwórz")`);
await wait(3500);

// The sheet opens in a tab of its own, so it is read from there.
const before = (await (await fetch("http://127.0.0.1:9333/json/list")).json()).length;
await click(`[...document.querySelectorAll("[class*=Modal-content] button")].find(b => /Drukuj/.test(b.textContent))`);
await wait(2500);
const targets = await (await fetch("http://127.0.0.1:9333/json/list")).json();
check(targets.length > before, "Print opens a tab of its own rather than printing the screen");

const sheet = targets.find(t => t.type === "page" && !t.url.startsWith("http://localhost:5180"));
let text = "", columns = 0, height = "";
// Read through a connection to that tab, because it is a document of its own.
const socket = new WebSocket(sheet.webSocketDebuggerUrl);
await new Promise(r => socket.addEventListener("open", r, { once: true }));
const ask = (method, params = {}) => new Promise(res => {
    const id = Math.floor(Math.random() * 1e9);
    const onMessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.id === id) { socket.removeEventListener("message", onMessage); res(message); }
    };
    socket.addEventListener("message", onMessage);
    socket.send(JSON.stringify({ id, method, params }));
});
await ask("Runtime.enable");
const read = async (expression) => {
    const reply = await ask("Runtime.evaluate", { expression, returnByValue: true });
    return reply.result?.result?.value;
};
text = await read(`document.body.innerText`);
columns = await read(`document.querySelectorAll("tr")[0]?.children.length ?? 0`);
height = await read(`getComputedStyle(document.querySelector("td")).height`);
socket.close();

check(columns === 2, `the sheet is two columns wide (${columns})`);
check(/druk-001/.test(text) && /Login/.test(text) && /Hasło/.test(text),
    "each slip carries a login and a password");
check(text.includes("/activities/PROG-1-LA"),
    "and the address of the activity the accounts were made in");
check(text.includes("Programowanie 1 — grupa LA"),
    "under its name, so a slip found on a desk says what it opens");
check(parseFloat(height) > 150, `the rows are tall enough to cut apart (${height})`);

report();
close();
