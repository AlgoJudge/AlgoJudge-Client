// The ranking arithmetic: what a penalty charges for, and what a tie is.
//
// **No other check can see this.** The boards are assembled here — the Server
// sends results and no ranking, deliberately — so a wrong penalty is a wrong
// standing with a green lint, a green typecheck, a green build and a browser
// suite that had only ever asserted a table has rows in it. Three faults were
// live at once when this was written, and every one of them was found by reading
// rather than by anything failing: minutes rounded instead of floored, rows that
// tied numbered as though they had not, and twenty minutes charged for a
// submission the judge never returned a verdict for.
//
// No browser and no Server. `scoreboard.ts` is arithmetic over a plain object,
// which is the whole reason it is a module of its own and not something the
// renderers do while drawing.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = ".ranking-check";

execFileSync("npx", ["tsc", "src/renderers/ranking/scoreboard.ts",
    "--outDir", OUT, "--rootDir", "src",
    "--module", "esnext", "--target", "es2022", "--moduleResolution", "bundler", "--skipLibCheck",
    // TypeScript 6 makes naming files beside a tsconfig.json an error rather
    // than a silent ignore. This compiles a subset on purpose, so it opts out.
    "--ignoreConfig",
], { stdio: "inherit", shell: process.platform === "win32" });

// The application resolves extensionless imports through Vite; Node does not.
const addExtensions = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) addExtensions(path);
        else if (entry.name.endsWith(".js")) {
            writeFileSync(path, readFileSync(path, "utf8")
                .replace(/(from\s+")(\.[^"]*?)(")/g, (all, a, specifier, b) =>
                    specifier.endsWith(".js") ? all : `${a}${specifier}.js${b}`));
        }
    }
};
addExtensions(OUT);

const { icpcBoard, pointsBoard } = await import(`../${OUT}/renderers/ranking/scoreboard.js`);

let failed = 0;
const check = (ok, what) => {
    console.log(`${ok ? "  ok  " : " FAIL "} ${what}`);
    if (!ok) failed++;
};

// ── The feed, as the Server serves it ───────────────────────────────────────

const START = "2026-09-06T10:00:00Z";
const at = (minute, second = 0) =>
    new Date(Date.parse(START) + minute * 60000 + second * 1000).toISOString();

let sequence = 0;
/**
 * One submission.
 *
 * `frozen` is what the wire carries instead of an outcome, so it replaces the
 * state and the points rather than sitting beside them — the Server withholds
 * both, and a fixture that sent all three would be testing against a shape
 * nothing serves.
 */
const sent = (who, problem, minute,
    { state = "completed", points, frozen = false, second = 0 } = {}) => ({
    id: `s${++sequence}`,
    contestantId: who,
    seriesId: "r1",
    problemId: `p-${problem}`,
    problemSlug: problem,
    submittedAt: at(minute, second),
    ...(frozen
        ? { frozen: true }
        : { state, ...(points === undefined ? {} : { points }) }),
});

/**
 * One round of two problems, and whoever is named as competing in it.
 *
 * `null` for the start is an untimed activity, not "use the default": a default
 * parameter cannot tell `undefined` from an argument nobody passed, and this
 * check quietly asserted the timed case twice before it said `null`.
 */
const feed = (results, contestants = ["alice"], startDate = START) => ({
    series: [{
        id: "r1", name: "Round", frozen: false,
        ...(startDate === null ? {} : { startDate }),
        problems: [
            { id: "p-A", slug: "A", name: "A", maxPoints: 100 },
            { id: "p-B", slug: "B", name: "B", maxPoints: 100 },
        ],
    }],
    contestants: contestants.map(name => ({ id: name, name })),
    results,
});

const board = (results, contestants, startDate) =>
    icpcBoard(feed(results, contestants, startDate), true);
const cellOf = (results) => board(results)[0].cells.A;
const penaltyOf = (results, startDate) => board(results, undefined, startDate)[0].penalty;

const wrong = { points: 0 };
const partial = { points: 99 };
const right = { points: 100 };

// ── 1 — what twenty minutes are charged for ─────────────────────────────────

check(penaltyOf([sent("alice", "A", 20, right)]) === 20,
    "a problem solved first time costs the minute it was solved in");
check(penaltyOf([
    sent("alice", "A", 5, wrong),
    sent("alice", "A", 12, partial),
    sent("alice", "A", 20, right),
]) === 60,
    "and twenty minutes for each judged rejection before it: 20 + 2 x 20");
check(cellOf([sent("alice", "A", 5, partial), sent("alice", "A", 20, right)]).rejected === 1,
    "partial marks are a rejection — ICPC has no half a problem");

// ── 2 — nothing after the accepted submission counts ────────────────────────
//
// The rule is "every **previously** rejected run", and the word does the work:
// somebody who submits again out of habit, or whose rejudge is still in flight,
// has already paid for this problem.
for (const [what, extra] of [
    ["a wrong answer", wrong],
    ["a submission still being judged", { state: "queued" }],
    ["one withheld by the freeze", { frozen: true }],
    ["a second accepted one", right],
    ["an evaluation that failed", { state: "failed" }],
    ["one a manager cancelled", { state: "cancelled" }],
]) {
    const cell = cellOf([sent("alice", "A", 20, right), sent("alice", "A", 33, extra)]);
    check(cell.acceptedAt === 20 && cell.rejected === 0 && cell.pending === undefined,
        `${what} after the accepted submission changes nothing`);
}

