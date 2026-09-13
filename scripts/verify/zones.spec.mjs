// The traveller's runner.
//
// **Its own spec file, and its own project.** `playwright.ui.config.mjs` gives
// this one `timezoneId: "America/New_York"`; `ui.spec.mjs` runs everything else
// in Europe/Warsaw. A second project without a `testMatch` of its own would
// collect `ui.spec.mjs` again — seventy more tests, twice the wall clock — and
// `check:ui -- <word>` greps the project name along with the title.
//
// The script is `zones-check.mjs` rather than `verify-zones.mjs` deliberately:
// `ui.spec.mjs` enumerates `verify-*.mjs`, and a name matching that pattern
// would also run it in Warsaw, where every assertion here is false by design.
import { test } from "@playwright/test";
import { usePage } from "./harness.mjs";

test("zones", async ({ page }) => {
    usePage(page);
    await import(`./zones-check.mjs?run=${Date.now()}-${Math.random()}`);
});
