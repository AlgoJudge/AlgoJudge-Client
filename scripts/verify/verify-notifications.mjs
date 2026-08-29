// The corner that says what happened, and the asterisks on both boxes.
import { open, results } from "./harness.mjs";

const APP = process.env.APP ?? "http://localhost:5180";
const { evaluate, wait, shot, go, visit, click, close } = await open();
const { check, report } = results();

const body = () => evaluate(`return document.body.innerText;`);
/**
 * The notifications, and where the first one sits.
 *
 * Measured on the notification rather than on its container: the container is a
 * zero-height anchor at the top of the viewport, and the notifications are
 * positioned against the viewport itself.
 */
const stack = () => evaluate(`
    const items = [...document.querySelectorAll("[data-testid=notification]")];
    if (items.length === 0) return { items: [], bottom: null, left: null };
    const box = items[0].getBoundingClientRect();
    return {
        bottom: Math.round(window.innerHeight - box.bottom),
        left: Math.round(box.left),
        items: items.map(n => n.textContent.replace(/\\s+/g, " ").trim()),
    };
`);

// The fake opens a withheld round 45 seconds after load, which is the event a
// participant is meant to be told about.
await go(`${APP}/activities/AMMPZ-2019/problems?fakeUser=amy`, `document.body.innerText.includes("Runda 1")`);

// And a submission finishes on the way, which is the other one.
// **This one does not take the virtual clock, and that is measured.** Opting it
// in reddened two assertions: the panel reported 121 px from the bottom instead
// of its resting place, because `fastForward` fires each due timer once and
// fakes `requestAnimationFrame` too — so the notification's slide-in never
// finishes and its position is read mid-transition. A script that asserts where
// something *ended up* cannot share a clock with one that only needs time to
// pass. It waits the real 22 s.
for (let i = 0; i < 24; i++) {
    const now = await stack();
    if (now.items.length) break;
    await wait(3000);
}
const shown = await stack();
check(shown.items.length > 0,
    `something was announced while the reader sat on the problems (${shown.items.join(" | ")})`);
// Bottom LEFT: the right-hand corner belongs to the submissions panel, and two
// things stacking in one corner is what moved these across.
check(shown.bottom !== null && shown.bottom < 80 && shown.left !== null && shown.left < 80,
    `and it is in the bottom-left corner (${shown.bottom} from the bottom, ${shown.left} from the left)`);
await shot("not-corner");

// Clicking takes the reader where it happened.
const to = await evaluate(`
    const item = document.querySelector("[data-testid=notification]");
    if (!item) return null;
    const box = item.getBoundingClientRect();
    return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
`);
if (to) {
    await evaluate(`
        const item = document.querySelector("[data-testid=notification]");
        item.click();
        return true;
    `);
    await wait(2000);
    check(/^\/activities\/AMMPZ-2019\//.test(await evaluate(`return location.pathname;`)),
        `clicking it lands inside the activity it was about (${await evaluate(`return location.pathname;`)})`);
}

// Nothing is announced for an activity the reader is not looking at.
await visit("/activities", `document.body.innerText.includes("AMMPZ")`);
await evaluate(`
    const root = document.querySelector("[data-testid=notifications]");
    for (const n of root?.querySelectorAll("[data-testid=close-button]") ?? []) n.click();
    return true;
`);
await wait(1500);
const outside = await stack();
check(outside.items.length === 0,
    "and the list of activities, which is inside none of them, announces nothing");

// The asterisks.
await go(`${APP}/activities/PROG-1-LB?fakeUser=amy`, `document.body.innerText.includes("Zapisz si")`);
check(await evaluate(`
    const box = [...document.querySelectorAll("input[type=checkbox]")].at(-1);
    const label = box?.closest("[data-testid=checkbox]");
    return label ? label.innerText.includes("*") : false;
`), "the enrolment box carries the asterisk");
await shot("not-asterisk-enrol");

// Signed out first: the registration screen sends anybody who has a session
// straight to their activities.
await evaluate(`localStorage.clear(); sessionStorage.clear(); return true;`);
await go(`${APP}/register?fakeRegistration=on`, `document.body.innerText.includes("Rejestracja")`);
check(await evaluate(`
    const box = [...document.querySelectorAll("input[type=checkbox]")].at(-1);
    const label = box?.closest("[data-testid=checkbox]");
    return label ? label.innerText.includes("*") : false;
`), "and so does the registration box");
check(/\*/.test(await body()), "which is the mark the fields above it already use");
await shot("not-asterisk-register");

report();
close();
