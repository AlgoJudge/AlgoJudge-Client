// Round-trips a package through the real builder: assemble, read back, compare.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { unzipSync, zipSync } from "fflate";

const OUT = ".package-check";

execFileSync("npx", ["tsc",
    "src/package/types.ts", "src/package/validate.ts", "src/package/build.ts", "src/package/calibration.ts",
    "src/package/intake.ts",
    "--outDir", OUT, "--rootDir", "src/package",
    "--module", "esnext", "--target", "es2022", "--moduleResolution", "bundler", "--skipLibCheck",
    // TypeScript 6 makes naming files beside a tsconfig.json an error rather
    // than a silent ignore. This compiles a subset on purpose, so it opts out.
    "--ignoreConfig",
], { stdio: "inherit", shell: process.platform === "win32" });

// The application resolves extensionless imports through Vite; Node does not.
// Needed since `build.ts` began importing a value rather than only types.
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

const { buildPackage, readPackage, buildSampleArchive } = await import(`../${OUT}/build.js`);
const { validatePackage, hasErrors } = await import(`../${OUT}/validate.js`);
const { intakeFiles } = await import(`../${OUT}/intake.js`);
const { emptyConfig } = await import(`../${OUT}/types.js`);
const { applyCalibration, measuredGroups, suggestedForGroup } = await import(`../${OUT}/calibration.js`);

const fail = (message) => { console.error("FAIL:", message); process.exitCode = 1; };
const ok = (message) => console.log("  ok  ", message);

const tests = [
    { name: "0a", group: 0, letter: "a", input: "4 3\n1 2\n2 3\n3 4", output: "TAK" },
    { name: "1a", group: 1, letter: "a", input: "1 0", output: "TAK" },
    { name: "1b", group: 1, letter: "b", input: "2 0", output: "NIE" },
    { name: "2a", group: 2, letter: "a", input: "5 4\n1 2\n2 3\n3 4\n4 5", output: "TAK" },
];

const config = {
    ...emptyConfig(),
    limits: { timeMs: 1500, memoryBytes: 256 * 1024 * 1024 },
    groups: [
        { group: 0, points: 0, examples: true },
        { group: 1, points: 40 },
        { group: 2, points: 60 },
    ],
    checker: { source: "checker/checker.cpp", language: "cpp" },
};

const checker = { name: "checker.cpp", content: "// zawsze OK\nint main(){puts(\"OK\");}\n" };

console.log("build → read → compare");

const archive = await buildPackage({ config, tests, checker });
ok(`archive built, ${archive.size} bytes`);

const entries = Object.keys(unzipSync(new Uint8Array(await archive.arrayBuffer()))).sort();
const expected = [
    "checker/checker.cpp",
    "config.yml",
    "tests/0a.in", "tests/0a.out",
    "tests/1a.in", "tests/1a.out",
    "tests/1b.in", "tests/1b.out",
    "tests/2a.in", "tests/2a.out",
].sort();
if (JSON.stringify(entries) !== JSON.stringify(expected)) {
    fail(`layout\n    got:      ${entries.join(", ")}\n    expected: ${expected.join(", ")}`);
} else {
    ok("layout matches the specification");
}

const back = await readPackage(archive);
if (back.config.limits.timeMs !== 1500 || back.config.limits.memoryBytes !== 256 * 1024 * 1024) fail("limits did not survive");
else ok("limits survived the round trip");

if (back.config.groups.length !== 3 || back.config.groups[2].points !== 60) fail("groups did not survive");
else ok("groups survived the round trip");

if (back.tests.length !== 4) fail(`expected 4 tests, got ${back.tests.length}`);
else if (back.tests.map(t => t.name).join(",") !== "0a,1a,1b,2a") fail("test order or names wrong");
else if (back.tests[3].input !== tests[3].input) fail("test content differs");
else ok("all four tests survived, in order, byte for byte");

if (back.checker?.name !== "checker.cpp") fail("checker did not survive");
else ok("checker survived");

