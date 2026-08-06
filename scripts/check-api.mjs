// Every endpoint the Client asks for, read out of the HTTP layer itself — and,
// when the Server publishes one, checked against its OpenAPI document.
//
// The list is the point even before there is a Server to check against: it is
// what has to be implemented, taken from the only place that cannot drift from
// what the screens actually call.
//
//   npm run check:api                      print the inventory
//   npm run check:api -- openapi.json      and check it against a document
//   npm run check:api -- http://host/...   or against a running Server
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const HTTP_DIR = "src/api/http";
/** Where the API lives on every installation. See docs/specs — it is not configurable. */
const API_PATH = "/api/v1";

/**
 * `this.http.request<Page<Grant>>("/grants", "GET", …)` and
 * `this.http.download(`/files/${encodeURIComponent(id)}`)`.
 *
 * The generic is skipped non-greedily so that `Page<Grant>` does not end it
 * early; `download` has no method argument and is always a GET.
 */
const CALL = /this\.http\.(request|download)\s*(?:<[\s\S]*?>)?\s*\(\s*(`[^`]*`|"[^"]*")\s*(?:,\s*"([A-Z]+)")?/g;

/** `${encodeURIComponent(problemId)}` is a path parameter called `problemId`. */
const toTemplate = (raw) => raw
    .slice(1, -1)
    .replace(/\$\{\s*encodeURIComponent\(\s*([A-Za-z0-9_.]+)\s*\)\s*\}/g, (_, name) => `{${name.split(".").pop()}}`)
    .replace(/\$\{[^}]*\}/g, "{param}");

const calls = [];
for (const entry of readdirSync(HTTP_DIR)) {
    if (!entry.endsWith(".ts")) continue;
    const source = readFileSync(join(HTTP_DIR, entry), "utf8");
    for (const match of source.matchAll(CALL)) {
        const [, kind, rawPath, method] = match;
        calls.push({
            method: kind === "download" ? "GET" : (method ?? "GET"),
            path: API_PATH + toTemplate(rawPath),
            from: entry,
        });
    }
}

const key = call => `${call.method} ${call.path}`;
const unique = [...new Map(calls.map(call => [key(call), call])).values()]
    .sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));

console.log(`${unique.length} endpoints, from ${HTTP_DIR}:\n`);
for (const call of unique) console.log(`  ${call.method.padEnd(6)} ${call.path}`);

const document = process.argv[2];
if (!document) {
    console.log("\nNo OpenAPI document given, so nothing was checked against one.");
    console.log("The Server does not publish one yet; this list is what it has to serve.");
    process.exit(0);
}

const openapi = JSON.parse(document.startsWith("http")
    ? await (await fetch(document)).text()
    : readFileSync(document, "utf8"));

const served = new Set();
for (const [path, item] of Object.entries(openapi.paths ?? {})) {
    for (const method of Object.keys(item)) {
        if (["get", "post", "put", "patch", "delete"].includes(method)) {
            served.add(`${method.toUpperCase()} ${path}`);
        }
    }
}

let failed = 0;
console.log("");
for (const call of unique) {
    // Parameter names are the caller's business, not the contract's: the Server
    // may call it `{id}` where the Client calls it `{problemId}`.
    const wanted = key(call).replace(/\{[^}]*\}/g, "{}");
    const found = [...served].some(entry => entry.replace(/\{[^}]*\}/g, "{}") === wanted);
    if (!found) {
        console.log(` FAIL  ${key(call)} — the Server does not serve this (${call.from})`);
        failed++;
    }
}

// The other direction is not a failure: the Server legitimately serves the
// Runner and the identity endpoints, which no screen calls.
const extra = [...served].filter(entry => {
    const shape = entry.replace(/\{[^}]*\}/g, "{}");
    return !unique.some(call => key(call).replace(/\{[^}]*\}/g, "{}") === shape);
});
if (extra.length > 0) {
    console.log(`\n${extra.length} endpoints the Client never calls (not a fault):`);
    for (const entry of extra.sort()) console.log(`         ${entry}`);
}

console.log(failed ? `\nFAILED: ${failed} unserved` : "\napi check passed");
process.exitCode = failed ? 1 : 0;
