// The phone, and the one control that has to be reachable on it.
import { open, results } from "./harness.mjs";

const APP = process.env.APP ?? "http://localhost:5180";
const { send, evaluate, wait, shot, go, close } = await open();
const { check, report } = results();

const panel = `document.querySelector("[data-testid=submissions-panel]")`;

// **The first mobile viewport in this suite**, and that absence is the finding
// behind this script: the seventeen overrides beside it are every one of them
// desktop, and `playwright.ui.config.mjs` pins 1500×1200. So nothing here could
// see a submit button sitting underneath the floating submissions panel —
// measured by hand at 390 px on 2026-09-01, where `elementFromPoint` over the
// middle of that button returned the panel instead.
await send("Page.setDeviceMetricsOverride",
    { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });

await go(`${APP}/activities/AMMPZ-2019/submit/D?fakeUser=amy`,
    `document.body.innerText.includes("Język")`);
await wait(1500);

/**
 * Whether the form's own send button is the thing at its own centre.
 *
 * **`elementFromPoint`, not a click and not a screenshot.** A click dispatched
 * through JavaScript lands on the element whatever is drawn over it, so it
 * passes on exactly the layout this is looking for; a screenshot needs a person
 * to read it. This asks the browser the question a finger asks.
 *
 * The panel is excluded from the search rather than trusted to be absent: it
 * carries a send button of its own, and finding that one instead would make the
 * assertion pass for the wrong reason.
 */
const reachable = await evaluate(`
    const button = [...document.querySelectorAll("button")]
        .filter(b => /Wyślij/.test(b.textContent))
        .filter(b => !b.closest("[data-testid=submissions-panel]"))
        .pop();
    if (!button) return { found: false };

    button.scrollIntoView({ block: "center" });
    const box = button.getBoundingClientRect();
    const at = document.elementFromPoint(
        Math.round(box.x + box.width / 2), Math.round(box.y + box.height / 2));

    return {
        found: true,
        covered: at !== button && !button.contains(at),
        by: at ? (at.getAttribute("data-testid") ?? at.tagName.toLowerCase()) : null,
    };
`);

check(reachable.found, "the submit form draws its send button on a 390 px screen");
check(reachable.found && !reachable.covered,
    `and nothing is on top of it (${reachable.by ?? "nothing at that point"})`);
await shot("mobile-submit");

// The thing that used to be. Hidden below `sm` rather than given room to sit in:
// every entry it offers — My submissions, Send — is in the activity's own
// navigation already, so a phone loses a shortcut and not a screen.
const covering = await evaluate(`
    const found = ${panel};
    if (!found) return { present: false };
    const box = found.getBoundingClientRect();
    return {
        present: true,
        width: Math.round(box.width),
        display: getComputedStyle(found).display,
        classes: String(found.className),
    };
`);
check(!covering.present || covering.width === 0,
    `and the floating submissions panel is out of the way at this width `
    + `(${JSON.stringify(covering)})`);

// **The other half, or this would pass by deleting the panel.** The same page on
// a desktop still has it.
await send("Page.setDeviceMetricsOverride",
    { width: 1500, height: 1200, deviceScaleFactor: 1, mobile: false });
await wait(1000);
check(await evaluate(`
    const found = ${panel};
    return found ? found.getBoundingClientRect().width > 0 : false;
`), "while the same page on a desktop still gets it");
await shot("mobile-desktop-still-has-it");

report();
close();