// **An interactive package, whole.** The config key travelled for free from the
// beginning — the whole object is written as YAML — but the source did not, and
// nothing said so: the archive came back naming an interactor it no longer held,
// the validator was silent, and the Runner refused the package at judging time
// with a green "ready" left behind in the editor.
const interactiveConfig = { ...config, checker: undefined, interactor: { source: "interactor/talk.cpp", language: "cpp" } };
const interactor = { name: "talk.cpp", content: "// asks and answers\nint main(){}\n" };
const interactive = await readPackage(await buildPackage({ config: interactiveConfig, tests, interactor }));

if (interactive.config.interactor?.source !== "interactor/talk.cpp") fail("the interactor config did not survive");
else if (interactive.config.checker !== undefined) fail("a checker appeared from nowhere");
else if (interactive.interactor?.name !== "talk.cpp") fail("the interactor's source did not survive the round trip");
else if (interactive.interactor.content !== interactor.content) fail("the interactor's source differs");
else ok("an interactive package survives, config and source together");

// **An absent input is an absent entry.** Written unconditionally it becomes a
// zero-byte file, which the Runner reads as "the file is there and says
// nothing" — every test judged against an empty input rather than against the
// conversation. Nothing else in this script looks at entry names.
const bare = [{ name: "1a", group: 1, letter: "a" }];
const bareArchive = await buildPackage({
    config: { ...interactiveConfig, groups: [{ group: 1, points: 100, tests: 1 }] },
    tests: bare,
    interactor,
});
const bareEntries = Object.keys(unzipSync(new Uint8Array(await bareArchive.arrayBuffer()))).sort();
if (bareEntries.some(e => e.startsWith("tests/"))) {
    fail(`a test with no files still wrote ${bareEntries.filter(e => e.startsWith("tests/")).join(", ")}`);
} else {
    ok("a test with neither file writes no entry at all");
}

// The other half of the same rule, and the half that needs a file to exist:
// an archive whose test has only a `.out` must read back with **no** input, not
// with an empty one. `typecheck` cannot see the difference — `""` is a string.
const halfArchive = await buildPackage({
    config: { ...interactiveConfig, groups: [{ group: 1, points: 100, tests: 1 }] },
    tests: [{ name: "1a", group: 1, letter: "a", output: "5" }],
    interactor,
});
const halfBack = await readPackage(halfArchive);
const half = halfBack.tests[0];
if (!half) fail("an archive with a lone .out read back no test");
else if (half.input !== undefined) fail(`a lone .out read back as input ${JSON.stringify(half.input)}`);
else if (half.output !== "5") fail("the expected output did not survive");
else ok("a lone .out reads back as a test with no input");

const bareBack = await readPackage(bareArchive);
if (bareBack.tests.length !== 0) fail("an archive with no test files read tests from nowhere");
else ok("and reads back as no tests, which the declared count then names");

console.log("\nloose files, classified by name");

// **Order is the assertion.** `interactor.cpp` matches no other predicate, so
// this would pass whatever the order — but `interactive-checker.cpp` matches the
// interactor's pattern *and* the checker's, and the more specific has to win.
// A file named for neither must stay unrecognised rather than be guessed at.
const named = (name) => new File([`// ${name}`], name, { type: "text/plain" });
for (const [name, expected] of [
    ["checker.cpp", "checker"],
    ["chk.py", "checker"],
    ["interactor.cpp", "interactor"],
    ["interactive-checker.cpp", "interactor"],
    ["model.cpp", "modelSolution"],
    ["interpolate.cpp", undefined],
]) {
    const taken = await intakeFiles([named(name)]);
    const landed = ["checker", "interactor", "modelSolution"].find(k => taken[k]?.name === name);
    if (landed !== expected) {
        fail(`${name} was taken as ${landed ?? "unrecognised"}, expected ${expected ?? "unrecognised"}`);
    } else if (expected === undefined && !taken.unrecognised.includes(name)) {
        fail(`${name} was neither classified nor reported as unrecognised`);
    } else {
        ok(`${name} → ${expected ?? "unrecognised"}`);
    }
}

