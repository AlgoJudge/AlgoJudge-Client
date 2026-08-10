// Every interface string a screen asks for, against every language file.
//
// **This is the one defect no other check can see.** A missing key is not an
// error: i18next falls back to the key itself, which *is* the English text — so
// a Polish interface quietly renders an English sentence, lint is silent,
// typecheck is silent, the build is silent, and it looks like a translation
// nobody got round to rather than one nobody knows is missing. Four such strings
// had been sitting in the Polish file's absence before this script existed.
//
// It reads the literal form only: `t("…")` and `t('…')`. A key built at run time
// is invisible here, which is a limit worth knowing rather than working around —
// a dynamic key is a key no static check can follow, and the answer to one is to
// not write it.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC = "src";
const LOCALES = "public/locales";

/**
 * `t("…")`, with the quote style captured so an apostrophe inside a
 * double-quoted string does not end it early. The lazy body stops at the first
 * unescaped matching quote.
 */
const CALL = /\bt\(\s*(["'])((?:(?!\1)[^\\]|\\.)*?)\1/g;

const sources = [];
const walk = (directory) => {
    for (const entry of readdirSync(directory)) {
        const path = join(directory, entry);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.tsx?$/.test(entry)) sources.push(path);
    }
};
walk(SRC);

/** Every key the screens ask for, and one place each is asked from. */
const used = new Map();
for (const path of sources) {
    const text = readFileSync(path, "utf8");
    for (const [, , raw] of text.matchAll(CALL)) {
        const key = raw.replace(/\\"/g, '"').replace(/\\'/g, "'").replace(/\\\\/g, "\\");
        if (!used.has(key)) used.set(key, path);
    }
}

const languages = readdirSync(LOCALES).filter(name =>
    statSync(join(LOCALES, name)).isDirectory());

let failed = false;

for (const language of languages) {
    const file = join(LOCALES, language, "translation.json");
    const have = new Set(Object.keys(JSON.parse(readFileSync(file, "utf8"))));
    const missing = [...used.keys()].filter(key => !have.has(key)).sort();

    if (missing.length === 0) {
        console.log(`  ok   ${language}: all ${used.size} keys are present`);
        continue;
    }

    failed = true;
    console.error(`  FAIL ${language}: ${missing.length} of ${used.size} keys missing`);
    for (const key of missing) {
        console.error(`         ${JSON.stringify(key)}  — ${used.get(key)}`);
    }
}

// Reported, never failed on. A key left behind after a screen was rewritten
// costs nothing at run time, and failing a build over one would make deleting a
// screen harder than adding it.
for (const language of languages) {
    const file = join(LOCALES, language, "translation.json");
    const orphans = Object.keys(JSON.parse(readFileSync(file, "utf8")))
        .filter(key => !used.has(key));
    if (orphans.length > 0) {
        console.log(`  note ${language}: ${orphans.length} key(s) no screen asks for`);
    }
}

if (failed) {
    console.error("\ni18n check failed: a missing key renders as English, in every language.");
    process.exit(1);
}

console.log("\ni18n check passed");