// ── 3 — a submission nobody judged is not a rejection ───────────────────────
//
// `failed` is an infrastructure failure the Server stopped retrying and
// `cancelled` is a manager's doing. The Runner sends **no score at all** for the
// first, because a zero would read as a wrong answer on every board that shows
// it — and charging twenty minutes for it did exactly that in a second place.

check(penaltyOf([sent("alice", "A", 5, { state: "failed" }), sent("alice", "A", 20, right)]) === 20,
    "an evaluation that failed before the accepted one is not charged");
check(penaltyOf([sent("alice", "A", 5, { state: "cancelled" }), sent("alice", "A", 20, right)]) === 20,
    "and neither is one a manager cancelled");
check(penaltyOf([sent("alice", "A", 5, { state: "queued" }), sent("alice", "A", 20, right)]) === 20,
    "nor one still waiting for a verdict");

const mixed = cellOf([
    sent("alice", "A", 5, wrong),
    sent("alice", "A", 12, { state: "failed" }),
    sent("alice", "A", 20, right),
]);
check(mixed.rejected === 1 && penaltyOf([
    sent("alice", "A", 5, wrong),
    sent("alice", "A", 12, { state: "failed" }),
    sent("alice", "A", 20, right),
]) === 40,
    "the judged rejection standing beside them still is");
check(mixed.attempts === 3,
    "and attempts still says what was sent, which is a different number");

// ── 4 — a minute is a minute begun ──────────────────────────────────────────
//
// Floored, as every board this one is compared against floors. Rounding gave
// away half a minute nobody spent, on every solved problem.
for (const second of [0, 29, 30, 59]) {
    check(penaltyOf([sent("alice", "A", 20, { ...right, second })]) === 20,
        `a submission at 20 minutes and ${second} seconds is in the twentieth minute`);
}
check(penaltyOf([sent("alice", "A", 21, right)]) === 21,
    "and the twenty-first begins where it begins");
check(penaltyOf([sent("alice", "A", 20, right)], null) === 0,
    "an activity with no start has no minutes to count");

// ── 5 — an unsolved problem costs nothing ───────────────────────────────────

const unsolved = cellOf([sent("alice", "A", 5, wrong), sent("alice", "A", 12, wrong)]);
check(penaltyOf([sent("alice", "A", 5, wrong), sent("alice", "A", 12, wrong)]) === 0,
    "rejections on a problem nobody solved cost nothing");
check(unsolved.acceptedAt === undefined && unsolved.attempts === 2,
    "and the cell shows the attempts without a time");

// ── 6 — why a cell has nothing to show ──────────────────────────────────────
//
// Three reasons, and they are three different things to tell somebody. One
// label over all of them said *submitted during the freeze* above cells no
// freeze had touched.
check(cellOf([sent("alice", "A", 5, { frozen: true })]).pending === "frozen",
    "a withheld outcome says the freeze withheld it");
check(cellOf([sent("alice", "A", 5, { state: "queued" })]).pending === "judging",
    "one still queued says it is not judged yet");
check(cellOf([sent("alice", "A", 5, { state: "running" })]).pending === "judging",
    "and so does one being judged right now");
check(cellOf([sent("alice", "A", 5, { state: "failed" })]).pending === "unjudged",
    "an evaluation that failed says no verdict came back");
check(cellOf([sent("alice", "A", 5, { state: "cancelled" })]).pending === "unjudged",
    "and so does one a manager cancelled");
check(cellOf([sent("alice", "A", 5, wrong)]).pending === undefined,
    "a judged rejection is not pending at all");
check(cellOf([
    sent("alice", "A", 5, { state: "failed" }),
    sent("alice", "A", 8, { frozen: true }),
]).pending === "frozen",
    "and a freeze is named ahead of the rest, being the one somebody chose");

// ── 7 — a tie is a tie ──────────────────────────────────────────────────────

const tied = board([
    sent("alice", "A", 20, right),
    sent("bob", "A", 20, right),
    sent("carol", "A", 30, right),
], ["alice", "bob", "carol"]);
check(tied.map(row => row.rank).join(",") === "1,1,3",
    "two rows level on solves and penalty share a place, and the next is the position");

const separated = board([
    sent("alice", "A", 20, right),
    sent("bob", "A", 5, wrong),
    sent("bob", "A", 20, right),
], ["alice", "bob"]);
check(separated.map(row => row.rank).join(",") === "1,2",
    "one rejection apart is not level");

check(icpcBoard(feed([sent("alice", "A", 20, right)]), false).every(row => row.rank === undefined),
    "and nobody is placed where the reader may not see everybody's results");

// ── 8 — the points board, which shares the placing ──────────────────────────

const pointsOf = (results, contestants) => pointsBoard(feed(results, contestants), true);

const best = pointsOf([sent("alice", "A", 5, { points: 80 }), sent("alice", "A", 20, { points: 10 })]);
check(best[0].bySeries.r1.byProblem.A.points === 80,
    "the points board keeps the best ever awarded, not the last");

const pointsTie = pointsOf([
    sent("alice", "A", 5, { points: 50 }),
    sent("bob", "A", 5, { points: 50 }),
    sent("carol", "A", 5, { points: 10 }),
], ["alice", "bob", "carol"]);
check(pointsTie.map(row => row.rank).join(",") === "1,1,3",
    "and two people on the same total share a place there too");

check(pointsOf([sent("alice", "A", 5, { state: "failed" })])[0]
    .bySeries.r1.byProblem.A.pending === "unjudged",
    "a points cell says why it has nothing, in the same words as the ICPC one");

console.log(failed ? `\nFAILED: ${failed}` : "\nranking check passed");
process.exitCode = failed ? 1 : 0;