// **A lone `.out` arrives as a test with no input, not an empty one.** The seed
// that used to pre-fill `input: ""` made the two the same value, and no guard
// downstream could tell them apart — which is exactly what an interactive
// package has to say. `typecheck` cannot see this: `""` is a valid string.
const loneOut = await intakeFiles([new File(["5"], "1a.out", { type: "text/plain" })]);
const only = loneOut.tests[0];
if (!only) fail("a lone 1a.out produced no test at all");
else if (only.input !== undefined) fail(`a lone 1a.out gave input ${JSON.stringify(only.input)}, not undefined`);
else if (only.output !== "5") fail("the output did not arrive");
else ok("a lone 1a.out is a test with no input, not one with an empty input");

console.log("\nvalidation");

const clean = validatePackage(tests, config, ["0a.in", "0a.out", "1a.in", "1a.out", "1b.in", "1b.out", "2a.in", "2a.out", "checker.cpp"]);
if (hasErrors(clean)) fail(`a valid package reported errors: ${JSON.stringify(clean)}`);
else ok("a valid package passes");

const noOutput = [{ name: "1a", group: 1, letter: "a", input: "x" }];
const oneGroup = { groups: [{ group: 1, points: 100 }] };

// **What a test needs depends on what judges it, and on nothing else.** These
// are the Runner's rules, from `TestSet::read`: with neither program the `.out`
// file is the whole verdict, a checker replaces the comparison, and an
// interactor replaces the input as well. Asserting anything stricter here
// refuses packages that judge; anything looser is a green "ready" on a package
// the Runner throws out at judging time.
const judgedByInteractor = { checker: undefined, interactor: { source: "interactor/talk.cpp", language: "cpp" } };
const names = ["1a.in", "checker.cpp", "talk.cpp"];

for (const [what, extra, refused] of [
    ["no checker", { checker: undefined }, true],
    ["a checker", { checker: config.checker }, false],
    ["an interactor", judgedByInteractor, false],
]) {
    const issues = validatePackage(noOutput, { ...config, ...oneGroup, ...extra }, names);
    const said = issues.some(i => i.level === "error" && i.message.includes("No expected output"));
    if (said !== refused) {
        fail(`a test with no .out and ${what} was ${said ? "refused" : "accepted"}`);
    } else {
        ok(`a test with no .out and ${what} is ${refused ? "refused" : "accepted"}`);
    }
}

const noInput = [{ name: "1a", group: 1, letter: "a", output: "5" }];
for (const [what, extra, refused] of [
    ["no judging program", { checker: undefined }, true],
    ["a checker", { checker: config.checker }, true],
    ["an interactor", judgedByInteractor, false],
]) {
    const issues = validatePackage(noInput, { ...config, ...oneGroup, ...extra }, names);
    const said = issues.some(i => i.level === "error" && i.message.includes("No input"));
    if (said !== refused) {
        fail(`a test with no .in and ${what} was ${said ? "refused" : "accepted"}`);
    } else {
        ok(`a test with no .in and ${what} is ${refused ? "refused" : "accepted"}`);
    }
}

// **A declared count is an interactive problem's census and nothing else's.**
const counted = (extra, tests) => validatePackage(
    [], { ...config, ...extra, groups: [{ group: 1, points: 100, tests }] }, names);
for (const [what, extra, fragment] of [
    ["without an interactor", { checker: undefined }, "Only an interactive problem"],
    ["at zero", judgedByInteractor, "award its points to anybody"],
    ["past twenty-six", judgedByInteractor, "at most"],
]) {
    const count = what === "at zero" ? 0 : what === "past twenty-six" ? 27 : 3;
    const issues = counted(extra, count);
    if (!issues.some(i => i.level === "error" && i.message.includes(fragment))) {
        fail(`a test count ${what} was accepted: ${JSON.stringify(issues)}`);
    } else {
        ok(`a test count ${what} is refused`);
    }
}

