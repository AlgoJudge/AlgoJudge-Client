// Starting a browser and being able to close that one again.
//
// **The whole point is the second half.** A browser started for a check and then
// orphaned — by Ctrl+C, by a throw, by a runner that adopted one and forgot it —
// leaves a process nobody can name afterwards, and the tempting cure for a
// process nobody can name is to kill every browser on the machine by image name.
// That cure takes somebody's own windows with it.
//
// So every browser started here is written to a registry that outlives the
// process that started it, and nothing is ever closed by name: a kill needs a
// pid **and** a live process whose command line still carries our own profile
// directory. `browsers.mjs` beside this file is the tool that reads it.
import { spawn, execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);
const windows = process.platform === "win32";

/**
 * Everything this module owns, in one directory outside every repository.
 *
 * Outside on purpose: the registry has to survive the death of whatever wrote
 * it, a `git clean`, and a change of branch, and it has to be readable by a
 * throwaway measurement script run from somewhere else entirely.
 *
 * The profiles live under it too, and that is what makes a sweep possible: this
 * path is then the one substring that tells our browsers from everybody's. No
 * personal browser has it on its command line.
 */
export const ROOT = join(tmpdir(), "algojudge-browsers");
export const REGISTRY = join(ROOT, "registry.json");
export const PROFILES = join(ROOT, "profiles");

const BINARIES = {
    chrome: [
        process.env.CHROME,
        "C:/Program Files/Google/Chrome/Application/chrome.exe",
        "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/usr/bin/google-chrome",
        "/usr/bin/chromium",
    ],
    firefox: [
        process.env.FIREFOX,
        "C:/Program Files/Mozilla Firefox/firefox.exe",
        "C:/Program Files (x86)/Mozilla Firefox/firefox.exe",
        "/Applications/Firefox.app/Contents/MacOS/firefox",
        "/usr/bin/firefox",
    ],
};

const DEFAULT_PORT = { chrome: 9333, firefox: 9223 };

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

// ---------------------------------------------------------------- the registry

const read = () => {
    try {
        const entries = JSON.parse(readFileSync(REGISTRY, "utf8"));
        return Array.isArray(entries) ? entries : [];
    } catch {
        return [];
    }
};

// Written through a temporary name, so a reader never sees half a file and a
// crash mid-write cannot leave the registry unparseable — which would lose every
// pid in it at once.
const write = (entries) => {
    mkdirSync(ROOT, { recursive: true });
    const temporary = `${REGISTRY}.${process.pid}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(entries, null, 2)}\n`);
    renameSync(temporary, REGISTRY);
};

const record = (entry) => write([...read().filter(e => e.pid !== entry.pid), entry]);
const drop = (pid) => write(read().filter(e => e.pid !== pid));

// ------------------------------------------------------------ what is running

/**
 * A browser's own children carry its whole command line.
 *
 * Chrome's renderers, its GPU process and its crashpad handler all repeat
 * `--user-data-dir`, and Firefox's content processes repeat `--profile`. Left
 * in, one leaked browser reads as nine leaks, and the count of what is being
 * left alone becomes meaningless. The parent is the one with no `--type=` and
 * no `-contentproc`; killing it takes its children with it.
 */
const isChild = command => /--type=|-contentproc/.test(command);

/**
 * Every browser process on the machine, with its command line.
 *
 * One snapshot answers every question this module asks — is our pid still alive,
 * is it still the process we started, is there a leak the registry forgot, and
 * how many browsers belong to the person sitting here. Asking per pid instead
 * would be several hundred milliseconds each.
 */
