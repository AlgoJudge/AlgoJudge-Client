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
 * The generic is captured non-greedily so that `Page<Grant>` does not end it
 * early; `download` has no method argument and is always a GET.
 *
 * The generic is what the caller expects back, and it is checked: a path that
 * exists is not the same as a path that answers with the right thing. Three
 * manager reads sat on participant paths for exactly as long as this script
 * compared paths alone.
 */
const CALL = /this\.http\.(request|download)\s*(?:<([\s\S]*?)>)?\s*\(\s*(`[^`]*`|"[^"]*")\s*(?:,\s*"([A-Z]+)")?/g;

/**
 * A TypeScript return type as the Server's schema would name it.
 *
 * The Server suffixes every contract type with `Dto` and names a page
 * `{T}DtoPageDto`, so the mapping is mechanical. `null` means "do not check":
 * a primitive, `void`, an inline object literal, or a `Blob` from `download`,
 * none of which the document names.
 */
const schemaFor = (generic) => {
    if (!generic) return null;
    const type = generic.trim();
    if (type.startsWith("{")) return null;
    if (["void", "string", "number", "boolean", "Blob"].includes(type)) return null;
    if (/^(string|number|boolean)\[\]$/.test(type)) return null;
    if (type.endsWith("[]")) return `${type.slice(0, -2)}Dto[]`;
    const page = /^Page<(.+)>$/.exec(type);
    return page ? `${page[1]}DtoPageDto` : `${type}Dto`;
};

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
        const [, kind, generic, rawPath, method] = match;
        calls.push({
            method: kind === "download" ? "GET" : (method ?? "GET"),
            path: API_PATH + toTemplate(rawPath),
            // `download` returns bytes, and no document names a schema for that.
            schema: kind === "download" ? null : schemaFor(generic),
            from: entry,
        });
    }
}

const key = call => `${call.method} ${call.path}`;
const byPath = (a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method);
const unique = [...new Map(calls.map(call => [key(call), call])).values()].sort(byPath);

/**
 * The same endpoint asked for two different things.
 *
 * Deduplicating on method and path alone would silently drop one of them —
 * whichever file `readdirSync` reached second — and that is precisely the case
 * worth reporting: `ManagerApiHttp` and `ParticipantApiHttp` calling one path
 * and expecting different objects. Keyed on the expectation as well, both
 * survive to be checked.
 */
const expectations = [...new Map(
    calls.filter(call => call.schema).map(call => [`${key(call)} ${call.schema}`, call]),
).values()].sort(byPath);

console.log(`${unique.length} endpoints, from ${HTTP_DIR}:\n`);
for (const call of unique) console.log(`  ${call.method.padEnd(6)} ${call.path}`);

const document = process.argv[2];
if (!document) {
    console.log("\nNo OpenAPI document given, so nothing was checked against one.");
    console.log("The Server publishes one at AlgoJudge-Server/openapi.json, and at");
    console.log("/api/v1/swagger/v1/swagger.json on a running installation.");
    process.exit(0);
}

const openapi = JSON.parse(document.startsWith("http")
    ? await (await fetch(document)).text()
    : readFileSync(document, "utf8"));

/**
 * Paths in an OpenAPI document are relative to `servers[].url`, and the Server
 * declares `/api/v1` there rather than repeating it on all ninety-eight paths.
 * Without this the document reads as `/account` where the Client asks for
 * `/api/v1/account`, and every single endpoint reports as unserved — which is
 * the opposite of the truth and the reason this script had never produced a
 * usable number.
 */
const base = (openapi.servers?.[0]?.url ?? "").replace(/\/+$/, "");

/** Parameter names are the caller's business: `{id}` and `{problemId}` are one path. */
const shapeOf = entry => entry.replace(/\{[^}]*\}/g, "{}");

const served = new Map();
for (const [path, item] of Object.entries(openapi.paths ?? {})) {
    for (const [method, operation] of Object.entries(item)) {
        if (!["get", "post", "put", "patch", "delete"].includes(method)) continue;
        // A creation answers 201 and everything else 200; both are the success
        // body, and reading only 200 would report every POST as returning
        // nothing at all.
        const success = operation.responses?.["200"] ?? operation.responses?.["201"];
        const schema = success?.content?.["application/json"]?.schema;
        const name = schema?.$ref?.split("/").pop()
            ?? (schema?.type === "array" ? `${schema.items?.$ref?.split("/").pop() ?? "?"}[]` : undefined);
        served.set(shapeOf(`${method.toUpperCase()} ${base}${path}`), name ?? null);
    }
}

let failed = 0;
console.log("");
for (const call of unique) {
    if (!served.has(shapeOf(key(call)))) {
        console.log(` FAIL  ${key(call)} — the Server does not serve this (${call.from})`);
        failed++;
    }
}

// A path that exists is not a path that answers with the right thing. This is
// the check that catches a manager read sitting on a participant endpoint,
// which the path pass above passes happily.
for (const call of expectations) {
    const shape = shapeOf(key(call));
    if (!served.has(shape)) continue;
    const actual = served.get(shape);
    if (actual === null) {
        console.log(` FAIL  ${key(call)} — expects ${call.schema}, the Server documents no body (${call.from})`);
        failed++;
    } else if (actual !== call.schema) {
        console.log(` FAIL  ${key(call)} — expects ${call.schema}, the Server serves ${actual} (${call.from})`);
        failed++;
    }
}

// The other direction is not a failure: the Server legitimately serves the
// Runner and the identity endpoints, which no screen calls.
const extra = [...served.keys()].filter(
    entry => !unique.some(call => shapeOf(key(call)) === entry));
if (extra.length > 0) {
    console.log(`\n${extra.length} endpoints the Client never calls (not a fault):`);
    for (const entry of extra.sort()) console.log(`         ${entry}`);
}

console.log(failed ? `\nFAILED: ${failed} disagreements` : "\napi check passed");
process.exitCode = failed ? 1 : 0;