const both = validatePackage(tests, { ...config, interactor: { source: "interactor/talk.cpp", language: "cpp" } },
    ["0a.in", "0a.out", "1a.in", "1a.out", "1b.in", "1b.out", "2a.in", "2a.out", "checker.cpp", "talk.cpp"]);
if (!both.some(i => i.level === "error" && i.message.includes("never both"))) {
    fail("a package declaring a checker and an interactor was accepted");
} else {
    ok("a checker and an interactor together are refused");
}

const absent = validatePackage(tests, { ...config, checker: undefined, interactor: { source: "interactor/talk.cpp", language: "cpp" } },
    ["0a.in", "0a.out", "1a.in", "1a.out", "1b.in", "1b.out", "2a.in", "2a.out"]);
if (!absent.some(i => i.level === "error" && i.message.includes("interactor named in the configuration"))) {
    fail("an interactor named but absent was accepted");
} else {
    ok("an interactor named but absent is refused");
}

const pathy = validatePackage(tests, config, ["../escape.in"]);
if (!pathy.some(i => i.level === "error" && i.message.includes("path"))) fail("a path in a file name was accepted");
else ok("a path in a file name is refused");

// A finding names its subject in `values` rather than in the sentence, so the
// screen can translate it. The check reads it the same way the screen does.
const orphan = validatePackage(tests, { ...config, groups: [...config.groups, { group: 9, points: 0 }] }, []);
if (!orphan.some(i => i.message === "Group {{group}} has no tests" && i.values?.group === 9)) {
    fail("an empty group was accepted");
} else {
    ok("a group with no tests is refused");
}

// **The validator has to survive the file it was written to complain about.**
// `config.yml` is edited by hand, so `groups` arrives missing, or as a mapping
// somebody indented wrongly, or as a string. The validator reported that and
// then iterated the same value four lines later, so it threw `TypeError` and the
// finding it had just recorded was never delivered: the manager saw a crash
// instead of the sentence naming the mistake.
//
// Nothing here is type-checked into existence — `PackageConfig.groups` is
// declared as a required array, which is exactly why TypeScript is no help.
for (const [name, groups] of [
    ["missing", undefined],
    ["null", null],
    ["a mapping", {}],
    ["a string", "1"],
    ["a number", 3],
]) {
    let reported;
    try {
        reported = validatePackage(tests, { ...config, groups }, []);
    } catch (e) {
        fail(`config.yml with groups ${name} threw instead of reporting: ${e}`);
        continue;
    }
    if (!reported.some(i => i.level === "error" && i.message === "config.yml has no groups section")) {
        fail(`config.yml with groups ${name} was accepted: ${JSON.stringify(reported)}`);
    } else {
        ok(`config.yml with groups ${name} is reported, not thrown`);
    }
}

const samples = await buildSampleArchive(tests.filter(t => t.group === 0));
const sampleEntries = Object.keys(unzipSync(new Uint8Array(await samples.arrayBuffer()))).sort();
if (JSON.stringify(sampleEntries) !== JSON.stringify(["0a.in", "0a.out"])) {
    fail(`the sample archive carries ${sampleEntries.join(", ")} — it must carry only the examples`);
} else {
    ok("the sample archive carries only the examples, not the hidden tests");
}

