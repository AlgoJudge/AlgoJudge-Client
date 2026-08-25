// The exchange bundle: round-tripped, and the partition checked against the API
// shapes it is a partition of.
//
// Built on the pattern `check-package.mjs` set: compile the pure modules with
// `tsc` and run them in Node, with no browser and no Server. `collect.ts` and
// `apply.ts` are deliberately not here — they talk to the API, and what they do
// is covered by `check:ui` against the fake.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = ".exchange-check";

execFileSync("npx", ["tsc",
    "src/exchange/types.ts", "src/exchange/bundle.ts", "src/exchange/plan.ts",
    "src/exchange/dates.ts", "src/exchange/project.ts",
    "--outDir", OUT, "--rootDir", "src",
    "--module", "esnext", "--target", "es2022", "--moduleResolution", "bundler", "--skipLibCheck",
], { stdio: "inherit", shell: process.platform === "win32" });

// The application resolves extensionless imports through Vite; Node does not.
//
// `dayjs/plugin/utc` needs the same treatment and is not relative: dayjs ships
// no `exports` map for its plugins, so Node resolves the path literally and
// wants the extension. `dates.ts` is the only file here that reaches for one,
// and it does because moving a date on a wall clock is the rule this bundle
// shares with the Server.
const addExtensions = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) addExtensions(path);
        else if (entry.name.endsWith(".js")) {
            writeFileSync(path, readFileSync(path, "utf8")
                .replace(/(from\s+")(\.[^"]*?|dayjs\/plugin\/[^"]*?)(")/g, (all, a, specifier, b) =>
                    specifier.endsWith(".js") ? all : `${a}${specifier}.js${b}`));
        }
    }
};
addExtensions(OUT);

const { CARRIED, NOT_CARRIED, FIELDS, BUNDLE_TYPE, statementLanguage, isStatement } =
    await import(`../${OUT}/exchange/types.js`);
const { writeBundle, readBundle, weigh, danglingAssignments, REFUSE_BYTES } =
    await import(`../${OUT}/exchange/bundle.js`);
const { planImport, summarise, freeSlug } = await import(`../${OUT}/exchange/plan.js`);
const { shiftTo, anchorOf } = await import(`../${OUT}/exchange/dates.js`);
const { projectActivity, projectSeries, projectProblem } = await import(`../${OUT}/exchange/project.js`);

const fail = (message) => { console.error("FAIL:", message); process.exitCode = 1; };
const ok = (message) => console.log("  ok  ", message);
const check = (condition, message) => condition ? ok(message) : fail(message);

// ── 1. The partition covers every field of every shape ──────────────────────
//
// **The check that matters most, and the cheapest.** `FIELDS` is forced
// complete by the compiler — `Record<keyof T, true>` admits no missing key — so
// this compares two lists that cannot silently fall behind the API. It is the
// Client's answer to `CopiedFieldsTests` on the Server, and neither can see the
// other.

for (const shape of ["activity", "series", "assignment", "problem"]) {
    const classified = new Set([...CARRIED[shape], ...NOT_CARRIED[shape]]);
    const actual = new Set(FIELDS[shape]);

    const unclassified = [...actual].filter(f => !classified.has(f)).sort();
    check(unclassified.length === 0,
        `every field of ${shape} is classified${unclassified.length ? `: missing ${unclassified.join(", ")}` : ""}`);

    const stale = [...classified].filter(f => !actual.has(f)).sort();
    check(stale.length === 0,
        `and nothing is listed that the shape no longer has${stale.length ? `: ${stale.join(", ")}` : ""}`);
}

// ── 2. A bundle round-trips ─────────────────────────────────────────────────

const bytes = (text) => new TextEncoder().encode(text);

const files = new Map([
    ["aaa", bytes("# Spójność grafu\n")],
    ["bbb", bytes("PK-not-really-a-zip")],
    ["ccc", bytes("# Regulamin\n")],
]);

