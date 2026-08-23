// Where a submission was sent from, on a judge's screen.
//
// The address, the browser and the session belong on the detail of one
// submission and **not** on the list of two hundred: a column of addresses is
// exposure for a question nobody asked of most of them.
//
// **What each half of that guards is worth being exact about.** The assertion
// that the list carries no addresses guards the *screen* — it fails the day
// somebody adds a column. It does **not** catch the fake carrying the fields in
// a payload the Server would not: measured by sabotage on 2026-08-23, putting
// them back on the fake's list rows left this passing, because the list draws
// only the columns it draws. The payload shape is asserted where it can be —
// `SubmissionOriginTests.A_judge_reads_it_in_the_detail_and_not_in_the_list` in
// the Server's suite, against the real DTO.
//
// The device is deliberately labelled as the browser and not as the machine. A
// page writes it, so whoever is using it can change it, and a room imaged from
// one disk reports one for every station. It answers *the same browser, two
// accounts*, and the tooltip says so in as many words.
import { open, results } from "./harness.mjs";

const APP = process.env.APP ?? "http://localhost:5180";
const { evaluate, wait, go, close } = await open();
const { check, report } = results();

const body = () => evaluate(`return document.body.innerText;`);

// ── the list carries no addresses ───────────────────────────────────────────

await go(`${APP}/manager/submissions?fakeUser=amy`,
    `document.querySelectorAll("tbody tr").length > 0`);
await wait(600);

const listed = await body();
const rows = await evaluate(`return document.querySelectorAll("tbody tr").length;`);
const spans = await evaluate(`return document.querySelectorAll("span[style*=pointer]").length;`);
check(rows > 0, `the submissions list renders (${rows} rows, ${spans} clickable)`);
check(
    !/\b10\.0\.5\.\d+\b/.test(listed) && !/\b203\.0\.113\.44\b/.test(listed),
    "and it shows no addresses");

// ── the detail carries them ─────────────────────────────────────────────────

// The row opens from a `<span onClick>` around the time, not from a link — the
// pattern this repository chose deliberately and keeps. Clicking the cell does
// nothing; the span is the handler.
const opened = await evaluate(`
    const rows = [...document.querySelectorAll("[class*=AppShell-main] tbody tr")];
    const clickable = rows[0]?.querySelector("span[style*=pointer]");
    if (!clickable) return false;
    clickable.click();
    return true;
`);
check(opened, "a submission can be opened from the list");

await wait(900);
const detail = await body();

check(/\b(10\.0\.5\.\d+|203\.0\.113\.44)\b/.test(detail),
    `the detail shows the address it arrived from (${/\b(?:10\.0\.5\.\d+|203\.0\.113\.44)\b/.exec(detail)?.[0] ?? "none"})`);

// Eight characters of the two ids, which is what the screen shows: a full UUID
// twice over is noise in a header that already carries a name and a time.
// Read off the badges rather than out of the page text. A `Tooltip` renders
// its child through a portal, and what `innerText` collapses is not always
// what the screen shows — which is what made these two look absent while the
// address beside them matched.
const badges = await evaluate(
    `return [...document.querySelectorAll("[class*=Badge-label]")].map(b => b.textContent);`);

check(badges.includes("01a02001"), `and the browser it named itself (${badges.join(", ")})`);
check(badges.includes("01a02000"), "and the session it was sent in");

await close();
report();
