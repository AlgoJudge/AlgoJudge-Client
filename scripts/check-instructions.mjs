// The numbers `CLAUDE.md` states about this repository, against the repository.
//
// **Every other check here is about the product; this one is about the file
// agents read as truth.** It is here because the same sentence went wrong twice
// in six weeks: the script table gained a row and the count beside it was
// carried forward rather than recounted, once when `check:seo` arrived and again
// when `check:time` did. The table was right both times, so nothing a reader
// would notice was wrong — only the number they would quote.
//
// The instruction those sentences carry is *"Count the rows"*, addressed to a
// person. That is what this replaces. `ci.yml` carries the same instruction —
// *"Keep this list and the one in CLAUDE.md the same"* — and had already been
// broken once when it was written down.
//
// **A reworded paragraph reddens this**, deliberately: each pattern below is
// anchored on a distinctive phrase, and a failure prints what it looked for. A
// number nobody can find is worse than a number nobody checks. Every space in
// those phrases is `\s+`, though, because prose rewraps: a check that forces one
// line break is a check that reddens on reflow, which teaches people to edit
// around it.
import { readFileSync } from "node:fs";

const fail = (message) => { console.error("FAIL:", message); process.exitCode = 1; };
const check = (condition, message) =>
    condition ? console.log("  ok  ", message) : fail(message);

const instructions = readFileSync("CLAUDE.md", "utf8");
const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
const readme = readFileSync("README.md", "utf8");
const scripts = Object.keys(JSON.parse(readFileSync("package.json", "utf8")).scripts);

/** The number words these paragraphs use, which is as high as they go. */
const WORDS = [
    "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
    "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
    "seventeen", "eighteen", "nineteen",
];
const TENS = { twenty: 20, thirty: 30, forty: 40 };

const numberOf = (word) => {
    const text = word.toLowerCase();
    const plain = WORDS.indexOf(text);
    if (plain >= 0) return plain;
    const [tens, units] = text.split("-");
    if (!(tens in TENS)) return NaN;
    return TENS[tens] + (units ? WORDS.indexOf(units) : 0);
};

/**
 * A number written as a word, taken from one anchored phrase.
 *
 * Returns `NaN` when the phrase is gone, which reddens the check that uses it
 * rather than passing on a number nobody supplied.
 */
const stated = (pattern, what) => {
    const found = pattern.exec(instructions);
    if (!found) { fail(`${what}: no sentence matches ${pattern}`); return NaN; }
    return numberOf(found[1]);
};

// ── the script table ────────────────────────────────────────────────────────
//
// `[a-z0-9:]` and not `[a-z:]`: `check:i18n` and `check:e2e` carry digits, and a
// pattern without them silently drops two rows — which is a miscount arriving
// through the thing that checks for miscounts.
const rows = [...instructions.matchAll(/^\| `npm run ([a-z0-9:]+)`/gm)].map(m => m[1]);

const missing = scripts.filter(name => !rows.includes(name));
check(missing.length === 0,
    "every script in package.json has a row in the table"
    + (missing.length ? `: ${missing.join(", ")} missing` : ` (${scripts.length})`));

const invented = rows.filter(name => !scripts.includes(name));
check(invented.length === 0,
    "and every row names a script that exists"
    + (invented.length ? `: ${invented.join(", ")} do not` : ""));

const tableCount = stated(
    /whole\s+of\s+`package\.json`'s\s+`scripts`\*\*\s+—\s+([a-z-]+)/, "the table count");
check(tableCount === scripts.length,
    `the count under the table is the number of scripts (says ${tableCount}, there are ${scripts.length})`);

// ── the gate ────────────────────────────────────────────────────────────────
//
// Job headers are two-space keys under `jobs:`; `on:` has a `push:` of its own
// above it, which is why the search starts after `jobs:` rather than at the top.
const jobs = workflow.slice(workflow.indexOf("\njobs:"));
const stepsByJob = new Map();
let job = null;
for (const line of jobs.split("\n")) {
    const header = /^ {2}([a-z][a-z0-9-]*):$/.exec(line);
    if (header) { job = header[1]; stepsByJob.set(job, []); continue; }
    const run = /npm run ([a-z0-9:]+)/.exec(line);
    if (run && job) stepsByJob.get(job).push(run[1]);
}

const all = [...stepsByJob.values()].flat();
const inBuild = stepsByJob.get("build") ?? [];
const checksInBuild = inBuild.filter(name => name.startsWith("check:"));
const checksInAll = all.filter(name => name.startsWith("check:"));

const gateSteps = stated(/\*\*([A-Za-z-]+)\s+npm\s+steps\s+gate/, "the gate step count");
check(gateSteps === all.length,
    `the gate names as many npm steps as ci.yml runs (says ${gateSteps}, ci.yml has ${all.length})`);

const inBuildCount = stated(/then\s+([a-z-]+)\s+`check:`\s+steps/, "the build-job check count");
check(inBuildCount === checksInBuild.length,
    `and as many check: steps in the build job (says ${inBuildCount}, ci.yml has ${checksInBuild.length})`);

const totalChecks = stated(/which\s+is\s+([a-z-]+)\s+`check:`\s+steps\s+in\s+all/, "the total check count");
check(totalChecks === checksInAll.length,
    `and as many check: steps in all (says ${totalChecks}, ci.yml has ${checksInAll.length})`);

// The build job's steps are also named one by one, between the em dash after
// "in the `build` job" and the one before "and `check:ui`". A named list drifts
// the same way a number does, and reading it is how somebody decides whether
// their new step is covered.
const listed = /in\s+the\s+`build`\s+job\s+—\s+([\s\S]*?)\s+—\s+and/.exec(instructions);
if (!listed) fail("the build job's steps are no longer listed one by one");
else {
    const named = [...listed[1].matchAll(/`(check:[a-z0-9:]+)`/g)].map(m => m[1]);
    const absent = checksInBuild.filter(name => !named.includes(name));
    const extra = named.filter(name => !checksInBuild.includes(name));
    check(absent.length === 0 && extra.length === 0,
        "and names each of them"
        + (absent.length ? `: ${absent.join(", ")} not named` : "")
        + (extra.length ? `: ${extra.join(", ")} named but not run` : ""));
}

// **`README.md` carries the same list a third time**, for a reader who is not
// an agent. It was found one short here — `check:seo` had gated since
// 2026-09-06 and was never added — which is the case for checking it: three
// copies drift independently, and the one nobody edits drifts silently.
const inReadme = /script\s+CI\s+runs:\s+([\s\S]*?)\s+in\s+the\s+`build`/.exec(readme);
if (!inReadme) fail("README.md no longer lists the check: steps CI runs");
else {
    const named = [...inReadme[1].matchAll(/`(check:[a-z0-9:]+)`/g)].map(m => m[1]);
    const absent = checksInBuild.filter(name => !named.includes(name));
    const extra = named.filter(name => !checksInBuild.includes(name));
    check(absent.length === 0 && extra.length === 0,
        "README.md names the same build-job steps"
        + (absent.length ? `: ${absent.join(", ")} not named` : "")
        + (extra.length ? `: ${extra.join(", ")} named but not run` : ""));
}

console.log(`  ---  ${scripts.length} scripts, ${all.length} gating npm steps, ${checksInAll.length} of them check:`);