// A group may narrow — or widen — the limits for its own tests. The value has to
// survive the archive, because it is what the Runner enforces per test.
{
    const withGroupLimits = {
        ...config,
        groups: [
            { group: 0, points: 0, examples: true },
            { group: 1, points: 40, limits: { timeMs: 3000 } },
            { group: 2, points: 60, limits: { timeMs: 5000, memoryBytes: 512 * 1024 * 1024 } },
        ],
    };
    const archive = await buildPackage({ config: withGroupLimits, tests, checker });
    const back = await readPackage(archive);
    const second = back.config.groups.find(g => g.group === 2);
    if (back.config.groups.find(g => g.group === 1)?.limits?.timeMs !== 3000) fail("a group time limit was lost");
    else if (second?.limits?.memoryBytes !== 512 * 1024 * 1024) fail("a group memory limit was lost");
    else if (back.config.groups.find(g => g.group === 0)?.limits !== undefined) fail("a group without limits gained one");
    else ok("per-group limits round-trip");

    const bad = validatePackage(tests, {
        ...config,
        groups: [{ group: 1, points: 100, limits: { timeMs: 0 } }],
    }, []);
    if (!bad.some(i => i.message === "Group {{group}} has a time limit that is not positive")) {
        fail("a zero group limit was accepted");
    } else {
        ok("a zero group limit is refused");
    }
}

// Calibration: the rule travels in the package, and the arithmetic that turns a
// measurement into a limit is the same everywhere it is applied.
{
    if (applyCalibration({ factor: 3, add: 100, roundTo: 100 }, 240) !== 900) {
        fail("240 ms × 3 + 100, rounded up to 100, is 900 ms");
    } else if (applyCalibration({ factor: 1, add: 16 * 1024, roundTo: 1024 }, 31000) !== 48128) {
        fail("31000 KiB + 16 MiB, rounded up to a MiB, is 48128 KiB");
    } else if (applyCalibration(undefined, 250) !== 250) {
        fail("no rule leaves a measurement as it is");
    } else {
        ok("calibration arithmetic rounds up, after multiplying and adding");
    }

    const calibration = {
        time: { factor: 3, add: 100, roundTo: 100 },
        memory: { factor: 1, add: 16 * 1024 * 1024, roundTo: 1024 * 1024 },
        // Two languages on group 1, so the suggestion has to come from the
        // slower of them — group 2 measured only once, and stands for the
        // ordinary case.
        measured: [
            { group: 1, language: "cpp", timeMs: 240, memoryBytes: 31744000 },
            { group: 1, language: "python", timeMs: 900, memoryBytes: 52428800 },
            { group: 2, language: "cpp", timeMs: 100, memoryBytes: 20971520 },
        ],
        at: "2026-08-05T10:00:00Z",
        runner: "runner-01",
    };
    const withCalibration = {
        ...config,
        modelSolution: { source: "solutions/model.cpp", language: "cpp" },
        calibration,
    };
    const back = await readPackage(await buildPackage({
        config: withCalibration,
        tests,
        checker,
        modelSolution: { name: "model.cpp", content: "int main(){}\n" },
    }));
    if (back.config.calibration?.time?.factor !== 3) fail("a calibration factor was lost");
    else if (back.config.calibration?.memory?.add !== 16 * 1024 * 1024) fail("a calibration offset was lost");
    else if (back.config.calibration?.measured?.length !== 3) fail("the measurement rows were lost");
    else if (back.config.calibration?.measured?.[0]?.group !== 1) fail("a measurement lost its group");
    else ok("calibration round-trips, every measured row included");

    if (measuredGroups(calibration).join(",") !== "1,2") {
        fail(`measured groups are ${measuredGroups(calibration).join(",")}`);
    } else {
        ok("every measured group is offered a suggestion");
    }

    // **From the slowest language.** 900 × 3 + 100 → 2800, not 240 × 3 + 100.
    // A suggestion taken from the faster reference is a limit the other
    // language cannot meet.
    const group1 = suggestedForGroup(calibration, 1);
    if (group1.timeMs !== 2800) {
        fail(`group 1 suggests ${group1.timeMs} ms, so it did not take the slowest language`);
    } else if (group1.memoryBytes !== 69206016) {
        fail(`group 1 suggests ${group1.memoryBytes} bytes of memory`);
    } else {
        ok("a group's suggestion comes from the slowest language measured");
    }

    // Memory is absent unless every row for the group carried one: a maximum
    // over "some numbers and some absences" is not a measurement of the group.
    const partial = {
        ...calibration,
        measured: [
            { group: 1, language: "cpp", timeMs: 240, memoryBytes: 31744000 },
            { group: 1, language: "python", timeMs: 900 },
        ],
    };
    if (suggestedForGroup(partial, 1).memoryBytes !== undefined) {
        fail("a group with one unmeasured memory still suggested a memory limit");
    } else if (suggestedForGroup(partial, 1).timeMs !== 2800) {
        fail("an absent memory should not cost the group its time suggestion");
    } else {
        ok("an unmeasured memory leaves the group without a memory suggestion");
    }

    const zero = validatePackage(tests, { ...withCalibration, calibration: { time: { factor: 0 } } }, ["checker.cpp", "model.cpp"]);
    if (!zero.some(i => i.message === "A calibration factor must be positive")) {
        fail("a zero calibration factor was accepted");
    } else {
        ok("a zero calibration factor is refused");
    }

    const orphaned = validatePackage(tests, { ...config, calibration: { time: { factor: 2 } } }, ["checker.cpp"]);
    const warning = orphaned.find(i => i.message === "Calibration is configured but there is no model solution to measure");
    if (!warning) fail("calibration without a model solution passed unmentioned");
    else if (warning.level !== "warning") fail("calibration without a model solution blocks the package");
    else ok("calibration without a model solution is a warning, not an error");
}

