// Every toolchain the submit form offers has a file it can be uploaded as.
//
// **The two lists have to agree and nothing made them.** The Runner refuses a
// file whose extension the chosen toolchain does not accept, and it does so as a
// *compilation error* — so a language offered in the select whose extension the
// file field rejects is a language a participant can only paste. That is not a
// hypothetical: the accept list predated the eighteen-toolchain catalogue of
// 2026-08-22 and never gained `.c`, so eight C toolchains were offered and every
// C file was refused by the form in front of them.
//
// Pure: `languages.ts` imports nothing, so this compiles one file and runs it.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = ".languages-check";

execFileSync("npx", ["tsc",
    "src/components/editor/languages.ts",
    "--outDir", OUT, "--rootDir", "src",
    "--module", "esnext", "--target", "es2022", "--moduleResolution", "bundler",
    "--skipLibCheck", "--ignoreConfig",
], { stdio: "inherit", shell: process.platform === "win32" });

const addExtensions = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) addExtensions(path);
        else if (entry.name.endsWith(".js")) {
            writeFileSync(path, readFileSync(path, "utf8")
                .replace(/(from\s+")(\.[^"]*?)(")/g, (all, a, s, b) =>
                    s.endsWith(".js") ? all : `${a}${s}.js${b}`));
        }
    }
};
addExtensions(OUT);

const { knownLanguages, pastedFileName, uploadableExtensions } =
    await import(`../${OUT}/components/editor/languages.js`);

const fail = (message) => { console.error("FAIL:", message); process.exitCode = 1; };
const check = (condition, message) =>
    condition ? console.log("  ok  ", message) : fail(message);

// `standard-io@1` is the type this holds for: a language is chosen there, and
// the file has to match it. `output-only@1` asks for no language at all — the
// submission is a bag of answers — so there is nothing to agree with.
const TYPE = "standard-io@1";
const uploadable = uploadableExtensions(TYPE);

const offered = knownLanguages(TYPE);
check(offered.length > 0, `the catalogue has toolchains to check (${offered.length})`);

const stranded = offered.filter(id => {
    const name = pastedFileName(TYPE, id);
    return !uploadable.some(extension => name.endsWith(extension));
});
check(stranded.length === 0,
    "every toolchain the form offers has a file it accepts"
    + (stranded.length ? `: ${stranded.join(", ")} cannot be uploaded` : ""));

// The other direction, so the list does not collect extensions nothing uses —
// `.txt` sat here for a while and the Runner refuses it for every toolchain of
// this type.
const unused = uploadable.filter(extension =>
    !offered.some(id => pastedFileName(TYPE, id).endsWith(extension))
    // The C++ rows paste as `.cpp`; the other three are the same language under
    // names the Runner accepts, and a participant may legitimately have one.
    && ![".cc", ".cxx", ".c++"].includes(extension));
check(unused.length === 0,
    "and nothing is offered that no toolchain would take"
    + (unused.length ? `: ${unused.join(", ")}` : ""));

console.log(`  ---  ${offered.length} toolchains, ${uploadable.length} extensions`);
