// The one test that drives both halves at once.
//
// Deliberately not part of `npm test` or of CI: it needs a Server, a database
// and a browser, which is the same reason `check:ui` is kept out. Run it against
// the full stack:
//
//   docker compose -f example-full-stack-docker-compose.yaml up -d --build --wait
//   npx playwright test
//
// It starts no server of its own. Pointing it at a stack that is already up is
// what makes it usable against a deployed one as well as a local build.
import { defineConfig } from "@playwright/test";

export default defineConfig({
    testDir: "./e2e",
    // One at a time: the suite writes into a shared database, and a Runner
    // claims whatever is oldest in a queue it shares with everybody.
    workers: 1,
    fullyParallel: false,
    // A flake here is a defect, not weather. Retrying would hide the race this
    // test exists to catch.
    retries: 0,
    reporter: [["list"]],
    use: {
        baseURL: process.env.E2E_APP ?? "http://localhost:8082",
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
        locale: "pl-PL",
    },
});
