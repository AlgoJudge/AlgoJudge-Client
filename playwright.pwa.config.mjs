import { defineConfig } from "@playwright/test";

/**
 * The installability checks, against a real build.
 *
 *     npm run check:pwa
 *
 * **It builds and previews rather than running the dev server**, which is the
 * one thing that separates this configuration from the other two. Registration
 * is guarded on `import.meta.env.PROD`, so under `npm run dev` there is no
 * service worker to find — deliberately, because `check:ui` and `check:mobile`
 * run there and no script in either clears Cache Storage.
 *
 * `VITE_APP_USE_FAKE_API` has to be set for the **build**: the built
 * `index.html` only carries `window.__ALGOJUDGE__ = {}` until
 * `docker-entrypoint.sh` rewrites it, and `vite preview` never runs the
 * entrypoint, so the flag has to be baked in.
 */
export default defineConfig({
    testDir: "./scripts/verify",
    // The `**/` is load-bearing: `testMatch` is matched against the whole path,
    // and a pattern that matches nothing reports a clean run of zero tests.
    testMatch: "**/pwa.spec.mjs",

    workers: 1,
    fullyParallel: false,
    retries: 0,
    reporter: "list",
    timeout: 300_000,

    use: {
        baseURL: process.env.APP ?? "http://localhost:5182",
        locale: "pl-PL",
        // **Pinned, because dates are now drawn in the reader's zone.** Left to
        // the host this is Europe/Warsaw here and UTC on CI, and every assertion
        // on a rendered time would mean something different in the two places.
        // Warsaw is the fixtures' own zone, which makes this the "reader sits in
        // the activity's zone" case; the traveller is `zones.spec.mjs`.
        timezoneId: "Europe/Warsaw",
        viewport: { width: 1500, height: 1200 },
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
    },

    webServer: {
        command: "npm run build && npx vite preview --port 5182 --strictPort",
        env: { VITE_APP_USE_FAKE_API: "true" },
        url: process.env.APP ?? "http://localhost:5182",
        // **Never reused, unlike the other two.** A preview server already
        // listening is serving an older `dist/`, and the whole point here is to
        // check what this working copy builds.
        reuseExistingServer: false,
        timeout: 300_000,
        stdout: "ignore",
        stderr: "pipe",
    },
});