export async function browsers({ parentsOnly = true } = {}) {
    let all;
    if (windows) {
        const script = "Get-CimInstance Win32_Process -Filter \"Name='chrome.exe' or Name='chromium.exe'"
            + " or Name='firefox.exe' or Name='msedge.exe'\""
            + " | ForEach-Object { [pscustomobject]@{ pid = $_.ProcessId; name = $_.Name; command = $_.CommandLine } }"
            + " | ConvertTo-Json -Compress";
        const { stdout } = await execute("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script],
            { maxBuffer: 16 * 1024 * 1024, windowsHide: true });
        if (!stdout.trim()) return [];
        const parsed = JSON.parse(stdout);
        // A single process comes back as an object rather than a one-element
        // array — the state right after a failed run, and the one where a sweep
        // that got this wrong would see nothing at all.
        all = (Array.isArray(parsed) ? parsed : [parsed])
            .map(p => ({ pid: Number(p.pid), name: String(p.name), command: p.command ?? "" }));
    } else {
        const { stdout } = await execute("ps", ["-eo", "pid=,args="], { maxBuffer: 16 * 1024 * 1024 });
        all = stdout.split("\n")
            .map(line => line.trim().match(/^(\d+)\s+(.*)$/))
            .filter(Boolean)
            .map(([, pid, command]) => ({ pid: Number(pid), name: command.split(/\s+/)[0].split("/").pop(), command }))
            .filter(p => /^(google-)?chrome|chromium|firefox|msedge/i.test(p.name));
    }
    return parentsOnly ? all.filter(p => !isChild(p.command)) : all;
}

/** Windows paths differ in case and in nothing that matters. */
const carries = (command, mark) => command.toLowerCase().includes(mark.toLowerCase());

/** Cheap liveness, for polling. Identity is settled separately, and before this. */
const running = (pid) => {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
};

/**
 * What is out there, sorted into the four answers worth telling apart.
 *
 * `others` is not a leftover category. It is the count that says how many
 * browsers this tool is deliberately not touching, and a sweep that cannot
 * print it has not earned the right to kill anything.
 */
export async function inventory() {
    const live = await browsers();
    const ours = [], stale = [];

    for (const entry of read()) {
        const found = live.find(p => p.pid === entry.pid);
        // Gone, or the pid was handed to something else in the meantime. Either
        // way this entry names nothing we may kill.
        if (found && carries(found.command, entry.profile)) ours.push({ ...entry, command: found.command });
        else stale.push({ ...entry, why: found ? "the pid now belongs to something else" : "the process is gone" });
    }

    const known = new Set(ours.map(o => o.pid));
    const leaked = live.filter(p => !known.has(p.pid) && carries(p.command, ROOT));
    const mine = new Set([...known, ...leaked.map(p => p.pid)]);
    return { ours, leaked, stale, others: live.filter(p => !mine.has(p.pid)) };
}

/**
 * Our own browser answering on that port, if one is.
 *
 * Matched to the end of the number, not by substring: Chrome writes
 * `--remote-debugging-port=9333` and Firefox writes it with a space, and a plain
 * `includes` for port 933 would also find 9333.
 */
export async function mineOn(port) {
    const written = new RegExp(`remote-debugging-port[= ]${port}(\\D|$)`);
    const { ours, leaked } = await inventory();
    return [...ours, ...leaked].find(p => written.test(p.command));
}

// -------------------------------------------------------------------- stopping

/** One call, and its answer. Timed out rather than waited on: this runs against
 *  a browser that is being closed, which is not the moment to trust it to reply. */
const ask = (socket, id, method, params) => Promise.race([
    new Promise(resolve => {
        const hear = (event) => {
            const message = JSON.parse(event.data);
            if (message.id !== id) return;
            socket.removeEventListener("message", hear);
            resolve(message);
        };
        socket.addEventListener("message", hear);
        socket.send(JSON.stringify(params === undefined ? { id, method } : { id, method, params }));
    }),
    wait(5000),
]);

const gracefully = async (kind, port) => {
    try {
        const address = kind === "firefox"
            ? `ws://127.0.0.1:${port}/session`
            : (await (await fetch(`http://127.0.0.1:${port}/json/version`,
                { signal: AbortSignal.timeout(2000) })).json()).webSocketDebuggerUrl;
        const socket = new WebSocket(address);
        await new Promise((resolve, reject) => {
            socket.addEventListener("open", resolve, { once: true });
            socket.addEventListener("error", reject, { once: true });
        });
        if (kind === "firefox") {
            // **A session first.** Measured 2026-08-16 against Firefox 153:
            // `browser.close` on a bare connection answers *"WebDriver session
            // does not exist, or is not active"* and the browser stays up — the
            // close then looked like it had worked while the kill below was
            // silently doing all of it.
            await ask(socket, 1, "session.new", { capabilities: { alwaysMatch: {} } });
            await ask(socket, 2, "browser.close", {});
        } else {
            await ask(socket, 1, "Browser.close");
        }
        socket.close();
    } catch {
        // Best effort. A browser that is wedged, or that never finished
        // starting, cannot answer its own protocol — and that is exactly the one
        // worth closing. The kill below is the guarantee, not this.
    }
};

