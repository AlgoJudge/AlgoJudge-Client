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

const { WebSocketEvents, eventUrl } = await import(`../${OUT}/api/ws/WebSocketEvents.js`);
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

// 3 — what a newer Server or a broken one might send.
socket.deliver({ type: "somethingThisBuildHasNeverHeardOf", data: {} });
socket.deliver("{ not json");
socket.deliver({ data: { withoutAType: true } });
check(heard.core.length + heard.participant.length + heard.manager.length === 3,
    "an unknown type, a malformed frame and a typeless one are all ignored");

// 4 — a dropped connection comes back, and a stopped one does not.
socket.emit("close", {});
check(StubSocket.opened.length === 1, "a dropped connection is not reopened at once");
await wait(1300);
check(StubSocket.opened.length === 2, "it is reopened after backing off");

events.stop();
const stopped = StubSocket.opened.length;
StubSocket.opened[1].emit("close", {});
await wait(1300);
check(StubSocket.opened.length === stopped, "and a connection stopped on purpose stays shut");

console.log(failed ? `\nFAILED: ${failed}` : "\nevent check passed");
process.exitCode = failed ? 1 : 0;
