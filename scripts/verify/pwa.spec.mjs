// The runner for the installability checks: one test per `pwa-*.mjs`.
//
// **A third glob, and no script in two of them.** `ui.spec.mjs` collects
// `verify-*` and gates CI, `sweep.spec.mjs` collects `sweep-*` and measures a
// phone, and these collect `pwa-*`. The reason for a runner of its own is not
// tidiness: the other two start `npm run dev`, where registration is off
// because it is guarded on `import.meta.env.PROD`. Only a build has a service
// worker to check.
import { readdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "@playwright/test";
import { usePage } from "./harness.mjs";

const here = dirname(fileURLToPath(import.meta.url));

const scripts = readdirSync(here)
    .filter(name => name.startsWith("pwa-") && name.endsWith(".mjs"))
    .sort();

for (const script of scripts) {
    const name = script.replace(/^pwa-/, "").replace(/\.mjs$/, "");

    test(name, async ({ page }) => {
        usePage(page);
        // A fresh query on every import, for the reason `ui.spec.mjs` gives: the
        // module registry is per process, and a cache hit executes nothing and
        // passes for having done no work.
        await import(`./${script}?run=${Date.now()}-${Math.random()}`);
    });
}
