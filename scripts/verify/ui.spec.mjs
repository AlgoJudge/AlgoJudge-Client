// The runner: one test per verification script.
//
// **The only file Playwright collects here.** The scripts beside it are scripts
// — a sequence of top-level `await`s against a tab — and that is what they stay.
// Wrapping each of them in a `test(…)` of its own would have re-indented five
// thousand lines of assertions to gain nothing a reader could see; importing
// them from here costs two changed lines per script and leaves the bodies, and
// the traps they encode, exactly as they were.
//
// It replaces `run.mjs`, which did the same enumeration by hand and also had to
// find a browser, close it again, and clear the last script's `localStorage`
// out of the next one's way. Playwright does all three: `webServer` starts the
// application, its browsers come with it, and every test gets its own context.
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "@playwright/test";
import { usePage } from "./harness.mjs";

const here = dirname(fileURLToPath(import.meta.url));

const scripts = readdirSync(here)
    .filter(name => name.startsWith("verify-") && name.endsWith(".mjs"))
    .sort();

for (const script of scripts) {
    // Named without the prefix and the extension, so `-g boards` finds
    // `verify-boards.mjs` — the substring form `README.md` documents keeps
    // working, and reads the same in Playwright's report.
    const name = script.replace(/^verify-/, "").replace(/\.mjs$/, "");

    test(name, async ({ page }) => {
        usePage(page);
        // **A fresh query on every import.** The module registry is per process
        // and a worker runs several of these; without it, the second run of a
        // script in one worker would be a cache hit that executes nothing and
        // passes for having done no work.
        await import(`./${script}?run=${Date.now()}-${Math.random()}`);
    });
}