const bundle = {
    type: BUNDLE_TYPE,
    exportedAt: "2026-08-25T10:00:00.000Z",
    source: { instance: "example.edu.pl", activity: "AMMPZ-2019" },
    kind: "activity",
    problems: [
        {
            slug: "spojnosc-grafu", name: "Spójność grafu", type: "standard-io@1",
            external: false, note: "v3", props: { marker: 1 },
            files: [
                { name: "content.md", scope: "participant", sha256: "aaa" },
                { name: "package.zip", scope: "runner", sha256: "bbb" },
            ],
        },
    ],
    activity: {
        slug: "AMMPZ-2019", name: "Mistrzostwa", type: "contest@1", rankingType: "icpc",
        timeZone: "Europe/Warsaw",
        startDate: "2026-03-02T08:00:00.000Z", endDate: "2026-03-02T14:00:00.000Z",
        modules: { questions: true }, scoreVisibility: "everyone",
        attachmentVisibility: [{ name: "source", visibility: "participant" }],
        props: { theme: "dark" }, joinPolicy: "open", unlisted: true,
        hideEndedSeriesProblems: true, maxUploadBytes: 12345, maxAttachments: 5,
        maxSubmissionsPerProblem: 7, runnerTags: ["lab-north"],
        documents: [{ kind: "rules", language: undefined, title: "Regulamin", sha256: "ccc" }],
        series: [{
            slug: "runda-1", name: "Runda 1", order: 1,
            startDate: "2026-03-02T08:00:00.000Z", endDate: "2026-03-02T12:00:00.000Z",
            revealProblemCount: false,
            rankingFreezeAt: "2026-03-02T11:00:00.000Z",
            rankingRevealAt: "2026-03-02T13:00:00.000Z",
            rankingVisibleFrom: "2026-03-02T08:00:00.000Z",
            rankingVisibleTo: "2026-04-02T08:00:00.000Z",
            importance: 30, importanceScope: "installation",
            addressRules: [{ network: "192.168.7.0/24", note: "the room" }],
            restrictionsEnabled: false, runnerTags: ["lab-north", "quiet"],
            assignments: [{
                problemSlug: "spojnosc-grafu", slug: "A", name: "Zadanie A", order: 1,
                config: { languages: ["cpp17-gcc"] }, spec: { languages: ["cpp17-gcc"] },
                props: { marker: 2 }, maxPoints: 42, maxUploadBytes: 4096,
                maxAttachments: 3, maxSubmissions: 9,
            }],
        }],
    },
};

const archive = await writeBundle({ bundle, files });
const back = await readBundle(new Uint8Array(await archive.arrayBuffer()));

check(back.bundle.type === BUNDLE_TYPE, "the archive names its format");
check(back.files.size === files.size, `every file came back (${back.files.size})`);
for (const [sha256, content] of files) {
    const same = back.files.get(sha256);
    check(same && Buffer.from(same).equals(Buffer.from(content)), `${sha256} came back byte for byte`);
}

// **Field for field, against the declared list**, which is the half a
// `JSON.stringify` comparison would pass without checking: a bundle that
// dropped a field on the way out and back would still match itself.
const compare = (shape, before, after) => {
    for (const field of CARRIED[shape]) {
        const mine = JSON.stringify(before[field]);
        const theirs = JSON.stringify(after[field]);
        check(mine === theirs, `${shape}.${field} survived (${mine ?? "undefined"})`);
    }
};

compare("activity", bundle.activity, back.bundle.activity);
compare("series", bundle.activity.series[0], back.bundle.activity.series[0]);
compare("assignment", bundle.activity.series[0].assignments[0], back.bundle.activity.series[0].assignments[0]);
compare("problem", bundle.problems[0], back.bundle.problems[0]);

check(JSON.stringify(back.bundle.problems[0].note) === JSON.stringify(bundle.problems[0].note)
    && JSON.stringify(back.bundle.problems[0].props) === JSON.stringify(bundle.problems[0].props),
    "and the version's note and props with it");

// ── 3. What the reader refuses ──────────────────────────────────────────────
//
// Each of these would otherwise import a problem whose statement is missing or
// whose package cannot be judged — found by the first participant to open it.

