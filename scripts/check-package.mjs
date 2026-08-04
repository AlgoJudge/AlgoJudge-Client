// Round-trips a package through the real builder: assemble, read back, compare.
// Run from the Client root after compiling src/package into ./tmp-pkgtest/out.
import { buildPackage, readPackage, buildSampleArchive } from "../.package-check/build.js";
import { validatePackage, hasErrors } from "../.package-check/validate.js";
import { emptyConfig } from "../.package-check/types.js";
import { unzipSync } from "fflate";

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
    limits: { timeMs: 1500, memoryMb: 256 },
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
if (back.config.limits.timeMs !== 1500 || back.config.limits.memoryMb !== 256) fail("limits did not survive");
else ok("limits survived the round trip");

if (back.config.groups.length !== 3 || back.config.groups[2].points !== 60) fail("groups did not survive");
else ok("groups survived the round trip");

if (back.tests.length !== 4) fail(`expected 4 tests, got ${back.tests.length}`);
else if (back.tests.map(t => t.name).join(",") !== "0a,1a,1b,2a") fail("test order or names wrong");
else if (back.tests[3].input !== tests[3].input) fail("test content differs");
else ok("all four tests survived, in order, byte for byte");

if (back.checker?.name !== "checker.cpp") fail("checker did not survive");
else ok("checker survived");

console.log("\nvalidation");

const clean = validatePackage(tests, config, ["0a.in", "0a.out", "1a.in", "1a.out", "1b.in", "1b.out", "2a.in", "2a.out", "checker.cpp"]);
if (hasErrors(clean)) fail(`a valid package reported errors: ${JSON.stringify(clean)}`);
else ok("a valid package passes");

const noOutput = [{ name: "1a", group: 1, letter: "a", input: "x" }];
const withoutChecker = { ...config, checker: undefined, groups: [{ group: 1, points: 100 }] };
const issues = validatePackage(noOutput, withoutChecker, ["1a.in"]);
if (!issues.some(i => i.level === "error" && i.message.includes("No expected output"))) {
    fail("a test with no .out and no checker was accepted");
} else {
    ok("a test with no .out and no checker is refused");
}

const pathy = validatePackage(tests, config, ["../escape.in"]);
if (!pathy.some(i => i.level === "error" && i.message.includes("path"))) fail("a path in a file name was accepted");
else ok("a path in a file name is refused");

const orphan = validatePackage(tests, { ...config, groups: [...config.groups, { group: 9, points: 0 }] }, []);
if (!orphan.some(i => i.message.includes("Group 9 has no tests"))) fail("an empty group was accepted");
else ok("a group with no tests is refused");

const samples = await buildSampleArchive(tests.filter(t => t.group === 0));
const sampleEntries = Object.keys(unzipSync(new Uint8Array(await samples.arrayBuffer()))).sort();
if (JSON.stringify(sampleEntries) !== JSON.stringify(["0a.in", "0a.out"])) {
    fail(`the sample archive carries ${sampleEntries.join(", ")} — it must carry only the examples`);
} else {
    ok("the sample archive carries only the examples, not the hidden tests");
}

console.log(process.exitCode ? "\nFAILED" : "\nall checks passed");
