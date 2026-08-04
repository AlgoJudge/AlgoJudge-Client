// Round-trips a package through the real builder: assemble, read back, compare.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { unzipSync, zipSync } from "fflate";

const OUT = ".package-check";

execFileSync("npx", ["tsc",
    "src/package/types.ts", "src/package/validate.ts", "src/package/build.ts",
    "--outDir", OUT, "--rootDir", "src/package",
    "--module", "esnext", "--target", "es2022", "--moduleResolution", "bundler", "--skipLibCheck",
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
const { emptyConfig } = await import(`../${OUT}/types.js`);

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
    limits: { timeMs: 1500, memoryKib: 256 * 1024 },
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
if (back.config.limits.timeMs !== 1500 || back.config.limits.memoryKib !== 256 * 1024) fail("limits did not survive");
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

// A group may narrow — or widen — the limits for its own tests. The value has to
// survive the archive, because it is what the Runner enforces per test.
{
    const withGroupLimits = {
        ...config,
        groups: [
            { group: 0, points: 0, examples: true },
            { group: 1, points: 40, limits: { timeMs: 3000 } },
            { group: 2, points: 60, limits: { timeMs: 5000, memoryKib: 512 * 1024 } },
        ],
    };
    const archive = await buildPackage({ config: withGroupLimits, tests, checker });
    const back = await readPackage(archive);
    const second = back.config.groups.find(g => g.group === 2);
    if (back.config.groups.find(g => g.group === 1)?.limits?.timeMs !== 3000) fail("a group time limit was lost");
    else if (second?.limits?.memoryKib !== 512 * 1024) fail("a group memory limit was lost");
    else if (back.config.groups.find(g => g.group === 0)?.limits !== undefined) fail("a group without limits gained one");
    else ok("per-group limits round-trip");

    const bad = validatePackage(tests, {
        ...config,
        groups: [{ group: 1, points: 100, limits: { timeMs: 0 } }],
    }, []);
    if (!bad.some(i => i.message.includes("time limit of 0"))) fail("a zero group limit was accepted");
    else ok("a zero group limit is refused");
}

// A hand-edited config.yml may drop a whole section. Reading one has to produce
// a usable configuration rather than an object the next reader iterates and dies
// on — which is what happened when a version's opaque configuration was handed
// over in place of a package one.
{
    const encoder = new TextEncoder();
    const bare = new Blob([zipSync({
        "config.yml": encoder.encode("format: algojudge-package\nversion: 1\n"),
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

console.log(process.exitCode ? "\nFAILED" : "\nall checks passed");
