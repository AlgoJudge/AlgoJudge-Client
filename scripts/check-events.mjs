// Exercises the event socket: where an address comes from, which dispatcher a
// frame reaches, what happens to a frame nobody understands, and whether a
// closed connection comes back.
//
// No browser and no Server: `WebSocket` is a global, so a stub in its place is
// enough to drive the real class. The dispatchers are the real ones — they are
// built on `EventTarget`, which Node has.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = ".events-check";

execFileSync("npx", ["tsc", "src/api/ws/WebSocketEvents.ts",
    "--outDir", OUT, "--rootDir", "src",
    "--module", "esnext", "--target", "es2022", "--moduleResolution", "bundler", "--skipLibCheck",
], { stdio: "inherit", shell: process.platform === "win32" });

// The application resolves extensionless imports through Vite; Node does not.
const addExtensions = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) addExtensions(path);
        else if (entry.name.endsWith(".js")) {
            writeFileSync(path, readFileSync(path, "utf8")
                .replace(/(from\s+")(\.[^"]*?)(")/g, (all, a, specifier, b) =>
                    specifier.endsWith(".js") ? all : `${a}${specifier}.js${b}`));
        }
    }
};
addExtensions(OUT);

/** Stands in for the browser's WebSocket, and records what was asked of it. */
class StubSocket {
    static opened = [];
    constructor(url) {
        this.url = url;
        this.listeners = new Map();
        this.closed = false;
        StubSocket.opened.push(this);
    }
    addEventListener(type, listener) {
        if (!this.listeners.has(type)) this.listeners.set(type, []);
        this.listeners.get(type).push(listener);
    }
    close() {
        this.closed = true;
        this.emit("close", {});
    }
    emit(type, event) {
        for (const listener of this.listeners.get(type) ?? []) listener(event);
    }
    /** What the Server would send. */
    deliver(frame) {
        this.emit("message", { data: typeof frame === "string" ? frame : JSON.stringify(frame) });
    }
}
globalThis.WebSocket = StubSocket;

const { WebSocketEvents, eventUrl, CORE, PARTICIPANT, MANAGER } = await import(`../${OUT}/api/ws/WebSocketEvents.js`);
const { CoreEventDispatcherImpl } = await import(`../${OUT}/api/impl/CoreEventDispatcherImpl.js`);
const { ParticipantEventDispatcherImpl } = await import(`../${OUT}/api/impl/ParticipantEventDispatcher.js`);
const { ManagerEventDispatcherImpl } = await import(`../${OUT}/api/impl/ManagerEventDispatcher.js`);

let failed = 0;
const check = (ok, what) => {
    console.log(`${ok ? "  ok  " : " FAIL "} ${what}`);
    if (!ok) failed++;
};
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

// 1 — the address, from the API's own.
globalThis.window = { location: { origin: "https://judge.example.edu.pl" } };
check(eventUrl("https://api.example.com/api/v1") === "wss://api.example.com/api/v1/ws",
    "an API on its own host gives a secure socket on the same host");
check(eventUrl("http://localhost:5199/api/v1") === "ws://localhost:5199/api/v1/ws",
    "plain HTTP gives a plain socket, which is what localhost is");
check(eventUrl("/api/v1") === "wss://judge.example.edu.pl/api/v1/ws",
    "a relative base gives the origin the application came from");
check(eventUrl("/api/v1/") === "wss://judge.example.edu.pl/api/v1/ws",
    "and a trailing slash does not become a double one");

// 2 — routing. The three dispatchers are separate audiences, not separate wires.
const core = new CoreEventDispatcherImpl();
const participant = new ParticipantEventDispatcherImpl();
const manager = new ManagerEventDispatcherImpl();
const heard = { core: [], participant: [], manager: [] };
const forever = new AbortController().signal;
core.addEventListener("systemMessage", evt => heard.core.push(evt), forever);
participant.addEventListener("submissionStateChanged", evt => heard.participant.push(evt), forever);
const series = [];
participant.addEventListener("seriesChanged", evt => series.push(evt), forever);
manager.addEventListener("runnerChanged", evt => heard.manager.push(evt), forever);

const events = new WebSocketEvents("wss://example/api/v1/ws", core, participant, manager);
events.start();
check(StubSocket.opened.length === 1, "starting opens exactly one connection");
check(StubSocket.opened[0].url === "wss://example/api/v1/ws", "at the address it was given");

const socket = StubSocket.opened[0];
socket.deliver({ type: "systemMessage", data: { message: "hello", type: "info" } });
socket.deliver({ type: "submissionStateChanged", data: { activityId: "a1", submission: { id: "s1" } } });
socket.deliver({ type: "runnerChanged", data: { runner: { id: "r1" } } });
check(heard.core.length === 1 && heard.core[0].data.message === "hello",
    "a core event reaches the core dispatcher");
check(heard.participant.length === 1 && heard.participant[0].data.activityId === "a1",
    "a participant event reaches the participant dispatcher");
check(heard.manager.length === 1 && heard.manager[0].data.runner.id === "r1",
    "a manager event reaches the manager dispatcher");

// Everything that happens to a series arrives as one type carrying what changed,
// so the routing has to hand the whole payload over rather than a flag.
socket.deliver({
    type: "seriesChanged",
    data: { activityId: "a1", series: { id: "r1", name: "Runda 1" }, change: "paused" },
});
check(series.length === 1 && series[0].data.change === "paused",
    "a series change reaches the participant dispatcher, with what changed");
