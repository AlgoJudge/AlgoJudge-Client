// The screen that decides where the Server may fetch a document from.
//
// It is a list, which is the easiest kind of screen to get wrong quietly: an
// entry that never reaches the API looks exactly like one that did until the
// page is left and come back to. So nothing here is asserted from the control
// that was just clicked.
import { open, results } from "./cdp.mjs";

const APP = process.env.APP ?? "http://localhost:5180";
const { evaluate, wait, shot, go, visit, click, close } = await open({ out: process.env.OUT ?? "." });
const { check, report } = results();

const AREA = `document.querySelector("[class*=AppShell-main]")`;
const screen = () => evaluate(`
    const area = ${AREA};
    return (area?.innerText ?? "").replace(/\\s+/g, " ");
`);

const reopen = async () => {
    await visit("/manager/instance", `document.body.innerText.includes("Instancja")`);
    await wait(500);
    await visit("/manager/external-content", `document.body.innerText.includes("zewn")`);
    await wait(1200);
};

await go(`${APP}/manager/external-content?fakeUser=john`,
    `document.body.innerText.includes("zewn")`);
await wait(1500);

const first = await screen();
check(/onlinejudge\.org/.test(first), "the host the product ships with is listed");
check(/wyłączone/i.test(first),
    "and the screen says plainly that the switch governing it is off");
await shot("external-content");

// **Added, then read back after leaving.** `visit()` rather than `go()`: `go()`
// rebuilds the fake and would throw away the very save under test.
await evaluate(`
    const input = ${AREA}.querySelector("input");
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(input, "example.invalid");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
`);
await click(`[...${AREA}.querySelectorAll("button")].find(b => b.textContent.trim() === "Dodaj")`);
await wait(1200);
await reopen();

const added = await screen();
check(/example\.invalid/.test(added), "a host added on this screen is still there after leaving it");
check(/onlinejudge\.org/.test(added), "and the one that was already there was not replaced by it");

// And removed, read back the same way.
//
// **Guarded rather than assumed.** Without this the removal step reaches for a
// control that only exists once the step above worked, and a broken save then
// ends the run with "nothing to click" instead of with the assertion that
// actually failed. A check that reports the wrong thing when it breaks is a
// check somebody will misread at the worst moment.
const rows = await evaluate(`
    return [...${AREA}.querySelectorAll("button")]
        .filter(b => b.textContent.trim() === "Usuń").length;
`);
check(rows >= 2, `both hosts offer a way to remove them (${rows})`);

if (rows >= 2) {
    await click(`[...${AREA}.querySelectorAll("button")].filter(b => b.textContent.trim() === "Usuń")[1]`);
    await wait(1200);
    await reopen();

    const removed = await screen();
    check(!/example\.invalid/.test(removed), "a host removed on this screen stays removed");
    check(/onlinejudge\.org/.test(removed), "and removing one did not take the other with it");
    await shot("external-content-edited");
}

report();
close();
