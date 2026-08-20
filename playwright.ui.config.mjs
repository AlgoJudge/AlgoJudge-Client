// The browser checks: every screen, against the fake API, in a browser.
//
// **Separate from `playwright.config.mjs` on purpose.** That one is the
// full-stack test — one spec, pointed at a Server, a database and a Runner that
// are already up, starting nothing itself. This one starts a dev server, talks
// to no backend at all, and holds thirty-seven scripts. Two suites with opposite
// needs in one config would mean every run deciding which half it was.
//
// What this file is for is the reason these were not in CI: they needed a dev
// server **and** a browser, and there was no orchestration for either.
// `webServer` below is the first half and Playwright's own browsers are the
// second.
import { defineConfig } from "@playwright/test";

export default defineConfig({
    // Left where they are rather than moved under `e2e/`. Five thousand lines
    // keep their history, and `README.md` — which carries the traps these
    // scripts encode and is the most valuable text in the directory — stays
    // beside what it documents.
    testDir: "./scripts/verify",
    // **One file, and it is the runner.** `ui.spec.mjs` enumerates the
    // `verify-*.mjs` scripts and makes a test of each. Collecting those directly
    // instead would execute every one of them at discovery, before a single test
    // had started, because a script's work is all at its top level.
    //
    // The `**/` is load-bearing too: a `testMatch` glob is matched against the
    // whole path rather than the basename, and a pattern that matches nothing is
    // reported as a clean run of zero tests — which reads exactly like success.
    testMatch: "**/ui.spec.mjs",

    /**
     * **Four at a time, measured on 2026-08-20.**
     *
     * The old runner was serial because every script shared one browser and
     * they wrote over each other's stored preferences. Each test has its own
     * context now, so nothing is shared and the reason is gone: **17.0 minutes
     * became 4.5**, with the same 447 checks.
     *
     * `fullyParallel` is what makes the number do anything. All thirty-seven
     * tests live in one file — `ui.spec.mjs` — and Playwright distributes whole
     * files across workers by default, so without this a second worker would
     * have nothing to take.
     *
     * **Two on CI, four here.** This machine has sixteen cores; a GitHub-hosted
     * `ubuntu-latest` has four, and four workers there would be full
     * subscription of a box that is also serving the dev server. The CI number
     * is a judgement rather than a measurement — the run that lands with this
     * change is what measures it.
     *
     * **Raising it further buys little.** `verify-results` alone takes 2.1
     * minutes, waiting on a round the fake opens forty-five seconds after load,
     * so it is the floor no number of workers goes under.
     *
     * **What parallelism cost, stated because it will happen again**: the first
     * four-at-a-time run failed `verify-activity`, and it was a race the script
     * had carried all along — `go()` waiting for a word that the sidebar already
     * showed, then clicking a list that had not arrived. Contention made it
     * likely instead of rare. A script that reddens only under load is that bug,
     * not this setting, and the fix is the one `README.md` prescribes: wait for
     * the decision rather than for a word that is true too early.
     */
    workers: process.env.CI ? 2 : 4,
    fullyParallel: true,

    /**
     * No retries, as in the other config and for the same reason.
     *
     * `scripts/verify/README.md` is right that one red script in a green run is
     * more likely a race than a regression — but that is advice to a person
     * about re-running it by hand, not a licence for the runner to hide it. In
     * CI this suite does not gate, so nothing needs a retry to stay green.
     */
    retries: 0,

    /**
     * Generous, because these are minutes-long by nature.
     *
     * **Measured, not guessed**: on the run of 2026-08-18 that this migration
     * was compared against, `verify-nav` took **209 seconds** and three others
     * were over a minute. The default thirty seconds would fail half the suite
     * for being what it is, and a three-minute ceiling would have failed the
     * longest one — which is exactly the sort of number that has to come off a
     * clock rather than out of a habit.
     */
    timeout: 420_000,

    reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],

    use: {
        // The scripts build their own URLs from `APP`, which is how they were
        // written and how they can still be pointed at a preview build. This is
        // here for Playwright's own reporting rather than for them.
        baseURL: process.env.APP ?? "http://localhost:5180",
        // Polish, because that is what the screens are asserted in.
        locale: "pl-PL",
        viewport: { width: 1500, height: 1200 },
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
    },

    /**
     * The dev server, started here.
     *
     * **`VITE_APP_USE_FAKE_API` is not optional.** Without it the Client serves
     * the real HTTP client, every call 404s, the application sits on the login
     * screen, and every script times out saying only that it waited for
     * something that never came. It is passed through `env` rather than written
     * into the command because a `VAR=value` prefix is shell syntax that Windows
     * does not have.
     */
    webServer: {
        command: "npm run dev -- --port 5180 --strictPort",
        env: { VITE_APP_USE_FAKE_API: "true" },
        url: process.env.APP ?? "http://localhost:5180",
        // A developer usually has one open already. CI never does.
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        stdout: "ignore",
        stderr: "pipe",
    },
});
