// The phone, and the one control that has to be reachable on it.
import { open, results } from "./harness.mjs";

const APP = process.env.APP ?? "http://localhost:5180";
const { send, evaluate, until, wait, shot, go, close } = await open();
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
 * Whether the form's own send button is the thing at its own center.
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

// The header of this file said "the one control that has to be reachable on it"
// until three more phone-width facts were added below. They are here rather
// than in `sweep-mobile.mjs` because that one is a tool and this one is the
// gate — and both defects below reached `main` with `check:mobile` green.

// ── An activity's details go under its name, not beside it ─────────────────
//
// `Group … wrap="nowrap"` held the name and the details on one line at every
// width, and the details column had no floor of zero, so at 360px the two ran
// into each other. `sweep-mobile.mjs` cannot see this: its `covered` probe
// only asks about controls, and text over text is not one.
const cards = () => evaluate(`
    return [...document.querySelectorAll("[data-testid=card]")]
        .map(card => {
            const row = card.firstElementChild;
            const props = card.querySelector("[data-testid=activity-props]");
            const line = card.querySelector("[data-testid=activity-prop]");
            if (!row || !props || !line) return null;
            const p = props.getBoundingClientRect();
            const r = row.getBoundingClientRect();
            const name = row.children[0].getBoundingClientRect();
            return {
                name: card.innerText.split("\\n")[0].slice(0, 22),
                wrap: getComputedStyle(row).flexWrap,
                under: Math.round(p.top - name.bottom),
                fills: Math.round((p.width / r.width) * 100),
                fz: Math.round(parseFloat(getComputedStyle(line).fontSize)),
            };
        })
        .filter(Boolean);
`);

await send("Page.setDeviceMetricsOverride",
    { width: 360, height: 740, deviceScaleFactor: 1, mobile: true });
await go(`${APP}/activities?fakeUser=amy`,
    `document.querySelectorAll("[data-testid=card]").length > 0`);
await wait(1200);

const narrow = await cards();
// The guard. A selector that finds nothing has no worst case, and every
// assertion under it would pass by measuring an empty list.
check(narrow.length >= 2, `${narrow.length} activities on the list carry details of their own`);
check(narrow.every(c => c.under >= -1),
    `on a phone the details sit below the name (${narrow.map(c => c.name + " " + c.under + "px").join(", ")})`);
check(narrow.every(c => c.fills >= 90),
    `taking the row's width rather than a column of it (${narrow.map(c => c.fills + "%").join(", ")})`);
check(narrow.every(c => c.fz <= 13),
    `and in a smaller face (${narrow.map(c => c.fz + "px").join(", ")})`);
await shot("mobile-activities");

// **The other half, or stacking them at every width would pass this.**
await send("Page.setDeviceMetricsOverride",
    { width: 1500, height: 1200, deviceScaleFactor: 1, mobile: false });
await wait(1000);
const wide = await cards();
check(wide.length >= 2 && wide.every(c => c.under < 0),
    "while on a desktop they stay on the name's own line");
// The rule itself, not just the room. A desktop window is wide enough that the
// two columns fit whatever `flex-wrap` says, so the arrangement above passes
// on space alone — this is what says the stacking is width-scoped.
check(wide.every(c => c.wrap === "nowrap") && narrow.every(c => c.wrap === "wrap"),
    `and the row is told so: ${wide[0].wrap} wide, ${narrow[0].wrap} narrow`);
check(wide.every(c => c.fz >= 15),
    `at the size they have always been (${wide.map(c => c.fz + "px").join(", ")})`);

// ── The visitor's menu, on the shell that is not the application's ─────────
//
// **The public shell only.** A signed-in session gets `AppShell.Navbar`, which
// is fixed and opaque — which is why only this one was broken. Both shells'
// burgers carry `data-testid=burger`, so which shell this is gets asserted
// first, or the check could pass by measuring the application's drawer.
//
// **Not `getComputedStyle(link).backgroundColor`.** The links are transparent
// before and after: the background belongs to the header. What is asked is
// what a finger asks — `elementFromPoint` at a link's own center — and whether
// the bar grew around the menu it opened, which is the whole of the fix.
await send("Page.setDeviceMetricsOverride",
    { width: 360, height: 740, deviceScaleFactor: 1, mobile: true });
await evaluate(`localStorage.clear(); sessionStorage.clear(); return true;`);
await go(`${APP}/login`, `document.querySelector("[data-testid=burger]") !== null`);
await wait(900);

check(await evaluate(`return document.querySelector("[data-testid=app-navbar]") === null;`),
    "the sign-in screen is the public shell, not the application's");
const closed = await evaluate(
    `return Math.round(document.querySelector("header").getBoundingClientRect().bottom);`);

await evaluate(`document.querySelector("[data-testid=burger]").click(); return true;`);
// `Collapse` animates, so this waits for the menu to have a height rather than
// for a number of milliseconds somebody guessed.
await until(`[...document.querySelectorAll("header a")]
    .filter(a => a.getBoundingClientRect().top >= ${closed} - 1).length > 0`, 10);
await wait(500);

const drawer = await evaluate(`
    const bar = document.querySelector("header");
    const entries = [...bar.querySelectorAll("a, button")]
        .filter(el => el.getBoundingClientRect().height > 0)
        .filter(el => el.getBoundingClientRect().top >= ${closed} - 1);
    const last = entries[entries.length - 1];
    return {
        count: entries.length,
        bottom: Math.round(bar.getBoundingClientRect().bottom),
        last: last ? Math.round(last.getBoundingClientRect().bottom) : null,
        covered: entries.map(el => {
            const box = el.getBoundingClientRect();
            const hit = document.elementFromPoint(
                Math.round(box.left + box.width / 2), Math.round(box.top + box.height / 2));
            return hit && hit !== el && !el.contains(hit) && !hit.contains(el)
                ? el.innerText.trim().slice(0, 16) + " under " + hit.tagName.toLowerCase()
                : null;
        }).filter(Boolean),
    };
`);
await shot("mobile-public-menu");

// The guard again: with no entries found, everything below is true of a menu
// that never opened.
check(drawer.count >= 2, `the burger opens the visitor's menu (${drawer.count} entries)`);
check(drawer.bottom > closed,
    `the bar grew rather than staying the height it was closed (${closed} to ${drawer.bottom})`);
check(drawer.last !== null && drawer.bottom >= drawer.last - 1,
    `and it contains what it opened (bar ends at ${drawer.bottom}, last entry at ${drawer.last})`);
check(drawer.covered.length === 0,
    `nothing is painted over the entries (${drawer.covered.join(", ") || "clear"})`);

report();
close();