/**
 * The tree, by pid — and only after asking again what that pid is.
 *
 * **The check cannot be done once and acted on later.** Between deciding a
 * browser is ours and killing it there is a gap of seconds: the polite close
 * lands, the browser exits, the operating system is free to hand that number to
 * something else, and the kill then falls on a stranger. It is a narrow window
 * and it is the only way this code could ever close a browser it had already
 * decided not to touch, which makes it worth one extra look at the process list.
 *
 * Never `/IM`, never a process name — that part is the whole rule.
 */
export const killIfOurs = async (pid, mark) => {
    const found = (await browsers()).find(p => p.pid === pid);
    if (!found || !carries(found.command, mark)) return false;

    if (windows) {
        // `/T` because a browser's renderers are children, and killing only the
        // parent can leave them behind holding the profile directory.
        try {
            await execute("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true });
        } catch { /* already gone */ }
        return true;
    }
    try { process.kill(pid, "SIGTERM"); } catch { return true; }
    for (let i = 0; i < 20 && running(pid); i++) await wait(150);
    if (running(pid)) {
        try { process.kill(pid, "SIGKILL"); } catch { /* already gone */ }
    }
    return true;
};

/**
 * Closes one browser we started, and refuses anything else.
 *
 * The refusal is the feature. An entry whose pid now belongs to a different
 * process is not an error to report and work around — it is an answer: this
 * registry line is out of date, so drop it and kill nothing.
 */
export async function stop(entry) {
    const found = (await browsers()).find(p => p.pid === entry.pid);
    if (!found) {
        drop(entry.pid);
        return { pid: entry.pid, outcome: "gone" };
    }
    if (!carries(found.command, entry.profile)) {
        drop(entry.pid);
        return { pid: entry.pid, outcome: "refused", why: "the pid now belongs to something else" };
    }

    await gracefully(entry.kind, entry.port);
    for (let i = 0; i < 12 && running(entry.pid); i++) await wait(250);
    if (running(entry.pid)) await killIfOurs(entry.pid, entry.profile);
    drop(entry.pid);
    // Read back rather than assumed. The kill declines a pid that changed hands
    // while the polite close was being waited on, and reporting that as closed
    // would be the report saying something the code deliberately did not do.
    return running(entry.pid)
        ? { pid: entry.pid, outcome: "refused", why: "it changed hands before it could be closed" }
        : { pid: entry.pid, outcome: "closed" };
}

/**
 * Closes one pid, whichever of the three things it turns out to be.
 *
 * The fourth case is the one that matters: a pid that is a browser but not ours
 * is refused by name and by reason, rather than being killed on the grounds that
 * somebody typed it.
 */
export async function stopOne(pid) {
    const { ours, leaked, stale } = await inventory();
    const entry = ours.find(o => o.pid === pid);
    if (entry) return stop(entry);

    const orphan = leaked.find(o => o.pid === pid);
    if (orphan) {
        const closed = await killIfOurs(pid, ROOT);
        drop(pid);
        return closed
            ? { pid, outcome: "closed", why: "leaked, matched by its profile" }
            : { pid, outcome: "refused", why: "it changed hands before it could be closed" };
    }

    const forgotten = stale.find(s => s.pid === pid);
    if (forgotten) {
        drop(pid);
        return { pid, outcome: "gone", why: forgotten.why };
    }
    return { pid, outcome: "refused", why: "not one of ours" };
}

/** Everything of ours, registered or leaked. Never anything else. */
export async function stopAll() {
    const { ours, leaked, stale, others } = await inventory();
    const closed = [];
    for (const entry of ours) closed.push(await stop(entry));
    // A leak has no registry line saying which port it answers on, so it is not
    // asked politely — and its profile is a scratch directory, so there is
    // nothing in it worth closing cleanly for.
    for (const orphan of leaked) {
        const gone = await killIfOurs(orphan.pid, ROOT);
        drop(orphan.pid);
        closed.push(gone
            ? { pid: orphan.pid, outcome: "closed", why: "leaked, matched by its profile" }
            : { pid: orphan.pid, outcome: "refused", why: "it changed hands before it could be closed" });
    }
    for (const entry of stale) drop(entry.pid);
    return { closed, stale, untouched: others.length };
}

// ------------------------------------------------------------------- launching

const reachable = async (url) => {
    try {
        await fetch(url, { signal: AbortSignal.timeout(2000) });
        return true;
    } catch {
        return false;
    }
};

const answers = async (kind, port, seconds) => {
    for (let i = 0; i < seconds * 2; i++) {
        if (kind === "chrome") {
            if (await reachable(`http://127.0.0.1:${port}/json/version`)) return true;
        } else {
            // Firefox is asked the honest way: by connecting to the endpoint
            // that will carry the session. No session is created, so opening and
            // closing costs nothing.
            try {
                const socket = new WebSocket(`ws://127.0.0.1:${port}/session`);
                await new Promise((resolve, reject) => {
                    socket.addEventListener("open", resolve, { once: true });
                    socket.addEventListener("error", reject, { once: true });
                });
                socket.close();
                return true;
            } catch { /* not up yet */ }
        }
        await wait(500);
    }
    return false;
};

/**
 * Starts a browser and remembers it.
 *
 *     const browser = await launch({ kind: "firefox", name: "embedded-mode" });
 *     …
 *     await browser.stop();
 *
 * `endpoint` is what to drive it through: a DevTools browser socket for Chrome,
 * the WebDriver BiDi session endpoint for Firefox, which has had no DevTools
 * protocol since 129.
 */
export async function launch({
    kind = "chrome",
    port = DEFAULT_PORT[kind],
    name = "adhoc",
    profile = join(PROFILES, `${kind}-${name}`),
    headless = true,
    args = [],
    startedBy = process.env.npm_lifecycle_event ?? "node",
} = {}) {
    const binary = BINARIES[kind]?.filter(Boolean).find(path => existsSync(path));
    if (!binary) {
        throw new Error(`No ${kind} found. Set ${kind === "chrome" ? "CHROME" : "FIREFOX"}=<path to the executable>.`);
    }
    mkdirSync(profile, { recursive: true });

    const argv = kind === "firefox"
        // **The separate profile is what keeps this off somebody's own Firefox**,
        // and `--no-remote` is the belt to its braces. The flag exists because a
        // second `firefox.exe` can hand its command line to the one already
        // running and exit, leaving a dead pid and somebody else's browser
        // answering — but measured 2026-08-16 against Firefox 153 with a user's
        // own Firefox open, a distinct `--profile` was enough on its own: the
        // check beside this proves the process is ours, not that the flag did it.
        ? [...(headless ? ["--headless"] : []), "--no-remote",
            "--profile", profile, "--remote-debugging-port", String(port), ...args, "about:blank"]
        : [...(headless ? ["--headless=new"] : []), `--remote-debugging-port=${port}`,
            `--user-data-dir=${profile}`, "--disable-gpu", "--no-first-run", ...args, "about:blank"];

    // **Attached, but unreferenced.** Unreferenced because Node holds the event
    // loop open for a live child, so a script that launched a browser and
    // finished would hang until the browser was closed by hand — and being
    // killed for hanging is precisely how one gets orphaned. Attached because
    // staying in the caller's process group means a real Ctrl+C reaches the
    // browser too, and a leak that never happens needs no cleaning up. Neither
    // is relied on: the registry below is what actually owns the lifetime.
    const child = spawn(binary, argv, { stdio: "ignore", detached: false });
    child.unref();

    // Recorded **before** waiting for it to come up. A browser that hangs while
    // starting is the one case where the pid is otherwise lost completely: the
    // wait below can be interrupted, and then nothing on the machine knows what
    // that process was.
    const entry = {
        pid: child.pid, kind, port, profile, binary,
        startedAt: new Date().toISOString(), startedBy,
    };
    record(entry);

    if (!await answers(kind, port, 30)) {
        await stop(entry);
        throw new Error(`${kind} did not answer on ${port}.`);
    }

    const endpoint = kind === "firefox"
        ? `ws://127.0.0.1:${port}/session`
        : (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl;

    return { ...entry, endpoint, stop: () => stop(entry) };
}
