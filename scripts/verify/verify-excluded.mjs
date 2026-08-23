// A manager rules a submission out of the ranking, and the screens follow.
//
// **What this covers that a Server test cannot**: the two screens, and the fact
// that the board a reader is already looking at loses the row. The rule itself —
// what still counts, what stops counting — is asserted in `ExclusionTests` on
// the Server, against a real database.
//
// **What it deliberately does not claim.** The allowance staying spent is the
// decision most easily broken in silence, and this script cannot see it: the
// fake computes `submissionsLeft` from a dataset built once at load, so an
// exclusion made during a visit could never move it and a check here would pass
// whatever the code did. It is asserted on the Server, driving a real refusal.
//
// The seed carries one excluded attempt of its own — `student-me`'s perfect run
// on `tablice` — chosen so that `verify-points` reddens on 200/200 if the filter
// ever stops working, without that script knowing anything about exclusions.
import { open, results } from "./harness.mjs";

const APP = process.env.APP ?? "http://localhost:5180";
const { evaluate, wait, shot, go, visit, click, close } = await open();
const { check, report } = results();

const EXCLUDED = "sub-series-w1-student-me-tablice-2200";
const COUNTED = "sub-series-w1-student-me-tablice-2100";

const body = () => evaluate(`return document.body.innerText;`);

/** Waits for a condition rather than for as long as it could take. */
const until = async (expression, tries = 30) => {
    for (let attempt = 0; attempt < tries; attempt++) {
        if (await evaluate(`return ${expression};`)) return true;
        await wait(200);
    }
    return false;
};

/** The ids the board is carrying right now. */
const boardRows = () => evaluate(`
    const cells = [...document.querySelectorAll("[class*=AppShell-main] tbody tr td")]
        .map(c => c.innerText.trim());
    return cells.slice(0, 6);
`);

// ── 1. The participant is told, on their own submission ─────────────────────
//
// The result above the notice stays what it was — judged, accepted, a score —
// which is the whole reason the notice has to be there: without it the screen
// and the ranking describe one submission differently.

await go(`${APP}/activities/PROG-1-LA/submissions/${EXCLUDED}?fakeUser=amy`,
    `document.body.innerText.includes("Zgłoszenie")`);
await wait(2000);
const theirs = await body();

check(/nie jest liczone do rankingu/i.test(theirs),
    "the participant is told their submission is not counted");
check(/nadal liczy się do (twojego )?limitu/i.test(theirs),
    "and told that it still spends their allowance, which is the surprising half");
check(!/identyczne z cudzym/i.test(theirs),
    "and is not shown the manager's reason");
await shot("excluded-participant");

// ── 2. It keeps everything an exclusion does not rule on ────────────────────

check(/Accepted/i.test(theirs),
    "the verdict stays: an exclusion rules on what it counts for, not on what the judge said");

// ── 3. And it is nowhere on the board ───────────────────────────────────────
//
// `tablice` is worth 200 and the excluded run scored the Runner's full hundred.
// If it counted, this cell would read 200 rather than 160 — which is the same
// number `verify-points` guards from the other direction.

await visit("/activities/PROG-1-LA/ranking", `document.body.innerText.includes("Ranking")`);
await wait(2500);
const before = await boardRows();
check(before.some(cell => cell === "260"),
    `the board counts the attempts that count and not the ruled-out one (${before.join(" | ")})`);
await shot("excluded-board");

// ── 4. A manager rules one out, and the ruling shows ─────────────────────────

await go(`${APP}/manager/submissions/${COUNTED}?fakeUser=john`,
    `document.body.innerText.includes("Próby")`);
await wait(2000);

// Matched without case: a Mantine badge uppercases its text.
check(!/nie liczone/i.test(await body()),
    "a submission nobody ruled on carries no marker");

await click(`[...document.querySelectorAll("button")]
    .find(b => b.textContent.trim() === "Nie licz")`);
await wait(700);

const modal = await body();
check(/eksportu danych uczestnika/i.test(modal),
    "the form says the reason reaches the participant's data export, before one is written");
await shot("excluded-modal");

// The editor below renders a textarea of its own, so the modal's is addressed
// through the modal rather than as the page's only one.
await evaluate(`
    const field = document.querySelector("[class*=Modal-content] textarea");
    const setter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype, "value").set;
    setter.call(field, "Wysłane spoza sali");
    field.dispatchEvent(new Event("input", { bubbles: true }));
`);
await click(`[...document.querySelectorAll("[class*=Modal-content] button")]
    .find(b => b.textContent.trim() === "Nie licz")`);

check(await until(`/nie liczone/i.test(document.body.innerText)`),
    "and the submission carries the marker once ruled on");
await shot("excluded-manager");

// ── 5. Lifting it puts everything back ──────────────────────────────────────

await click(`[...document.querySelectorAll("button")]
    .find(b => b.textContent.trim() === "Licz ponownie")`);

check(await until(`!/nie liczone/i.test(document.body.innerText)`),
    "and lifting the ruling takes the marker away again");

report();
close();