// A hand-edited config.yml may drop a whole section. Reading one has to produce
// a usable configuration rather than an object the next reader iterates and dies
// on — which is what happened when a version's opaque configuration was handed
// over in place of a package one.
{
    const encoder = new TextEncoder();
    const bare = new Blob([zipSync({
        "config.yml": encoder.encode('type: "algojudge-package@1"\n'),
        "tests/1a.in": encoder.encode("1 0"),
        "tests/1a.out": encoder.encode("TAK"),
    })]);
    const contents = await readPackage(bare);
    if (!Array.isArray(contents.config.groups)) fail("groups did not default to an array");
    else ok("a config.yml without groups reads");

    const issues = validatePackage(contents.tests, contents.config, []);
    if (!Array.isArray(issues)) fail("validation did not survive a bare config");
    else ok("validation survives a bare config");
}

// **Every archive this product builds goes through `zipArchive`**, which stamps
// a fixed date on each entry. `fflate` defaults that date to *the current
// time*, so an archive built twice from identical bytes was two different files
// with two different SHA-256 - and the Server stores a file under the digest of
// its bytes, which made one package two.
//
// Two checks, because they catch different mistakes: the first refuses a fourth
// call site that skips the helper, the second proves the helper still does what
// it exists for.
{
    const offenders = [];
    const scan = (directory) => {
        for (const entry of readdirSync(directory, { withFileTypes: true })) {
            const path = join(directory, entry.name);
            if (entry.isDirectory()) scan(path);
            else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
                if (path.replaceAll("\\", "/") === "src/package/archive.ts") continue;
                if (/\bzipSync\s*\(/.test(readFileSync(path, "utf8"))) offenders.push(path);
            }
        }
    };
    scan("src");
    if (offenders.length) fail(`zipSync is called outside src/package/archive.ts: ${offenders.join(", ")}`);
    else ok("every archive is built through zipArchive");

    const built = async () => new Uint8Array(await (await buildPackage({
        config: emptyConfig(), tests: [{ name: "1a", input: "2 3", output: "5" }],
    })).arrayBuffer());
    const first = await built();
    await new Promise(r => setTimeout(r, 1100));
    const second = await built();
    const digest = (b) => createHash("sha256").update(b).digest("hex");
    if (digest(first) !== digest(second)) {
        fail("the same package built a second later is a different file");
        console.error(`         ${digest(first)}`);
        console.error(`         ${digest(second)}`);
    } else ok("and the same package built a second later is the same bytes");
}

console.log(process.exitCode ? "\nFAILED" : "\nall checks passed");
