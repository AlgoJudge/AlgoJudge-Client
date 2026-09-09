// The runner for the sweeps: one test per `sweep-*.mjs`.
//
// **A second runner beside `ui.spec.mjs`, and that is the whole point.** That one
// collects `verify-*.mjs` and is the gate; these are tools somebody runs when
// they are working on the thing they measure. Two globs, two configurations, no
// script in both.
import { readdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "@playwright/test";
import { usePage } from "./harness.mjs";

const here = dirname(fileURLToPath(import.meta.url));

const scripts = readdirSync(here)
    .filter(name => name.startsWith("sweep-") && name.endsWith(".mjs"))
    .sort();

for (const script of scripts) {
    const name = script.replace(/^sweep-/, "").replace(/\.mjs$/, "");

    test(name, async ({ page }) => {
        usePage(page);
        // A fresh query on every import, for the reason `ui.spec.mjs` gives: the
        // module registry is per process, and a cache hit executes nothing and
        // passes for having done no work.
        await import(`./${script}?run=${Date.now()}-${Math.random()}`);
    });
}