socket.deliver({
    type: "seriesChanged",
    data: { activityId: "a1", series: { id: "r1" }, change: "somethingNewerThanThisBuild" },
});
check(series.length === 2 && series[1].data.change === "somethingNewerThanThisBuild",
    "and a kind of change this build has never heard of is still delivered, not dropped");

// The manager's series event is a **different name** on the wire, not the same
// one carrying a different payload. It shared `seriesChanged` until 2026-08-08,
// and because routing is an if/else-if chain that tests the participant record
// first, the manager dispatcher could never be reached: this listener was dead
// code and no check could see it. The envelope carries no scope, so the only
// thing that can tell the two apart is the name.
const managerSeries = [];
manager.addEventListener("managerSeriesChanged", evt => managerSeries.push(evt), forever);
socket.deliver({
    type: "managerSeriesChanged",
    data: { activityId: "a1", series: { id: "r1", name: "Runda 1", order: 1 } },
});
check(managerSeries.length === 1 && managerSeries[0].data.series.order === 1,
    "the manager's series event reaches the manager dispatcher, carrying its own shape");
check(series.length === 2,
    "and does not also land on the participant one, which would read `series.change` off it");

// 3 — what a newer Server or a broken one might send.
socket.deliver({ type: "somethingThisBuildHasNeverHeardOf", data: {} });
socket.deliver("{ not json");
socket.deliver({ data: { withoutAType: true } });
check(heard.core.length + heard.participant.length + heard.manager.length + series.length === 5,
    "an unknown type, a malformed frame and a typeless one are all ignored");

// 4 — a dropped connection comes back, and a stopped one does not.
//     Coming back is what the screens have to hear about: nothing was replayed
//     while it was down, so whoever is showing something asks again.
let restored = 0;
const unsubscribe = events.onRestored(() => restored++);

socket.emit("open", {});
check(restored === 0, "a first connection is not a return, and notifies nobody");

socket.emit("close", {});
check(StubSocket.opened.length === 1, "a dropped connection is not reopened at once");
await wait(1300);
check(StubSocket.opened.length === 2, "it is reopened after backing off");

StubSocket.opened[1].emit("open", {});
check(restored === 1, "coming back notifies exactly once");

unsubscribe();
StubSocket.opened[1].emit("close", {});
await wait(1300);
StubSocket.opened[2]?.emit("open", {});
check(restored === 1, "and an unsubscribed listener hears nothing further");

events.stop();
const stopped = StubSocket.opened.length;
StubSocket.opened[stopped - 1].emit("close", {});
await wait(1300);
check(StubSocket.opened.length === stopped, "a connection stopped on purpose stays shut");

// Starting again after a deliberate stop is a first connection, not a return:
// the screens were not left showing anything stale by a stop they asked for.
let afterStop = 0;
events.onRestored(() => afterStop++);
events.start();
StubSocket.opened[StubSocket.opened.length - 1].emit("open", {});
check(afterStop === 0, "and starting again afterwards is a first connection, not a return");
events.stop();

// ── 5 — the two sides name the same things ──────────────────────────────────
//
// Everything above proves the transport carries a frame to the right place. It
// cannot see the failure that actually happened: the Server declaring a name
// this Client has never heard of, or listening for one the Server never sends.
// Fourteen of those were live at once on 2026-08-08, each with a screen waiting
// on a frame no code path produced, and nothing failed a build.
//
// The Server commits its catalogue beside `openapi.json`, for the same reason
// and read the same way. Given one, this diffs against it; given none, it says
// so rather than passing quietly.
const catalogue = process.argv[2];
if (catalogue) {
    const { events: served, transport = [] } =
        JSON.parse(readFileSync(catalogue, "utf8"));

    const known = [...new Set([...Object.keys(CORE), ...Object.keys(PARTICIPANT), ...Object.keys(MANAGER)])];

    const unheard = served.filter(name => !known.includes(name));
    const unsent = known.filter(name => !served.includes(name));

    console.log("");
    check(unheard.length === 0,
        `every name the Server sends has a dispatcher here${unheard.length ? `: ${unheard.join(", ")}` : ""}`);
    check(unsent.length === 0,
        `and every name this Client listens for is one the Server sends${unsent.length ? `: ${unsent.join(", ")}` : ""}`);

    // The keep-alive is deliberately outside the event union — nothing
    // subscribes to it — so it must be dropped rather than routed.
    for (const frame of transport) {
        const before = heard.core.length + heard.participant.length + heard.manager.length;
        StubSocket.opened[StubSocket.opened.length - 1]?.deliver?.({ type: frame, data: {} });
        const after = heard.core.length + heard.participant.length + heard.manager.length;
        check(before === after, `the ${frame} frame is dropped rather than dispatched`);
    }
} else {
    console.log("\nNo event catalogue given, so the two sides were not compared.");
    console.log("The Server commits one at AlgoJudge-Server/events.json:");
    console.log("    npm run check:events -- ../AlgoJudge-Server/events.json");
}

console.log(failed ? `\nFAILED: ${failed}` : "\nevent check passed");
process.exitCode = failed ? 1 : 0;
