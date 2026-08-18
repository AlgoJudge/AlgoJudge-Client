// The instance switch that decides whether work may leave the building.
//
// Small, and here for one reason: the gate cannot see a screen, and this
// setting is the only one in the product whose "off" position is a privacy
// promise. A switch that silently failed to send its value would leave an
// operator believing they had closed a door that was open.
import { open, results } from "./harness.mjs";

const APP = process.env.APP ?? "http://localhost:5180";
const { evaluate, wait, shot, go, visit, click, close } = await open();
const { check, report } = results();

const settings = () => evaluate(`
    const area = document.querySelector("[class*=AppShell-main]");
    const rows = [...(area?.querySelectorAll("[class*=Switch-root]") ?? [])];
    const ours = rows.find(r => r.innerText.indexOf("nie prowadzi") !== -1);
    const box = ours ? ours.querySelector("input[type=checkbox]") : null;
    return {
        drawn: ours !== null && ours !== undefined,
        checked: box ? box.checked : null,
        text: ours ? ours.innerText.replace(/\\s+/g, " ") : "",
    };
`);

await go(`${APP}/manager/instance?fakeUser=john`,
    `document.body.innerText.includes("Instancja")`);
await wait(1500);

const before = await settings();
check(before.drawn, "the manager is offered the external-judging switch");
check(before.checked === false,
    `and it starts off, as an installation gets it (${before.checked})`);
check(/prywatno/i.test(before.text),
    "and the description says what turning it on obliges the installation to");
await shot("external-judging-off");

// Turned on, saved, and read back from the API rather than from the checkbox —
// a switch that flips locally and sends nothing looks identical on screen.
await click(`[...document.querySelectorAll("[class*=Switch-root]")].find(r => r.innerText.indexOf("nie prowadzi") !== -1).querySelector("input")`);
await click(`[...document.querySelectorAll("button")].find(b => b.textContent.trim() === "Zapisz")`);
await wait(1200);

// Read back by leaving the screen and coming back to it, **not** by reloading:
// `go()` rebuilds the fake and would throw the saved value away, so a reload
// here would test the fixture rather than the save. `visit()` is a `pushState`,
// so the answer comes from where the change actually went.
await visit("/manager/runners", `document.body.innerText.length > 0`);
await wait(600);
await visit("/manager/instance", `document.body.innerText.includes("Instancja")`);
await wait(1500);

const after = await settings();
check(after.checked === true,
    `the switch is still on after leaving the screen and coming back (${after.checked})`);
await shot("external-judging-on");

report();
close();