const refuses = async (what, make) => {
    try {
        await readBundle(await make());
        fail(`${what} was accepted`);
    } catch (e) {
        ok(`${what} is refused (${e.message.slice(0, 60)})`);
    }
};

const { zipSync } = await import("fflate");
const encode = (value) => new TextEncoder().encode(JSON.stringify(value));

await refuses("an archive with no manifest",
    async () => zipSync({ "files/aaa": bytes("x") }));
await refuses("a manifest that is not JSON",
    async () => zipSync({ "bundle.json": bytes("{{{") }));
await refuses("an archive of another format",
    async () => zipSync({ "bundle.json": encode({ ...bundle, type: "sinolpack@1" }) }));
await refuses("a manifest naming a file the archive does not hold",
    async () => zipSync({ "bundle.json": encode(bundle) }));

// ── 4. An assignment naming a problem the bundle does not carry ─────────────

const orphaned = structuredClone(bundle);
orphaned.activity.series[0].assignments.push({
    problemSlug: "nie-ma-takiego", slug: "B", order: 2,
});
check(danglingAssignments(orphaned).join() === "nie-ma-takiego",
    `a dangling assignment is reported (${danglingAssignments(orphaned).join()})`);
check(danglingAssignments(bundle).length === 0, "and a whole bundle reports none");

// ── 5. Matching against the library: slug and content, never slug alone ─────

const library = [
    { id: "p-same", slug: "spojnosc-grafu", name: "Spójność grafu", archived: false, sha256: ["aaa", "bbb"] },
];
const same = planImport(bundle, library);
check(same.problems[0].action === "reuse" && !same.problems[0].asks,
    `a problem already here byte for byte is reused (${same.problems[0].action})`);

const different = planImport(bundle, [{ ...library[0], id: "p-other", sha256: ["zzz"] }]);
check(different.problems[0].asks,
    "a slug that matches with different bytes is a question");
check(different.problems[0].action === "beside" && different.problems[0].besideSlug === "spojnosc-grafu-2",
    `and is proposed beside it (${different.problems[0].besideSlug})`);

const fresh = planImport(bundle, []);
check(fresh.problems[0].action === "create" && !fresh.problems[0].asks,
    `a problem nothing holds is created (${fresh.problems[0].action})`);

// **The order of the digests must not matter.** A library listing them the
// other way round is the same problem, and a comparison over arrays would have
// called it a different one and asked a question nobody needed to answer.
const reordered = planImport(bundle, [{ ...library[0], sha256: ["bbb", "aaa"] }]);
check(reordered.problems[0].action === "reuse", "the digests are compared as a set, not a sequence");

// A subset must not pass for a match: a library problem holding only the
// statement is missing its package, and reusing it attaches something nothing
// can judge.
const partial = planImport(bundle, [{ ...library[0], sha256: ["aaa"] }]);
check(partial.problems[0].asks, "a library problem holding only some of the bytes asks");

// **An archived problem still holds its slug**, and the library screen hides it
// — so a plan built from the default listing proposed creating something the
// database already had, and the import failed at its first write. Found by
// `verify-exchange` against the fake, whose `tablice` is retired.
const retired = planImport(bundle, [{ ...library[0], archived: true }]);
check(retired.problems[0].asks,
    "a retired problem holding the same bytes is still a question");
check(retired.problems[0].action === "beside" && retired.problems[0].found?.archived === true,
    `and is proposed beside it rather than un-retiring somebody's problem (${retired.problems[0].action})`);

check(summarise(fresh).create === 1 && summarise(same).reuse === 1, "the summary counts what the plan says");
check(freeSlug("a", new Set(["a", "a-2"])) === "a-3", "a free slug steps past what is taken");

// ── 6. The dates move on the wall clock ─────────────────────────────────────
//
// **The rule the Server applies when it duplicates an activity**, in a second
// language. A contest at 09:00 Warsaw imported into a month on the other side of
// a daylight-saving boundary is still expected at 09:00, and a shift measured in
// absolute time puts it at 10:00.
//
// **The two dates must sit in different offsets, or this proves nothing.** The
// first version of this check moved March to November — CET to CET — where an
// absolute shift and a wall-clock shift agree exactly, so replacing one with the
// other left it green. March is +01:00 and July is +02:00; that pair is the
// whole point of the case.

