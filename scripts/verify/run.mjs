import { spawn } from "node:child_process";

/**
 * Runs the browser checks.
 *
 *     npm run check:ui              every script
 *     npm run check:ui -- boards    only those whose name contains "boards"
 *
 * **Almost nothing is left of this file, and that is the result.** It used to
 * find a Chrome or start one, adopt a browser an interrupted run had left
 * behind, close it again down four different exit paths, clear the last
 * script's `localStorage` out of the next one's way, and spawn each script as
 * its own process. Playwright does all of it: `playwright.ui.config.mjs` starts
 * the application with `webServer`, its browsers come with the dependency, and
 * every test gets a context of its own so there is nothing to clear.
 *
 * What survives is the argument. `npm run check:ui -- boards` is the form
 * `README.md` and `CLAUDE.md` document, and Playwright reads a bare argument as
 * a path filter rather than a name filter — so `boards` would match no file and
 * quietly run nothing. Translating it to `-g` here costs one line and saves
 * everybody learning that.
 */
const passed = process.argv.slice(2);

// Anything starting with `-` is Playwright's own and goes straight through;
// a bare word is the substring form and becomes `-g`.
const args = ["playwright", "test", "-c", "playwright.ui.config.mjs"];
for (const argument of passed) {
    if (argument.startsWith("-")) args.push(argument);
    else args.push("-g", argument);
}

const child = spawn("npx", args, { stdio: "inherit", shell: process.platform === "win32" });
child.on("close", code => process.exit(code ?? 1));
