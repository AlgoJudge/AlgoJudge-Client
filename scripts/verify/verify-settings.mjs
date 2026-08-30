// The two settings an activity gained: when the standings may be read, and
// whether a finished round keeps its problems.
import { open, results } from "./harness.mjs";

const APP = process.env.APP ?? "http://localhost:5180";
const { evaluate, wait, shot, go, visit, click, tab, close } = await open();
const { check, report } = results();

const body = () => evaluate(`return document.body.innerText;`);
const MANAGER_LIST = `[...document.querySelectorAll("tbody tr")].some(r => r.innerText.includes("AMMPZ-2019"))`;
/** Sets one datetime field of the settings form, found by its label. */
const setDate = (label, hoursFromNow) => evaluate(`
    const wrapper = [...document.querySelectorAll("[data-testid=field]")]
        .find(w => w.textContent.includes(${JSON.stringify(label)}));
    const field = wrapper?.querySelector("input");
    if (!field) throw new Error("no field: " + ${JSON.stringify(label)});
    const when = new Date(Date.now() + ${hoursFromNow} * 3600000);
    // The control takes local time without a zone, as a datetime-local does.
    const local = new Date(when.getTime() - when.getTimezoneOffset() * 60000);
    const next = local.toISOString().slice(0, 16);
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(field, next);
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
    return next;
`);
/**
 * The settings tab's own Save.
 *
 * Found by what the panel contains rather than by which is on screen: Mantine
 * keeps every tab panel mounted **and** laid out, so neither document order nor
 * `offsetParent` tells the series editor's four Save buttons from this one.
 */
const save = async () => {
    await click(`(() => {
        const panel = [...document.querySelectorAll("[role=tabpanel]")]
            .find(p => p.textContent.includes("Widoczność i zapisy"));
        return [...(panel?.querySelectorAll("button") ?? [])]
            .find(b => b.dataset.testid === "save");
    })()`);
    await wait(3000);
};

// The ranking window moved to the series on 2026-08-07 and is checked in
// `verify-boards.mjs`, where the rounds are. What is left here is the setting
// that stayed on the activity.

// ── Hiding a finished round's problems ──────────────────────────────────────
// In-app navigation from here on: the fake lives in memory, so a full load
// between the save and the reading would lose the save.
// Permissions arrive in a request of their own, after the session settles, and
// until they do `hasAny` answers no to everything — so a screen looks exactly
// like one this person may not open and an assertion about an absence proves
// nothing. Every navigation below waits for the answer, not just for the page.
const READY = `document.documentElement.dataset.permissions === "ready"`;
await go(`${APP}/manager/activities/AMMPZ-2019?fakeUser=john`, `document.body.innerText.length > 0 && ${READY}`);
await visit("/activities/AMMPZ-2019/problems", `document.body.innerText.includes("Runda 0")`);
await wait(1500);
check(/Rozgrzewka/.test(await body()),
    "a finished round keeps its problems while the setting is off");

await visit("/manager/activities/AMMPZ-2019", `document.body.innerText.length > 0 && ${READY}`);
await click(tab("Ustawienia"));
await wait(1200);
await click(`[...document.querySelectorAll("[data-testid=switch]")]
    .find(s => /Ukryj zadania zakończonych serii/.test(s.textContent))
    ?.querySelector("input")`);
await wait(600);
await save();

await visit("/activities/AMMPZ-2019/problems", `document.body.innerText.includes("Runda 0")`);
await wait(2000);
check(!/Rozgrzewka/.test(await body()),
    "turning it on takes them away");
check(/zakończyła/i.test(await body()),
    "and the panel says the round is over, not that it has not started");
await shot("set-hidden");

// A direct link is refused as well.
await visit("/activities/AMMPZ-2019/problems/R", `document.body.innerText.length > 0 && ${READY}`);
await wait(2500);
check(!/Zadanie na zajęcia|Napisz program/.test(await body()),
    "and the statement does not open from its own address");

report();
close();
