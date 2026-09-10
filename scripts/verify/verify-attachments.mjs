// What a submission carries, and who is allowed to read each part of it.
import { open, results } from "./harness.mjs";

const APP = process.env.APP ?? "http://localhost:5180";
const { evaluate, wait, shot, go, visit, click, close } =
    await open();
const { check, report } = results();

/** The application's own area. The panel in the corner says "Wyślij" too. */
const main = () => evaluate(`
    const area = document.querySelector("[data-testid=app-main]");
    return {
        text: (area?.innerText ?? "").replace(/\\s+/g, " ").trim(),
        rows: area?.querySelectorAll("tbody tr").length ?? 0,
    };
`);

// Three of the reader's own, because the contest's rule cuts differently
// through each: it publishes the per-test table and keeps the log to itself.
//
// `FAILED` is a **compilation error**, which is a judged verdict — it has a log
// and a document whose every test carries that verdict. `UNJUDGED` is an
// evaluation that failed, which has a log and **no document at all**: nobody
// ruled on the program, so there is nothing to tabulate.
const FAILED = "sub-series-r1-team-7-A-57";
const UNJUDGED = "sub-series-r1-team-7-D-65";
const PASSED = "sub-series-r1-team-7-A-98";

// ── 1. The per-test table comes out of an attachment ────────────────────────
await go(`${APP}/activities/AMMPZ-2019/submissions/${PASSED}?fakeUser=amy`,
    `document.body.innerText.includes("Zgłoszenie")`);
await wait(2500);
const passed = await main();
check(passed.rows > 0, `a judged submission draws its test table (${passed.rows} rows)`);
check(/1a|2a|3a/.test(passed.text), "with the tests the Runner's document names");
await shot("att-details");

// ── 2. The log is withheld from the participant, in this activity ───────────
await visit(`/activities/AMMPZ-2019/submissions/${FAILED}`, `document.body.innerText.includes("Zgłoszenie")`);
await wait(2500);
const asParticipant = await main();
check(!/Log oceny/i.test(asParticipant.text),
    "a contest keeps the compiler log to its managers");
// A compilation error is judged, so it has a table — and **no test in it
// passed**, because nothing was built to run. A document showing 30/30 beside
// `COMPILATION ERROR` describes a program that never existed.
check(asParticipant.rows > 0 && !/30 \/ 30/.test(asParticipant.text),
    `a compilation error tabulates its tests, none of them passing (${asParticipant.rows} rows)`);
await shot("att-participant");

// ── 2b. A run nobody judged has no table to publish ─────────────────────────
await visit(`/activities/AMMPZ-2019/submissions/${UNJUDGED}`, `document.body.innerText.includes("Zgłoszenie")`);
await wait(2500);
const unjudged = await main();
check(/nie ma wyników testów/i.test(unjudged.text),
    "an evaluation that failed shows no result table");
check(!/Log oceny/i.test(unjudged.text),
    "and the judge's own message is a log like any other, so it stays with the managers");

// ── 3. The same submission, read by a manager ───────────────────────────────
// The table decides what reaches a **participant**. Whoever runs the activity
// reads everything — the log was kept for them.
// A full load: the manager area sits behind its own guard, and `visit` reaches
// it before the permissions that decide whether it may draw.
await go(`${APP}/manager/submissions/${FAILED}?fakeUser=amy`,
    `!document.querySelector("[data-testid=loader]") && document.body.innerText.length > 200`);
await wait(2500);
const asManager = await main();
check(/Log oceny/i.test(asManager.text),
    "the manager reads the log the participant was not sent");
check(/compilation failed|error/i.test(asManager.text),
    "and it carries what the compiler said");
await shot("att-manager");

// ── 4. The source is a stored file, fetched by id ───────────────────────────
// **Opened from the submission, because the source has no address of its own.**
// It was a screen until 2026-09-10 and is a modal now, wherever it is reached
// from — so it is read out of the window rather than out of the page.
await visit(`/activities/AMMPZ-2019/submissions/${PASSED}`, `document.body.innerText.length > 100`);
await wait(2000);
await click(`document.querySelector("[data-testid=show-code]")`);
await wait(2500);
const code = await evaluate(`
    const m = document.querySelector("[data-testid=modal]");
    return { text: (m?.innerText ?? "").replace(/\\s+/g, " ").trim() };
`);
check(/solution\.cpp/.test(code.text), `the source opens under its uploaded name (${code.text.slice(0, 60)})`);
check(/include|main/.test(code.text), "and its bytes are there");
await shot("att-source");

report();
close();
