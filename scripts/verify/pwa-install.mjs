// What makes this application installable, and what it does with the network gone.
//
// **Against a build, because there is nothing to check in development.**
// Registration is guarded on `import.meta.env.PROD`, so `npm run dev` — which
// is what the other two runners start — has no service worker at all.
// `playwright.pwa.config.mjs` builds and previews instead.
//
// **One thing it cannot reach**: the maintenance page's offline wording. The
// preview runs on the fake API, which never touches the network, so pulling the
// plug produces no failed call and no `UnreachableError`. What is checked here
// is the layer below it — that the shell survives offline and that the API is
// never answered out of a cache — and the wording is held by `check:i18n`
// having both keys in both languages.
import { open, results } from "./harness.mjs";

const APP = process.env.APP ?? "http://localhost:5182";
const { evaluate, go, wait, offline, shot, close } = await open();
const { check, report } = results();

const HOME = APP + "/?fakeUser=amy";
const DRAWN = "document.body.innerText.length > 40";

// ── The manifest, and the document that points at it ────────────────────────
await go(HOME, DRAWN);

const linked = await evaluate(`
    const link = document.querySelector("link[rel=manifest]");
    return link ? link.getAttribute("href") : "none";
`);
check(linked === "/manifest.webmanifest", "the document links a manifest (" + linked + ")");

const themed = await evaluate(`
    const meta = document.querySelector("meta[name=theme-color]");
    return meta ? meta.getAttribute("content") : "none";
`);
check(themed !== "none", "and names a theme color (" + themed + ")");

const answer = JSON.parse(await evaluate(`
    const response = await fetch("/manifest.webmanifest");
    return JSON.stringify({ ok: response.ok, body: await response.text() });
`));
check(answer.ok, "the manifest is served");

let manifest = {};
try { manifest = JSON.parse(answer.body); } catch (broken) { manifest = {}; }
check(typeof manifest.name === "string", "and parses as JSON (" + (manifest.name ?? "unparsed") + ")");

// The scope decides what stays inside the installed window. A federated sign-in
// is a full-page navigation to /api/v1/identity/providers/<slug>/challenge, so
// anything narrower than the root puts the first hop of every sign-in outside.
check(manifest.scope === "/", "its scope is the whole origin (" + manifest.scope + ")");
check(manifest.start_url === "/", "and it starts at the root (" + manifest.start_url + ")");
check(manifest.display === "standalone", "it asks for a window of its own (" + manifest.display + ")");

const icons = JSON.parse(await evaluate(`
    const manifest = await (await fetch("/manifest.webmanifest")).json();
    const out = [];
    for (const icon of manifest.icons || []) {
        const image = new Image();
        const loaded = await new Promise(done => {
            image.onload = () => done(true);
            image.onerror = () => done(false);
            image.src = icon.src;
        });
        out.push({
            src: icon.src,
            purpose: icon.purpose || "any",
            claimed: icon.sizes,
            real: loaded ? image.naturalWidth + "x" + image.naturalHeight : "unreachable",
        });
    }
    return JSON.stringify(out);
`));
for (const icon of icons) {
    check(icon.real === icon.claimed,
        "icon " + icon.src + " is the size it claims (" + icon.claimed + " vs " + icon.real + ")");
}
check(icons.some(i => i.claimed === "192x192"), "there is a 192, which is the installability floor");
check(icons.some(i => i.purpose === "maskable"), "and a maskable one, so a launcher may crop it");

// ── The worker ──────────────────────────────────────────────────────────────
const registered = await evaluate(`
    const registration = await navigator.serviceWorker.ready;
    return registration.active ? registration.active.state : "none";
`);
check(registered === "activated", "the worker reaches activated (" + registered + ")");

// A second load, which is the first one it controls — and the one that puts the
// shell and the assets in the cache.
await go(HOME, DRAWN);
const controlled = await evaluate("return navigator.serviceWorker.controller !== null;");
check(controlled === true, "and it is controlling the page");
await wait(1500);

// Ask the API for something, so the assertion below is about a request that was
// actually made rather than about one nobody issued. Under the fake nothing
// calls the API on its own, and a rule can pass for want of a subject.
await evaluate(`
    try { await fetch("/api/v1/health"); } catch (ignored) { /* the point is the attempt */ }
    return true;
`);
await wait(500);

const stored = JSON.parse(await evaluate(`
    const urls = [];
    for (const name of await caches.keys()) {
        const cache = await caches.open(name);
        for (const request of await cache.keys()) urls.push(request.url);
    }
    return JSON.stringify({ names: await caches.keys(), urls });
`));
check(stored.urls.some(u => u.indexOf("/assets/") >= 0),
    "the hashed assets are cached (" + stored.urls.filter(u => u.indexOf("/assets/") >= 0).length + " of them)");
check(stored.urls.some(u => u.endsWith("/offline.html")), "and the last-resort page is there");

// The one rule the maintenance screen depends on. A cached answer here would
// tell somebody the installation is up while it is down, and a synthesized one
// would stop `HttpClient.send` raising `UnreachableError` at all.
const api = stored.urls.filter(u => u.indexOf("/api/") >= 0);
check(api.length === 0, "and nothing under /api/ was stored (" + api.join(", ") + ")");

// ── With the plug pulled ────────────────────────────────────────────────────
await offline(true);
await go(HOME, DRAWN);
check(true, "offline, the application still draws");
await shot("pwa-offline");

const asked = await evaluate(`
    try {
        const response = await fetch("/api/v1/health");
        return "answered " + response.status;
    } catch (unreachable) {
        return "rejected";
    }
`);
check(asked === "rejected", "and a call to the API still fails rather than being answered (" + asked + ")");

// ── The last resort ─────────────────────────────────────────────────────────
//
// **Reached by taking the shell away, which is the only way to reach it.**
// Navigating to /offline.html while offline does not get there: the worker
// answers every navigation, and it prefers the cached shell — correctly, since
// the application is better than a static apology. So the shell is dropped
// first, which is the state this page exists for: a first visit made offline,
// or a cache the browser evicted.
await evaluate(`
    for (const name of await caches.keys()) {
        const cache = await caches.open(name);
        await cache.delete("/");
    }
    return true;
`);
await go(HOME, "document.body.innerText.length > 20");
const last = JSON.parse(await evaluate(`
    return JSON.stringify({
        text: document.body.innerText,
        // Its own icon is the only thing it asks for, and it is cached.
        broken: [...document.images].filter(i => !i.complete || i.naturalWidth === 0).length,
        scripts: document.scripts.length,
    });
`));
check(last.text.indexOf("Brak połączenia") >= 0 && last.text.indexOf("No connection") >= 0,
    "the last-resort page says so in both languages");
check(last.broken === 0, "and draws offline with nothing missing (" + last.broken + " broken)");
check(last.scripts === 0, "and runs no script at all (" + last.scripts + ")");
await shot("pwa-offline-last-resort");

await offline(false);
report();
await close();