const zone = "Europe/Warsaw";
const anchor = anchorOf(["2026-03-02T08:00:00.000Z"], undefined);
check(anchor === "2026-03-02T08:00:00.000Z", "the anchor is the earliest round start");

const localHour = (iso) => new Intl.DateTimeFormat("en-GB", {
    timeZone: zone, hour: "2-digit", minute: "2-digit", hour12: false,
}).format(new Date(iso));
const offset = (iso) => new Intl.DateTimeFormat("en-GB", {
    timeZone: zone, timeZoneName: "longOffset",
}).format(new Date(iso)).split(" ").pop();

// Stated as an assertion rather than trusted: the fixture is only a test of the
// daylight-saving rule while these two disagree.
check(offset("2026-03-02T08:00:00.000Z") !== offset("2026-07-06T07:00:00.000Z"),
    `the two months are in different offsets (${offset("2026-03-02T08:00:00.000Z")} and ${offset("2026-07-06T07:00:00.000Z")})`);

const move = shiftTo(anchor, "2026-07-06T07:00:00.000Z", zone);
const movedStart = move("2026-03-02T08:00:00.000Z");
const movedEnd = move("2026-03-02T12:00:00.000Z");

check(localHour("2026-03-02T08:00:00.000Z") === "09:00", "the round began at 09:00 in Warsaw");
check(localHour(movedStart) === "09:00", `and the import begins at 09:00 too (${localHour(movedStart)})`);
check(localHour(movedEnd) === "13:00", `with the end four hours after it (${localHour(movedEnd)})`);
check(move(undefined) === undefined, "and a date nothing held stays absent");

check(shiftTo(undefined, "2026-11-09T08:00:00.000Z", zone)("2026-03-02T08:00:00.000Z") === undefined,
    "an import with nothing dated moves nothing");

// ── 7. The statement naming convention ──────────────────────────────────────

check(statementLanguage("content.md") === undefined, "content.md is the default statement");
check(statementLanguage("content-en.md") === "en", "content-en.md is a translation");
check(statementLanguage("figure.png") === false, "and a figure is not a statement");
check(isStatement("content-uk.md") && !isStatement("package.zip"), "isStatement agrees with it");

// ── 8. The ceiling is stated, not discovered ────────────────────────────────

check(weigh({ bundle, files }) === [...files.values()].reduce((n, f) => n + f.length, 0),
    "the weight is the bytes it would hold");
check(REFUSE_BYTES === 256 * 1024 * 1024, "and the refusal is at the documented 256 MB");

// ── 9. The projection carries what the partition says it does ───────────────
//
// **The gap this closes was measured, not imagined.** With the projection still
// inside the collector, deleting `spec` from an assignment passed both the round
// trip above — which reads a manifest written by hand — and the browser run,
// which asserted that an activity arrived rather than what it arrived with.
// `spec` holds the languages a submit form offers, and it is the field §7 caught
// the Server dropping.
//
// Every carried field is set to something a fresh object would not hold, so a
// projection that forgets one cannot compare equal by accident. Every field the
// partition says is left behind is asserted absent, which is the other half: a
// bundle carrying `joinPassword` would be a leak nothing else here would see.

const managedAssignment = {
    id: "sp-1", seriesId: "s-1", problemId: "p-1", problemSlug: "spojnosc-grafu",
    problemName: "Spójność grafu", slug: "A", name: "Zadanie A", order: 3,
    pinnedProblemVersionId: "v-9", pinnedVersion: 9, currentVersion: 9,
    hasPackage: true, submissionCount: 17,
    config: { languages: ["cpp17-gcc"] }, spec: { languages: ["cpp17-gcc", "python3"] },
    props: { marker: 2 }, maxPoints: 42, maxUploadBytes: 4096,
    maxAttachments: 3, maxSubmissions: 9,
};

