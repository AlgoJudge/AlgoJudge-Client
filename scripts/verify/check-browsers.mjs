// That closing our browsers does not close anybody else's.
//
//     npm run check:browsers
//
// **This is the check the whole registry exists for.** The alternative it
// replaces — `taskkill /IM chrome.exe` — closes the browser somebody is reading
// in, and no amount of care in the calling code makes that safe. So the sweep is
// driven here against browsers that are deliberately *not* ours, and the last
// assertion is that every browser which was running when this started is still
// running when it ends.
//
// It runs a browser or two, so like `check:ui` it is not part of the gate. Run
// it when anything in `browser.mjs` changes.
import { execFile, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { results } from "./cdp.mjs";
import { browsers, inventory, killIfOurs, launch, stop, stopAll, stopOne, PROFILES, REGISTRY, ROOT } from "./browser.mjs";

const execute = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const windows = process.platform === "win32";
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const { check, report } = results();

const alive = (pid) => {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
};
const registry = () => {
    try {
        return JSON.parse(readFileSync(REGISTRY, "utf8"));
    } catch {
        return [];
    }
};

/**
 * A browser nothing will ever tidy up for us: detached, so it outlives whatever
 * started it.
 *
 * Needed because on Windows a browser started the ordinary way **dies with the
 * process that started it** — measured 2026-08-16, three times, including with
 * the shell still alive afterwards. That is a good thing to know and a good
 * thing to have, but it means a leak cannot be staged by killing a launcher.
 * These are staged directly instead: one under our own profile root, which is a
 * leak, and one outside it, which is somebody else's browser.
 */
const staged = async (binary, profile, port) => {
    await scrub(profile);
    mkdirSync(profile, { recursive: true });
    const child = spawn(binary, [
        "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
        "--disable-gpu", "--no-first-run", "about:blank",
    ], { stdio: "ignore", detached: true });
    child.unref();
    return child.pid;
};

/**
 * A scratch profile, once whatever was holding it has let go.
 *
 * Retried rather than done once: a browser's crash handler keeps a file open for
 * a moment after the browser itself is gone, and on Windows that is `EBUSY`
 * rather than a wait. Never worth failing a check over — this is a directory in
 * the temporary folder.
 */
const scrub = async (path) => {
    for (let i = 0; i < 10; i++) {
        try {
            rmSync(path, { recursive: true, force: true });
            return;
        } catch {
            await wait(300);
        }
    }
};

/** By pid and only by pid, for the browser this check is not allowed to own. */
const killByPid = async (pid) => {
    if (windows) {
        try {
            await execute("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true });
        } catch { /* already gone */ }
        return;
    }
    try { process.kill(pid, "SIGKILL"); } catch { /* already gone */ }
};

// ---------------------------------------------------------------------- before

console.log(`  ${ROOT}`);

// **Cleared first, and the baseline taken after.** A browser an earlier run left
// behind is ours to close, so counting it among the ones to leave alone would
// fail this check for doing exactly its job — which is how it read the first
// time a sabotage left one running.
const waiting = await inventory();
if (waiting.ours.length + waiting.leaked.length > 0) {
    console.log(`  ${waiting.ours.length + waiting.leaked.length} of ours were still running; closing them first.`);
    await stopAll();
}

const before = (await inventory()).others;
console.log(`  ${before.length} browser${before.length === 1 ? "" : "s"} belonging to somebody else: `
    + `${before.map(b => `${b.pid} ${b.name}`).join(", ") || "none"}`);
if (before.length === 0) {
    console.log("  Nothing personal is open, so \"it left the others alone\" proves less than usual this run.");
}

// ------------------------------------------------------- what we start, we own

const chrome = await launch({ kind: "chrome", name: "check", port: 9391, startedBy: "check:browsers" });
check(registry().some(e => e.pid === chrome.pid), "a launched Chrome is written to the registry");
check(alive(chrome.pid), "the recorded pid is a live process");
check((await fetch(`http://127.0.0.1:9391/json/version`)).ok, "and it answers the DevTools protocol on its port");

const firefox = await launch({ kind: "firefox", name: "check", port: 9392, startedBy: "check:browsers" });
check(registry().some(e => e.pid === firefox.pid), "a launched Firefox is written to the registry");
check(firefox.endpoint.endsWith("/session"), "Firefox comes back with a WebDriver BiDi endpoint, not a DevTools one");
// **That it is a Firefox of our own.** A second `firefox.exe` can hand its
// command line to the one already running and exit, which leaves a dead pid
// while somebody else's browser answers; two seconds is long enough for that to
// have happened. What rules it out is the pid still being alive, being a process
// that was not running before, and carrying our profile.
await wait(2000);
check(alive(firefox.pid), "the Firefox pid is still alive two seconds later");
check(!before.some(b => b.pid === firefox.pid), "and it is not a browser that was already running");
check((await inventory()).ours.some(o => o.pid === firefox.pid), "and it carries our own profile");

// ------------------------------------------------- what is ours, and what is not

const leakProfile = join(PROFILES, "chrome-staged-leak");
const leak = await staged(chrome.binary, leakProfile, 9395);
const decoyProfile = join(tmpdir(), "somebody-elses-browser");
const decoy = await staged(chrome.binary, decoyProfile, 9396);
await wait(2500);

const seen = await inventory();
check(seen.ours.some(o => o.pid === chrome.pid) && seen.ours.some(o => o.pid === firefox.pid),
    "the two we started are reported as ours");
check(seen.leaked.some(o => o.pid === leak), "a browser under our profile root with no registry entry is reported as leaked");
check(seen.others.some(o => o.pid === decoy), "a browser on a profile outside it is reported as somebody else's");

// The pid-reuse case, and the one that matters most: a registry line naming a
// live browser that is **not** the browser it was written for. Nothing may be
// killed on the strength of a number alone.
writeFileSync(REGISTRY, `${JSON.stringify([...registry(), {
    pid: decoy, kind: "chrome", port: 9396, profile: join(PROFILES, "chrome-check"),
    binary: chrome.binary, startedAt: new Date().toISOString(), startedBy: "check:browsers",
}], null, 2)}\n`);

const swept = await stopAll();
check(!alive(chrome.pid) && !alive(firefox.pid), "stop --all closes the browsers it started");
check(!alive(leak), "and the leak it recognised by its profile");
check(alive(decoy), "and leaves the browser on somebody else's profile running");
check(registry().length === 0, "the registry is empty afterwards");
check(swept.untouched >= before.length + 1, `it reports what it did not touch (${swept.untouched})`);

const after = await browsers();
check(before.every(b => after.some(a => a.pid === b.pid)),
    `every browser that was already running is still running (${before.length})`);

const refusal = await stopOne(decoy);
check(refusal.outcome === "refused", "asked to close that browser by pid, it refuses and says why");
check(alive(decoy), "and it is still running after being refused");

// **Straight at `stop`, not through the sweep.** Sorting by `inventory` keeps a
// planted entry away from it, so the check above passes whether or not `stop`
// looks at a command line at all — found by sabotaging that guard and watching
// twenty checks stay green. This is the path a launch handle takes: it holds an
// entry from before, and by the time it is used the pid may be somebody else's.
const direct = await stop({
    pid: decoy, kind: "chrome", port: 9396, profile: join(PROFILES, "chrome-check"),
});
check(direct.outcome === "refused", "handed that entry directly, stop refuses it too");
check(alive(decoy), "and that browser is still running");

// The last line of defence, on its own. Everything above decides whether a
// browser is ours **before** closing it politely and waiting for it to go — and
// in those few seconds the pid can be released and handed to something else. So
// the kill asks once more, and this is that question with a wrong answer.
check(await killIfOurs(decoy, join(PROFILES, "chrome-check")) === false,
    "the kill itself checks again, and declines a pid that is not ours after all");
check(alive(decoy), "so that browser survives even the last step");

await killByPid(decoy);
await scrub(decoyProfile);
await scrub(leakProfile);

// ------------------------------------------- a pid that is not a browser at all

// The other half of the pid-reuse case. Above, the number had been handed to a
// different **browser**; here it belongs to something that is not one — which is
// the likelier accident, because most of what a machine starts is not a browser.
//
// **No single sabotage reddens the survival assertions below**, and that is worth
// knowing rather than discovering later: the guards are layered, so removing any
// one of them still leaves this process alive. What one change does break is the
// classification, so that is asserted too.
const bystander = spawn(process.execPath, ["-e", "setTimeout(() => {}, 120000)"], { stdio: "ignore" });
writeFileSync(REGISTRY, `${JSON.stringify([{
    pid: bystander.pid, kind: "chrome", port: 9399, profile: join(PROFILES, "chrome-check"),
    binary: chrome.binary, startedAt: new Date().toISOString(), startedBy: "check:browsers",
}], null, 2)}
`);

const sorted = await inventory();
check(!sorted.ours.some(o => o.pid === bystander.pid), "an entry whose pid is not a browser is not counted as ours");
check(sorted.stale.some(o => o.pid === bystander.pid && o.why === "no browser is running with that pid"),
    "and it is reported as that, rather than as a process that has ended");

const untouched = await stopOne(bystander.pid);
check(untouched.outcome !== "closed", `asked to close it, nothing is closed (${untouched.outcome})`);
check(alive(bystander.pid), "the process it named is still running");
check(registry().every(e => e.pid !== bystander.pid), "and the entry is dropped rather than kept forever");
bystander.kill();

// -------------------------------------------------------------- and the runner

const APP = process.env.APP ?? "http://localhost:5180";
const reachable = await fetch(APP, { signal: AbortSignal.timeout(2000) }).then(() => true).catch(() => false);
if (!reachable) {
    console.log(`\n  skipped  the runner's own teardown — no application at ${APP}.`
        + "\n           VITE_APP_USE_FAKE_API=true npm run dev -- --port 5180 --strictPort");
} else {
    const runner = spawn(process.execPath, [join(here, "run.mjs"), "theme"], {
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, CDP_PORT: "9397" },
    });
    // **Both of these before the wait below, not after it.** Attaching the
    // close handler after a thirty-second poll misses a runner that finished
    // inside it, and then nothing ever settles; draining the pipes matters for
    // the same kind of reason — a full buffer stops the child instead of it.
    let output = "";
    runner.stdout.on("data", chunk => { output += chunk; });
    runner.stderr.on("data", chunk => { output += chunk; });
    let over = false;
    const finished = new Promise(resolve => runner.on("close", code => { over = true; resolve(code); }));

    let noted = false;
    for (let i = 0; i < 60 && !noted && !over; i++) {
        await wait(500);
        noted = registry().some(e => e.startedBy === "check:ui");
    }
    check(noted, "the runner records its browser while it is running");

    await finished;
    // Only when something went wrong: the runner's own output is what says why.
    if (!noted) console.log(output.replace(/^/gm, "           "));
    check(registry().every(e => e.startedBy !== "check:ui"), "and closes it again when it finishes");
    const left = (await inventory()).leaked;
    check(left.length === 0, "leaving nothing of ours running");
}

// A run that failed halfway leaves its browsers behind; this is not the place
// to be the thing that leaks.
if ((await inventory()).ours.length + (await inventory()).leaked.length > 0) await stopAll();
for (const name of ["chrome-check", "firefox-check"]) {
    if (existsSync(join(PROFILES, name))) await scrub(join(PROFILES, name));
}

report();
