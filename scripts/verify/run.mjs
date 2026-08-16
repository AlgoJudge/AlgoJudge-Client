import { spawn } from "node:child_process";
import { mkdirSync, readdirSync } from "node:fs";
import { constants } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { launch, mineOn, stopOne } from "./browser.mjs";

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

const reachable = async (url) => {
    try {
        await fetch(url, { signal: AbortSignal.timeout(2000) });
        return true;
    } catch {
        return false;
    }
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

/**
 * Chrome, started here and stopped again — unless somebody else's was already
 * listening, which is a case worth telling apart from ours.
 *
 * **Anything answering on the port used to be adopted and then never closed.**
 * The function returned nothing, so the kill at the end was a no-op, and a
 * browser left behind by an interrupted run was inherited by every run after it
 * — for as long as the machine stayed up. `browser.mjs` can now say which of the
 * two it is: ours is a leak and gets closed, and a browser somebody started
 * themselves keeps the contract `README.md` documents and is left alone.
 */
const requireChrome = async () => {
    if (await reachable(`http://127.0.0.1:${PORT}/json/version`)) {
        const leak = await mineOn(PORT);
        if (!leak) {
            console.log(`Using the browser already listening on ${PORT}, and leaving it running.\n`);
            return undefined;
        }
        console.log(`Closing the browser an earlier run left on ${PORT} (pid ${leak.pid}).`);
        await stopOne(leak.pid);
        for (let i = 0; i < 20 && await reachable(`http://127.0.0.1:${PORT}/json/version`); i++) {
            await new Promise(resolve => setTimeout(resolve, 250));
        }
    }

    try {
        return await launch({ kind: "chrome", name: "check-ui", port: PORT, startedBy: "check:ui" });
    } catch (error) {
        console.error(`${error.message}\n`
            + `\nStart one yourself and it will be used:\n`
            + `\n    chrome --headless=new --remote-debugging-port=${PORT} --user-data-dir=<a scratch dir>\n`);
        process.exit(2);
    }
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
    try {
        // The tab the last script opened, and never closed. Every script asks
        // for one with `PUT /json/new` and ends by closing its socket, which
        // leaves the tab; over a full run that is thirty-four of them in one
        // browser. Closed here rather than in `cdp.mjs`, for the same reason the
        // clearing below is: fifteen scripts carry their own copy of the harness.
        const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
        const pages = targets.filter(t => t.type === "page");
        // One has to survive: headless Chrome exits with its last tab.
        const keep = pages.find(page => page.url === "about:blank") ?? pages[0];
        for (const page of pages) {
            if (page.id !== keep?.id) await fetch(`http://127.0.0.1:${PORT}/json/close/${page.id}`);
        }

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
    } catch (error) {
        // Reported rather than thrown. This runs at the top of the loop, and an
        // unhandled rejection here ends the process without reaching the
        // teardown below — which is one of the two ways a browser used to be
        // left running.
        console.log(`        (the browser could not be reset: ${error.message})`);
    }
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

let chrome;

/**
 * Closes the browser this run started, once, whatever ended the run.
 *
 * There used to be a single `kill()` after the loop and nothing else, so every
 * way of not reaching that line — Ctrl+C, a throw, a rejected promise — left a
 * browser running with nothing on the machine able to name it. Even this is not
 * the last line of defence: a run killed outright runs no handler at all, and
 * what covers that is the registry and `npm run browsers -- stop --all`.
 */
const shutdown = async () => {
    const it = chrome;
    chrome = undefined;
    if (it) await it.stop();
};

// Only the ones this platform has: `SIGBREAK` is Windows' own, and asking to
// listen for a signal that does not exist here throws rather than being ignored.
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"].filter(s => s in constants.signals)) {
    process.on(signal, async () => {
        console.log(`\n${signal} — closing the browser.`);
        await shutdown();
        process.exit(130);
    });
}
for (const failure of ["uncaughtException", "unhandledRejection"]) {
    process.on(failure, async (error) => {
        console.error(error);
        await shutdown();
        process.exit(1);
    });
}

const failed = [];
try {
    chrome = await requireChrome();

    // One at a time. They share an origin, so two at once would write over each
    // other's stored preferences — the theme, the language, whether the
    // submissions panel is open.
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
} finally {
    await shutdown();
}

console.log(failed.length === 0
    ? `\nall ${scripts.length} scripts passed`
    : `\n${failed.length} of ${scripts.length} failed: ${failed.join(", ")}`);
process.exit(failed.length === 0 ? 0 : 1);