const managedSeries = {
    id: "s-1", activityId: "a-1", slug: "runda-1", name: "Runda 1", order: 3,
    startDate: "2026-03-02T08:00:00.000Z", endDate: "2026-03-02T12:00:00.000Z",
    isOpen: true, pausedAt: "2026-03-02T09:00:00.000Z", hideProblemsWhilePaused: true,
    revealProblemCount: false,
    rankingFreezeAt: "2026-03-02T11:00:00.000Z", rankingRevealAt: "2026-03-02T13:00:00.000Z",
    rankingVisibleFrom: "2026-03-02T08:00:00.000Z", rankingVisibleTo: "2026-04-02T08:00:00.000Z",
    importance: 30, importanceScope: "installation",
    addressRules: [{ network: "192.168.7.0/24", note: "the room" }],
    restrictionsEnabled: false, runnerTags: ["lab-north"], matchingRunners: 2,
    problems: [managedAssignment],
};

const managedActivity = {
    id: "a-1", slug: "AMMPZ-2019", name: "Mistrzostwa", type: "contest@1",
    rankingType: "icpc", timeZone: "Europe/Warsaw",
    startDate: "2026-03-02T08:00:00.000Z", endDate: "2026-03-02T14:00:00.000Z",
    modules: { questions: true }, documents: [], scoreVisibility: "managersOnly",
    attachmentVisibility: [{ name: "source", visibility: "participant" }],
    props: { theme: "dark" }, joinPolicy: "open", unlisted: true,
    joinPassword: "last-years-password", hideEndedSeriesProblems: true,
    maxUploadBytes: 12345, maxAttachments: 5, maxSubmissionsPerProblem: 7,
    archivedAt: "2026-05-01T00:00:00.000Z", publishedAt: "2026-01-01T00:00:00.000Z",
    seriesCount: 4, problemCount: 9, participantCount: 120,
    runnerTags: ["lab-north"], matchingRunners: 2,
};

const managedProblem = {
    id: "p-1", slug: "spojnosc-grafu", name: "Spójność grafu", type: "standard-io@1",
    ownerUserId: "u-1", ownerName: "Jan Kowalski", visibility: "instance", sharedWith: ["u-2"],
    archivedAt: "2026-05-01T00:00:00.000Z", publishedAt: "2026-01-01T00:00:00.000Z",
    currentVersion: 9, versionCount: 9,
    createdAt: "2025-01-01T00:00:00.000Z", attachedCount: 3, external: true,
};

const managedVersion = {
    id: "v-9", version: 9, createdAt: "2026-01-01T00:00:00.000Z", note: "v9",
    props: { marker: 1 }, hasPackage: true,
    files: [{ name: "content.md", scope: "participant", mimeType: "text/markdown", sizeBytes: 12, sha256: "aaa" }],
};

const projectedSeries = projectSeries(managedSeries, new Map([["p-1", "spojnosc-grafu"]]));
const projectedActivity = projectActivity(managedActivity, [], [projectedSeries]);
const projectedProblem = projectProblem(managedProblem, managedVersion);

const projected = (shape, from, to) => {
    for (const field of CARRIED[shape]) {
        const mine = JSON.stringify(from[field]);
        check(JSON.stringify(to[field]) === mine, `${shape}.${field} is projected (${mine})`);
    }
    for (const field of NOT_CARRIED[shape]) {
        // `documents` and `series` are rebuilt rather than copied, so the
        // activity legitimately holds them; everything else must be absent.
        if (shape === "activity" && field === "documents") continue;
        check(to[field] === undefined,
            `${shape}.${field} is left behind${to[field] === undefined ? "" : ` (${JSON.stringify(to[field])})`}`);
    }
};

projected("activity", managedActivity, projectedActivity);
projected("series", managedSeries, projectedSeries);
projected("assignment", managedAssignment, projectedSeries.assignments[0]);
projected("problem", managedProblem, projectedProblem);

check(JSON.stringify(projectedProblem.props) === JSON.stringify(managedVersion.props)
    && projectedProblem.note === managedVersion.note,
    "and a problem's note and props come from its version rather than from itself");


if (process.exitCode) console.error("\nexchange check failed");
else console.log("\nexchange check passed");
