// The name this browser gives itself.
//
// **The module is driven directly, and that is deliberate.** This suite runs
// against the fake API, so `ApiFactory` never builds an `HttpClient` and nothing
// ever asks for a device id — a check that waited for the application to mint
// one would be asserting which API implementation is configured. What the module
// owns is minting, persistence and surviving a browser that refuses storage, and
// that is what is checked here. Whether the header actually travels is the
// end-to-end spec's, because only a real Server can see it.
//
// The storage case matters more than it looks. `localStorage` does not return
// nothing when it is unavailable — it **throws**, in a private window and
// wherever site data is blocked — so an unguarded read would take a screen down
// for a value nothing is worth failing a submission for.
import { open, results } from "./harness.mjs";

const APP = process.env.APP ?? "http://localhost:5180";
const { evaluate, wait, go, close } = await open();
const { check, report } = results();

/**
 * Calls the module.
 *
 * No cache-busting query: Vite refuses to resolve one on a `.ts` path, and the
 * module holds no state of its own — `deviceId()` reads storage on every call —
 * so a cache hit answers exactly as a fresh import would.
 */
const mint = () => evaluate(`
    const module = await import("/src/utils/deviceId.ts");
    return module.deviceId() ?? null;
`);

await go(`${APP}/?fakeUser=amy`, `document.body.innerText.length > 0`);
await wait(400);

// ── an id is minted, and it is one ──────────────────────────────────────────

const first = await mint();
check(first !== null, "the browser minted an id for itself");
check(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(first ?? ""),
    `and it is a v4 UUID (${first ?? "none"})`);

const stored = await evaluate(`return localStorage.getItem("aj.deviceId");`);
check(stored === first, "and it is the one in storage");

// ── the same browser, twice and after a reload ──────────────────────────────

check(await mint() === first, "asking again gives the same id, not a second one");

await go(`${APP}/?fakeUser=amy`, `document.body.innerText.length > 0`);
await wait(400);
check(await mint() === first, "and so does asking after a reload");

// ── a browser that refuses storage still works ──────────────────────────────
//
// Storage is broken deliberately, then the module is asked again. Anything but
// `undefined` here means an unguarded call reached a throwing API, and the
// screen that made it would have gone down with it.
const withoutStorage = await evaluate(`
    const real = Object.getOwnPropertyDescriptor(Window.prototype, "localStorage");
    Object.defineProperty(window, "localStorage", {
        configurable: true,
        get() { throw new DOMException("refused", "SecurityError"); },
    });
    let outcome;
    try {
        const module = await import("/src/utils/deviceId.ts");
        outcome = module.deviceId() === undefined ? "no id, no throw" : "an id from nowhere";
    } catch (e) {
        outcome = "threw: " + e.message;
    }
    if (real) Object.defineProperty(window, "localStorage", real);
    return outcome;
`);

check(
    withoutStorage === "no id, no throw",
    `a browser refusing storage gets no id and no error (${withoutStorage})`);

await close();
report();
