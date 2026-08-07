import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Runs the browser checks.
 *
 * **Not a gate.** These drive a real browser against the fake API, so they need
 * a dev server and a Chrome, they take minutes, and a few of them wait on the
 * clock — the seed opens a round forty-five seconds after load. CI runs the
 * gate; this is run by hand when a screen changes.
 *
 *     npm run check:ui              every script
 *     npm run check:ui -- boards    only those whose name contains "boards"
 *
 * See `README.md` beside this file for what they cover and the traps they
 * encode.
 */

const here = dirname(fileURLToPath(import.meta.url));
const APP = process.env.APP ?? "http://localhost:5180";
const PORT = process.env.CDP_PORT ?? "9333";
const OUT = process.env.OUT ?? join(here, "out");

/** Where Chrome usually is, when `CHROME` does not say. */
const CHROME_PATHS = [
    process.env.CHROME,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
].filter(Boolean);

const reachable = async (url) => {
    try {
        await fetch(url, { signal: AbortSignal.timeout(2000) });
        return true;
    } catch {
        return false;
    }
};

const waitFor = async (url, seconds) => {
    for (let i = 0; i < seconds * 2; i++) {
        if (await reachable(url)) return true;
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    return false;
};

/**
 * The dev server, which is **not** started here.
 *
 * Starting it would mean owning its lifetime and its port; saying how to start
 * it costs one message. The environment variable is the part worth printing:
 * `npm run dev` alone serves the real HTTP client, every call 404s, and every
 * script times out on a login screen with no explanation.
 */
const requireApp = async () => {
    if (await reachable(APP)) return;
    console.error(`No application at ${APP}. Start one with the fake API:\n`
        + `\n    VITE_APP_USE_FAKE_API=true npm run dev -- --port 5180 --strictPort\n`
        + `\nor point these at another one with APP=<url>.`);
    process.exit(2);
};

/** Chrome, started here and stopped again unless it was already running. */
const requireChrome = async () => {
    if (await reachable(`http://127.0.0.1:${PORT}/json/version`)) return undefined;

    const binary = CHROME_PATHS.find(path => existsSync(path));
    if (!binary) {
        console.error(`No Chrome found and none listening on ${PORT}. Set CHROME=<path>, or start one:\n`
            + `\n    chrome --headless=new --remote-debugging-port=${PORT} --user-data-dir=<a scratch dir>\n`);
        process.exit(2);
    }

    const profile = join(OUT, "chrome-profile");
    mkdirSync(profile, { recursive: true });
    const chrome = spawn(binary, [
        "--headless=new",
        `--remote-debugging-port=${PORT}`,
        `--user-data-dir=${profile}`,
        "--disable-gpu",
        "--no-first-run",
        "about:blank",
    ], { stdio: "ignore", detached: false });

    if (!await waitFor(`http://127.0.0.1:${PORT}/json/version`, 20)) {
        chrome.kill();
        console.error(`Chrome did not answer on ${PORT}.`);
        process.exit(2);
    }
    return chrome;
};

/**
 * Forgets what the last script left in the browser.
 *
 * The language and the colour scheme live in `localStorage`, shared by every tab
 * on the origin, so a script that switched to English and left it there made
 * every later script fail on Polish text it was right to expect — three of them
 * did, and each looked like a defect in the screen it was testing.
 *
 * Done **here** rather than in `cdp.mjs` alone: more than half the scripts
 * predate that harness and carry their own copy, so a guarantee that lives in it
 * is a guarantee half the suite does not get.
 */
const forget = async () => {
    const version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
    const socket = new WebSocket(version.webSocketDebuggerUrl);
    await new Promise(resolve => socket.addEventListener("open", resolve, { once: true }));
    socket.send(JSON.stringify({
        id: 1,
        method: "Storage.clearDataForOrigin",
        params: { origin: APP, storageTypes: "local_storage,cookies" },
    }));
    await new Promise(resolve => socket.addEventListener("message", resolve, { once: true }));
    socket.close();
};

const run = (script) => new Promise(resolve => {
    const child = spawn(process.execPath, [join(here, script)], {
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, APP, CDP_PORT: PORT, OUT },
    });
    let output = "";
    child.stdout.on("data", chunk => { output += chunk; });
    child.stderr.on("data", chunk => { output += chunk; });
    child.on("close", code => resolve({ code, output }));
});

const filter = process.argv[2];
const scripts = readdirSync(here)
    .filter(name => name.startsWith("verify-") && name.endsWith(".mjs"))
    .filter(name => !filter || name.includes(filter))
    .sort();

if (scripts.length === 0) {
    console.error(filter ? `No script matches "${filter}".` : "No scripts to run.");
    process.exit(2);
}

mkdirSync(OUT, { recursive: true });
await requireApp();
const chrome = await requireChrome();

// One at a time. They share an origin, so two at once would write over each
// other's stored preferences — the theme, the language, whether the submissions
// panel is open.
const failed = [];
for (const script of scripts) {
    await forget();
    const started = Date.now();
    const { code, output } = await run(script);
    const seconds = Math.round((Date.now() - started) / 1000);
    if (code === 0) {
        const passed = (output.match(/^ {2}ok {2}/gm) ?? []).length;
        console.log(`  ok    ${script.padEnd(30)} ${String(passed).padStart(3)} checks  ${seconds}s`);
    } else {
        failed.push(script);
        console.log(` FAIL   ${script.padEnd(30)} ${seconds}s`);
        console.log(output.split("\n").filter(line => /^ FAIL|Error/.test(line))
            .map(line => `        ${line.trim()}`).join("\n"));
    }
}

chrome?.kill();
console.log(failed.length === 0
    ? `\nall ${scripts.length} scripts passed`
    : `\n${failed.length} of ${scripts.length} failed: ${failed.join(", ")}`);
process.exit(failed.length === 0 ? 0 : 1);
