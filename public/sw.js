// The service worker: a cached shell, an offline page, and nothing else.
//
// ## What it deliberately does not touch
//
// **Anything under `/api/`.** The Client turns a failed call into its own
// maintenance page: `HttpClient.send` catches a rejected `fetch` and raises
// `UnreachableError`, and `MaintenanceProvider` polls `/api/v1/health` on a
// 1s-to-30s backoff to learn it may come back. Answering any of that from a
// cache, or turning a rejection into a `Response`, breaks the one screen an
// installation shows while it is away. So the API is never intercepted, and a
// network failure stays a network failure.
//
// ## Why nothing is precached
//
// Two measurements. The built output is 11 MB and `CodeEditor` alone is 2.6 MB,
// so a precache would download the whole application to install it. And every
// name under `/assets/` is content-hashed and served `immutable`, which makes a
// cache-first rule over those URLs exactly what a precache would have bought,
// warmed by use instead of up front.
//
// The document is a third reason and a harder one: `docker-entrypoint.sh`
// rewrites the `window.__ALGOJUDGE__` line of `index.html` when the container
// starts. A copy taken at build time is the *unconfigured* document, and an
// application booted from it falls back to the fake API. The copy kept below is
// taken from the network at runtime, which is the configured one, and it is
// refreshed on every successful navigation.
//
// ## Removing this later
//
// Deleting the file is not enough. nginx answers a missing path with
// `try_files $uri $uri/ /index.html`, so `/sw.js` would come back as HTML at
// 200, the browser would refuse it as a worker and keep the one it already has
// — for as long as that browser lives. Replacing this file with a worker that
// unregisters itself and clears the caches is the way out.
//
// Written 2026-09-09.

// Bumped by hand when the rules below change. The asset cache is keyed by
// content-hashed URLs, so it survives a bump without going stale; the shell
// cache holds two unhashed things and is the one worth discarding.
const VERSION = "1";
const SHELL = "algojudge-shell-v" + VERSION;
const ASSETS = "algojudge-assets-v" + VERSION;
const MINE = [SHELL, ASSETS];

const OFFLINE = "/offline.html";

// One key for the document, because every route is served the same file and
// storing them per address would keep as many copies as somebody has screens.
const SHELL_DOCUMENT = "/";

// Enough for several builds of one application without growing without end.
// Entries are content-addressed, so an old one is never wrong — only unused.
const ASSET_CAP = 250;

self.addEventListener("install", (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(SHELL);
        await cache.add(new Request(OFFLINE, { cache: "reload" }));
        await self.skipWaiting();
    })());
});

self.addEventListener("activate", (event) => {
    event.waitUntil((async () => {
        for (const name of await caches.keys()) {
            if (name.startsWith("algojudge-") && !MINE.includes(name)) {
                await caches.delete(name);
            }
        }
        await self.clients.claim();
    })());
});

/** The newest entries only. `keys()` answers in insertion order. */
const prune = async (cache) => {
    const keys = await cache.keys();
    for (const key of keys.slice(0, Math.max(0, keys.length - ASSET_CAP))) {
        await cache.delete(key);
    }
};

/**
 * A response that is really the SPA fallback.
 *
 * `try_files $uri $uri/ /index.html` answers a missing file with `index.html`
 * at **200**, which is how a request for a locale that does not exist came back
 * as HTML and failed to parse — `src/i18n.tsx` records it. Storing one of those
 * under the locale's own key would make the mistake permanent.
 */
const isFallback = (request, response) => {
    const type = response.headers.get("content-type") || "";
    return request.destination !== "document" && type.includes("text/html");
};

const cacheFirst = async (request) => {
    const cache = await caches.open(ASSETS);
    const hit = await cache.match(request);
    if (hit) return hit;

    const response = await fetch(request);
    if (response.ok && !isFallback(request, response)) {
        await cache.put(request, response.clone());
        await prune(cache);
    }
    return response;
};

const staleWhileRevalidate = async (request) => {
    const cache = await caches.open(SHELL);
    const hit = await cache.match(request);

    const network = fetch(request)
        .then(async (response) => {
            if (response.ok && !isFallback(request, response)) {
                await cache.put(request, response.clone());
            }
            return response;
        })
        .catch(() => undefined);

    if (hit) return hit;
    const response = await network;
    if (response) return response;
    throw new Error("unavailable: " + request.url);
};

const documentFirst = async (request) => {
    const cache = await caches.open(SHELL);
    try {
        const response = await fetch(request);
        if (response.ok) await cache.put(SHELL_DOCUMENT, response.clone());
        return response;
    } catch (unreachable) {
        const shell = await cache.match(SHELL_DOCUMENT);
        if (shell) return shell;
        const offline = await cache.match(OFFLINE);
        if (offline) return offline;
        throw unreachable;
    }
};

/** Unhashed, and nginx gives them no cache policy of their own. */
const revalidated = (path) =>
    path.startsWith("/locales/")
    || path === "/favicon.ico"
    || path === "/manifest.webmanifest"
    || path.startsWith("/icon-")
    || path === "/apple-touch-icon.png";

self.addEventListener("fetch", (event) => {
    const request = event.request;
    if (request.method !== "GET") return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;

    // The API, in every form it takes — calls, the health poll, the event
    // socket's handshake. See the head of this file.
    if (url.pathname.startsWith("/api/")) return;

    if (request.mode === "navigate") {
        event.respondWith(documentFirst(request));
        return;
    }
    if (url.pathname.startsWith("/assets/")) {
        event.respondWith(cacheFirst(request));
        return;
    }
    if (revalidated(url.pathname)) {
        event.respondWith(staleWhileRevalidate(request));
    }
});
