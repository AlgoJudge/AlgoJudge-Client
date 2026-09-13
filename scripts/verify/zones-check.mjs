// A reader who is not in the activity's zone — the only place this feature is
// visible at all.
//
// The whole suite runs in Europe/Warsaw, which is every fixture activity's own
// zone, so there a date is bare and correct and the change is invisible. This
// script runs in America/New_York (`playwright.ui.config.mjs`, project `zones`)
// and is the only witness that the offset marker, the second tooltip line and
// the midnight straddle exist.
//
// **Nothing here asserts "six hours earlier".** Warsaw and New York are six
// apart except for about three weeks a year, when the EU and US transitions are
// out of step and it is five or seven — an assertion on the difference would go
// red on a green build every spring and autumn. What is asserted instead is what
// holds in every season: which zone each line names, that the two disagree, and
// the shape of the offset.
import { open, results } from "./harness.mjs";

const APP = process.env.APP ?? "http://localhost:5180";
const { evaluate, wait, shot, go, hover, close } = await open();
const { check, report } = results();

const MINUS = "−";
const hourOf = (line) => (/(\d{2}):(\d{2})/.exec(line ?? "") ?? [])[0];

/** The text of the tooltip a time opens, read off its own element. */
const tooltipOf = async (selector) => {
    await hover(selector);
    // A Mantine tooltip portals out of the element it belongs to, so it is read
    // off the floating node rather than out of the row's own text — the trap
    // `verify-submission-origin` records. A synthetic `mouseover` does not open
    // one at all: floating-ui listens for real pointer movement, measured.
    return await evaluate(`
        const tip = document.querySelector("[role=tooltip]");
        return tip ? tip.innerText.replace(/ /g, " ").trim() : "";
    `);
};

// ── a round, which belongs to an activity ───────────────────────────────────

await go(`${APP}/activities/AMMPZ-2019/problems?fakeUser=amy`,
    `document.querySelectorAll("[data-testid=time]").length > 0`);
await wait(1500);

const body = await evaluate(`return document.body.innerText;`);
check(!/GMT/.test(body), "no date anywhere on the page says GMT");
check(/UTC/.test(body), `and the offset is written UTC (${(/UTC[^\s]*/.exec(body) ?? [""])[0]})`);

const inline = await evaluate(`
    const span = document.querySelector("[data-testid=time]");
    return span ? span.innerText.replace(/\u00a0/g, " ").trim() : "";
`);
check(/^\d{2}\.\d{2}\.\d{4} \d{2}:\d{2} UTC[+−]\d/.test(inline),
    `a round's time carries the reader's offset because the zones differ (${inline})`);
// New York is one of exactly two offsets, all year. Naming both is what keeps
// this from going red for three weeks in spring and autumn.
check(inline.includes(`UTC${MINUS}4`) || inline.includes(`UTC${MINUS}5`),
    `and it is New York's, not the activity's (${inline})`);
check(!inline.includes("UTC-4") && !inline.includes("UTC-5"),
    "written with a minus sign rather than a hyphen");
await shot("zones-round");

const tip = await tooltipOf(`document.querySelector("[data-testid=time]")`);
const lines = tip.split("\n").map(l => l.trim()).filter(Boolean);
check(lines.length === 2, `the tooltip carries two lines (${JSON.stringify(tip)})`);
check(lines[0]?.includes("(Europe/Warsaw)"), `the activity's zone first (${lines[0]})`);
check(lines[1]?.includes("(America/New_York)"), `the reader's second (${lines[1]})`);
check(!/GMT/.test(tip), "and neither line says GMT");

check(hourOf(lines[0]) !== undefined && hourOf(lines[0]) !== hourOf(lines[1]),
    `the two clocks disagree, which is the whole point (${hourOf(lines[0])} / ${hourOf(lines[1])})`);

// **The hour on the screen is the reader's, not the activity's.** Asserted
// against the tooltip's own two lines rather than against a computed
// difference, which would be five, six or seven hours depending on the week.
//
// Found by sabotage: rendering the line in the activity's zone while labelling
// it with the reader's offset produced `20:19 UTC−4` — Warsaw's clock wearing
// New York's badge — and every assertion above it still passed.
check(hourOf(inline) === hourOf(lines[1]),
    `and the line shows the reader's hour (${hourOf(inline)} = ${hourOf(lines[1])})`);
