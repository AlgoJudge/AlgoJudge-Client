// What a submission carries, and who is allowed to read each part of it.
import { open, results } from "./harness.mjs";

const APP = process.env.APP ?? "http://localhost:5180";
const { evaluate, wait, shot, go, visit, click, close } =
    await open();
const { check, report } = results();

/** The application's own area. The panel in the corner says "Wyślij" too. */
const main = () => evaluate(`
    const area = document.querySelector("[class*=AppShell-main]");
    return {
        text: (area?.innerText ?? "").replace(/\\s+/g, " ").trim(),
        rows: area?.querySelectorAll("tbody tr").length ?? 0,
    };
`);

// A compilation failure of the reader's own: it has a log and no result
// document, which is the pair worth checking — the contest publishes the table
// and keeps the log to itself.
const FAILED = "sub-series-r1-team-7-A-57";
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
check(/nie ma wyników testów/i.test(asParticipant.text),
    "and a run that failed as infrastructure shows no result table either");
await shot("att-participant");

// ── 3. The same submission, read by a manager ───────────────────────────────
// The table decides what reaches a **participant**. Whoever runs the activity
// reads everything — the log was kept for them.
// A full load: the manager area sits behind its own guard, and `visit` reaches
// it before the permissions that decide whether it may draw.
await go(`${APP}/manager/submissions/${FAILED}?fakeUser=amy`,
    `!document.querySelector("[class*=Loader-root]") && document.body.innerText.length > 200`);
await wait(2500);
const asManager = await main();
check(/Log oceny/i.test(asManager.text),
    "the manager reads the log the participant was not sent");
check(/compilation failed|error/i.test(asManager.text),
    "and it carries what the compiler said");
await shot("att-manager");

// ── 4. The source is a stored file, fetched by id ───────────────────────────
await visit(`/activities/AMMPZ-2019/submissions/${PASSED}/code`, `document.body.innerText.length > 100`);
await wait(2500);
const code = await main();
check(/solution\.cpp/.test(code.text), `the source opens under its uploaded name (${code.text.slice(0, 60)})`);
check(/include|main/.test(code.text), "and its bytes are there");
await shot("att-source");

report();
close();
