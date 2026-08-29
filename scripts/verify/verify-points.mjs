// What a problem is worth in its round, and what it may be written in.
import { open, results } from "./harness.mjs";

const APP = process.env.APP ?? "http://localhost:5180";
const { evaluate, wait, shot, go, visit, click, close } =
    await open();
const { check, report } = results();

const main = () => evaluate(`
    const area = document.querySelector("[data-testid=app-main]");
    return (area?.innerText ?? "").replace(/\\s+/g, " ").trim();
`);

// The course, whose assignments are deliberately unequal: `tablice` is worth
// 200 and `rekurencja` 50, against the Runner's own hundred.
await go(`${APP}/activities/PROG-1-LA/problems?fakeUser=amy`, `document.body.innerText.includes("Zaj")`);
await wait(2500);
const problems = await main();

// ── 1. The assignment's scale, not the Runner's ─────────────────────────────
check(/\[tablice\][^[]*160 \/ 200/.test(problems),
    "a problem worth 200 shows the judge's 80 as 160 out of 200");
check(/\[rekurencja\][^[]*25 \/ 50/.test(problems),
    "and one worth 50 shows a half-mark as 25 out of 50");
check(/\[petle\][^[]*100 \/ 100/.test(problems),
    "while one that says nothing keeps the problem's own scale");
await shot("pts-problems");

// ── 2. The same library problem, attached twice, scored apart ───────────────
// `petle` and `rekurencja` are both `prob-petle`. Solving one must not move the
// other, and each carries its own value.
check(/\[petle\][^[]*ROZWIĄZANE/i.test(problems) && /\[rekurencja\][^[]*CZĘŚCIOWO/i.test(problems),
    "one library problem attached twice keeps a standing per assignment");

// ── 3. The submission carries the same pair as the problem ─────────────────
await visit("/activities/PROG-1-LA/submissions/sub-series-w1-student-me-tablice-2100",
    `document.body.innerText.includes("Zgłoszenie")`);
await wait(2500);
const submission = await main();
check(/160 \/ 200/.test(submission),
    `the submission is on the assignment's scale too (${/Wynik: [^ ]+ \/ [^ ]+/.exec(submission)?.[0]})`);

// The Runner's document keeps its own arithmetic: rescaling somebody else's
// document would be editing it. The header above says 160/200, the table below
// adds to the package's hundred, and each is honest about whose numbers it is.
check(/30 \/ 30|40 \/ 40|0 \/ 40/.test(submission),
    "while the per-test table stays on the Runner's scale");
await shot("pts-submission");

// ── 4. The board sums what the assignments are worth ───────────────────────
await visit("/activities/PROG-1-LA/ranking", `document.body.innerText.includes("Ranking")`);
await wait(2500);
const board = await evaluate(`
    const cells = [...document.querySelectorAll("[data-testid=app-main] tbody tr td")]
        .map(c => c.innerText.trim());
    return { total: Number(cells[2]), rounds: [Number(cells[3]), Number(cells[4])] };
`);
check(board.total === board.rounds[0] + board.rounds[1],
    `the total is the rounds added up (${board.total} = ${board.rounds.join(" + ")})`);
check(board.rounds[0] === 260,
    `and a round is its problems on their own scales (${board.rounds[0]}, from 100 + 160)`);
// The second round holds the one worth having: a problem marked out of **one**
// by an external judge and worth five here, so this line proves the sum spans
// problems marked out of different maxima, not merely problems worth different
// amounts. Read as `round(1/1 × 5)` it is 5; read as `round(1/100 × 5)` it is
// zero, which is what both the Server and this fake did until 2026-08-16.
check(board.rounds[1] === 30,
    `and one marked out of one still counts for its full value (${board.rounds[1]}, from 25 + 5)`);
await shot("pts-board");

// ── 5. The assignment decides the languages, and the form says their names ──
//
// **Two things changed here on 2026-08-22**, and this section was asserting the
// old shape of both.
//
// The list is the *assignment's* now, not the activity's: it lives in `spec` for
// this form and in `config` for the Runner, and `Activity.Languages` is gone. And
// the select shows **labels** rather than ids — `C++20 (GCC)`, not `cpp` — because
// an id carries a toolchain now and `cpp17-gcc` is not a thing to show a person.
//
// The fake no longer refuses a language either, and that mirrors the Server: the
// language is one member of an opaque document neither of them reads, so the
// refusal is the Runner's, against the set the assignment stated.
await visit("/activities/PROG-1-LA/submit/sortowanie", `document.body.innerText.includes("Język")`);
await wait(2500);
await click(`[...document.querySelectorAll("[data-testid=app-main] input")]
    .find(i => /python|c\\+\\+/i.test(i.value))`);
await wait(900);
const offered = await evaluate(`
    return [...document.querySelectorAll("[data-testid=combobox-option], [role=option]")]
        .map(o => o.textContent.trim());
`);
check(offered.length === 1 && offered[0] === "Python 3 (CPython)",
    `an assignment that takes Python alone offers Python alone, by name (${offered.join(", ")})`);
await shot("pts-languages");

// And the contest, which takes three, still offers three — two C++ toolchains
// that would have been one entry called `cpp` before the catalogue existed.
await visit("/activities/AMMPZ-2019/submit/D", `document.body.innerText.includes("Język")`);
await wait(2500);
await click(`[...document.querySelectorAll("[data-testid=app-main] input")]
    .find(i => /python|c\\+\\+/i.test(i.value))`);
await wait(900);
const contest = await evaluate(`
    return [...document.querySelectorAll("[data-testid=combobox-option], [role=option]")]
        .map(o => o.textContent.trim());
`);
check(contest.includes("C++20 (GCC)") && contest.includes("C++17 (GCC)")
        && contest.includes("Python 3 (CPython)"),
    `another assignment offers its own three (${contest.join(", ")})`);
// The standard alone is not a toolchain, and neither is a bare id. A select
// showing either is the catalogue not having reached this screen.
check(!contest.some(o => /^(cpp|python|java|cpp17|cpp20)$/.test(o)),
    `and none of them is shown as a bare id (${contest.join(", ")})`);

report();
close();