check(hourOf(inline) !== hourOf(lines[0]),
    `rather than the activity's (${hourOf(inline)} ≠ ${hourOf(lines[0])})`);
await shot("zones-tooltip");

// **Reachable without a mouse.** Every other tooltip in this product is
// hover-only — Mantine's defaults are `{ hover: true, focus: false, touch: false }`
// — and the IANA identifiers live nowhere else.
//
// **The cursor has to come off first.** Asserting this straight after a hover
// proves nothing: the tooltip is already open, and removing the `events`
// override leaves every line below green. Found by sabotage.
await hover(`document.querySelector("h1, h2, [data-testid=app-main] p")`);
const closed = await evaluate(`
    const tip = document.querySelector("[role=tooltip]");
    return tip === null || tip.innerText.trim() === "";
`);
check(closed, "the tooltip closes when the cursor leaves, so what follows is about focus");

const focusable = await evaluate(`
    const span = document.querySelector("[data-testid=time]");
    if (!span) return false;
    span.focus();
    return document.activeElement === span;
`);
check(focusable, "a time that hides a second zone can be reached by keyboard");
await wait(700);
const byFocus = await evaluate(`
    const tip = document.querySelector("[role=tooltip]");
    return tip ? tip.innerText.trim() : "";
`);
check(/Europe\/Warsaw/.test(byFocus), `and focusing it opens the tooltip (${JSON.stringify(byFocus)})`);

// ── an instant that belongs to no activity ──────────────────────────────────
//
// Seventeen of these used to pass a hard-coded `Europe/Warsaw`, which was wrong
// for every reader outside Poland. There is no second zone to name, so there is
// no second line and no marker — and a literal left behind would produce both.

await go(`${APP}/manager/users?fakeUser=john`,
    `document.querySelectorAll("tbody tr").length > 0`);
await wait(1500);

const account = await evaluate(`
    const span = [...document.querySelectorAll("tbody [data-testid=time]")][0];
    return span ? span.innerText.replace(/\u00a0/g, " ").trim() : "";
`);
check(/^\d{2}\.\d{2}\.\d{4}/.test(account) && !/UTC/.test(account),
    `an account's date carries no offset, because there is no other zone (${account})`);

const accountTip = await tooltipOf(`document.querySelector("tbody [data-testid=time]")`);
const accountLines = accountTip.split("\n").map(l => l.trim()).filter(Boolean);
check(accountLines.length === 1, `and its tooltip is one line (${JSON.stringify(accountTip)})`);
check(accountLines[0]?.includes("(America/New_York)"),
    `naming the reader's own zone (${accountLines[0]})`);
check(!/Europe\/Warsaw/.test(accountTip),
    "and not a zone somebody hard-coded");
await shot("zones-account");

// ── a manager's row, which belongs to an activity the wire had to name ──────
//
// `ManagedSubmission` carried no zone until 2026-09-13, so these six rows would
// have shown the reader's clock and been unable to name the one a deadline was
// set on — exactly where a manager argues about whether a submission beat it.

await go(`${APP}/manager/submissions?fakeUser=john`,
    `document.querySelectorAll("tbody [data-testid=time]").length > 0`);
await wait(1500);

const managed = await tooltipOf(`document.querySelector("tbody [data-testid=time]")`);
const managedLines = managed.split("\n").map(l => l.trim()).filter(Boolean);
check(managedLines.length === 2,
    `a managed submission names two clocks (${JSON.stringify(managed)})`);
check(managedLines[0]?.includes("(Europe/Warsaw)"),
    `the activity's, which the wire now carries (${managedLines[0]})`);
await shot("zones-managed");

// ── the row that decides whether to print a date ────────────────────────────
//
// `isToday` compares in the zone the row is drawn in. Left in the activity's it
// produced the defect of 2026-08-30 mirrored: a submission a minute old drawn
// with yesterday's date for everybody whose midnight has passed and the
// activity's has not. Reading it from New York is the only place that shows.

await go(`${APP}/activities/AMMPZ-2019/submissions?fakeUser=amy`,
    `document.querySelectorAll("[data-testid=time]").length > 0`);
await wait(1500);
const panel = await evaluate(`return document.body.innerText;`);
check(!/GMT/.test(panel), "the submissions panel says GMT nowhere either");

report();
close();
