import { defineConfig } from "@playwright/test";

/**
 * The sweeps: every screen at a phone's width, measured.
 *
 * **Deliberately not part of `check:ui`.** That suite is the gate and already
 * costs six or seven minutes; forty routes at two widths would push it further
 * for something a person runs while working on layout. `sweep.spec.mjs` collects
 * `sweep-*.mjs`, `ui.spec.mjs` collects `verify-*.mjs`, and nothing is in both.
 *
 *     npm run check:mobile
 *     WIDTHS=360 npm run check:mobile
 */
export default defineConfig({
    testDir: "./scripts/verify",
    // The `**/` is load-bearing: `testMatch` is matched against the whole path,
    // and a pattern that matches nothing reports a clean run of zero tests.
    testMatch: "**/sweep.spec.mjs",

    // One at a time. A sweep is read as a report, and interleaved output from
    // four workers is not one.
    workers: 1,
    fullyParallel: false,
    retries: 0,
    reporter: "list",
    timeout: 900_000,

    use: {
        baseURL: process.env.APP ?? "http://localhost:5180",
        locale: "pl-PL",
        // Set per width by the sweep itself, after `open()` — which resets it to
        // 1500×1200 on the way in.
        viewport: { width: 360, height: 740 },
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
    },

    webServer: {
        command: "npm run dev -- --port 5180 --strictPort",
        // Without this the Client serves the real HTTP client, every call 404s,
        // and every route times out saying only that it waited.
        env: { VITE_APP_USE_FAKE_API: "true" },
        url: process.env.APP ?? "http://localhost:5180",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        stdout: "ignore",
        stderr: "pipe",
    },
});
