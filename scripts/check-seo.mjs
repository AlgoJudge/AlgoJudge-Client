// What the document says about itself before any of it has run.
//
// **Nothing else can see this.** Every browser check reads a live page through
// `evaluate`, where React has already mounted and the metadata has done its
// work or failed to — there is no `page.content()` in the harness, and a crawler
// that does not execute JavaScript reads the file rather than the page. So the
// shell's own head is asserted here, from the source, and only the *behaviour*
// in `scripts/verify/verify-seo.mjs`.
//
// Pure text: no build, no browser, no TypeScript. The two source files it reads
// are read for one constant each, and it fails rather than passes when it cannot
// find them.
import { readFileSync } from "node:fs";

const fail = (message) => { console.error("FAIL:", message); process.exitCode = 1; };
const check = (condition, message) =>
    condition ? console.log("  ok  ", message) : fail(message);

const read = (path) => readFileSync(path, "utf8");

const html = read("index.html");
const robots = read("public/robots.txt");
const en = JSON.parse(read("public/locales/en/translation.json"));
const pl = JSON.parse(read("public/locales/pl/translation.json"));
const site = read("src/site.ts");
const i18n = read("src/i18n.tsx");
const app = read("src/App.tsx");

// ── Reading the document ────────────────────────────────────────────────────

const attributes = (source) => {
    const found = {};
    for (const [, key, value] of source.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)) found[key] = value;
    return found;
};

// `[^>]` spans newlines, which the long ones need: a `content` of 134 characters
// does not share a line with its own element.
const metas = [...html.matchAll(/<meta\b([^>]*)>/g)].map((m) => attributes(m[1]));
const meta = (key) => metas.find((a) => a.name === key || a.property === key)?.content;

const title = html.match(/<title>([^<]*)<\/title>/)?.[1];
const lang = html.match(/<html\s+lang="([^"]+)"/)?.[1];

const named = (source, name) => source.match(new RegExp(`export const ${name} = "([^"]+)"`))?.[1];
const PROJECT_SITE = named(site, "PROJECT_SITE");
const PROJECT_ORGANISATION = named(site, "PROJECT_ORGANISATION");

const fallback = i18n.match(/fallbackLng:\s*['"]([^'"]+)['"]/)?.[1];
const supported = (i18n.match(/supportedLngs:\s*\[([^\]]+)\]/)?.[1] ?? "")
    .split(",").map((s) => s.trim().replace(/['"]/g, "")).filter(Boolean).sort();

// A regex that stopped matching would otherwise make every assertion built on it
// pass against `undefined`.
check(PROJECT_SITE !== undefined && PROJECT_ORGANISATION !== undefined,
    "both addresses were found in src/site.ts");
check(fallback !== undefined && supported.length > 0,
    `and the languages in src/i18n.tsx (${supported.join(", ")}, falling back to ${fallback})`);

// ── The line the container rewrites ─────────────────────────────────────────

// The entrypoint replaces **every** line matching this name, with an unanchored
// regex, and the `docker` job asserts the served page has exactly one. Adding a
// second — in an attribute, or in prose explaining it — turns it into two copies
// of the configuration script. Caught here, at `npm` time, rather than after an
// image build.
const configured = html.split(/\r?\n/).filter((line) => line.includes("__ALGOJUDGE__"));
check(configured.length === 1,
    `exactly one line of index.html names the configuration object (${configured.length})`);

// ── What it says ────────────────────────────────────────────────────────────

const description = meta("description");
check(typeof description === "string", "the document carries a description");
check(description !== undefined && description.length >= 50 && description.length <= 160,
    `and it is ${description?.length ?? 0} characters, which a result page will show whole`);

// The sentence is a key this application already renders, so it is not a second
// wording of the product that drifts from the first. Its Polish being *different*
// from the key is what says it was actually translated: i18next falls back to the
// key, so an untranslated string is the English one and looks like a hit.
check(description !== undefined && en[description] !== undefined,
    "the description is a sentence this application already says");
check(description !== undefined && pl[description] !== undefined && pl[description] !== description,
    "and it is written in Polish too");

check(meta("application-name") === "AlgoJudge", "the application names itself");
check(meta("robots") === "index, follow", "and asks to be indexed");
// **No `color-scheme` here, and that is a measurement.** Mantine declares one on
// the root element once it has mounted, matching the scheme the reader chose —
// measured 2026-09-10, `light` and `dark` both. Before that it can only be a
// guess, and `light dark` is the wrong one: this application mounts light
// whatever the operating system prefers, so a dark-preference reader got a dark
// canvas for 200 ms and a white application after it.
check(meta("color-scheme") === undefined,
    "and leaves the colour scheme to Mantine, which knows which one the reader chose");

// ── The card ────────────────────────────────────────────────────────────────

check(meta("og:type") === "website", "the card is a website");
check(meta("og:site_name") === "AlgoJudge", "on the product's own name");
check(meta("og:title") === title, `titled as the document is (${title})`);
check(meta("og:description") === description, "and describing it in the same words");

// **Absent on purpose, both of them.** Each takes an absolute address, and one
// image serves every installation under a host it cannot know — so a value here
// would be a link into somebody else's site. Adding either means deciding where
// the host comes from first, and this line is what makes that a decision rather
// than an edit.
check(meta("og:url") === undefined,
    "no og:url, which would have to name a host this image does not know");
check(meta("og:image") === undefined, "and no og:image, for the same reason");
check(!/<link[^>]*rel="canonical"/.test(html),
    "and no canonical here: src/seo.ts sets it where the origin is finally known");

const card = meta("twitter:card");
check(card === "summary", "with no image to be large, the card is a summary");

// Facebook's `language_TERRITORY`, not BCP-47: a hyphen is ignored rather than
// reported, so nothing but this would notice one.
const shape = /^[a-z]{2}_[A-Z]{2}$/;
const locale = meta("og:locale") ?? "";
const alternate = meta("og:locale:alternate") ?? "";
check(shape.test(locale) && shape.test(alternate),
    `both locales are spelled with an underscore (${locale}, ${alternate})`);
check(locale !== alternate, "and they are two different ones");
check(JSON.stringify([locale, alternate].map((l) => l.slice(0, 2)).sort()) === JSON.stringify(supported),
    `covering exactly the languages this application has (${supported.join(", ")})`);

check(lang === fallback, `the document's own language is the fallback (${lang})`);

// ── What a crawler without JavaScript reads ─────────────────────────────────

const root = html.match(/<div id="root">([\s\S]*?)<\/div>/)?.[1] ?? "";
const noscript = root.match(/<noscript>([\s\S]*?)<\/noscript>/)?.[1] ?? "";
const beside = root
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<noscript>[\s\S]*?<\/noscript>/g, "")
    .trim();

check(noscript.includes(`href="${PROJECT_SITE}"`), "the project's site is linked where a crawler can read it");
check(noscript.includes(`href="${PROJECT_ORGANISATION}"`), "and so is the source");

// **Measured, not preferred.** React clears this container at its first commit,
// so anything here that is not in the `noscript` is something a reader looks at
// until then — 180 ms of it, median of five loads against a real build on
// 2026-09-10, unstyled and top left. Putting markup back beside the `noscript`
// puts that back with it.
check(beside === "", `nothing in #root is drawn before React mounts (${JSON.stringify(beside.slice(0, 40))})`);

// ── robots.txt ──────────────────────────────────────────────────────────────

const lines = robots.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
const directive = (name) => lines
    .filter((l) => l.toLowerCase().startsWith(`${name}:`))
    .map((l) => l.slice(l.indexOf(":") + 1).trim())
    .filter(Boolean);

const disallow = directive("disallow");
check(lines.some((l) => /^user-agent:\s*\*$/i.test(l)), "robots.txt speaks to every crawler");
check(directive("allow").includes("/"), "and opens the site");
check(directive("sitemap").length === 0,
    "with no Sitemap line, which would have to name a host this image does not know");

// Every path this application routes, from both spellings — the literal
// `path:` and the `managerRoute(…)` helper. `*` is the not-found page, not an
// address anybody visits.
const routes = [...app.matchAll(/(?:path:\s*|managerRoute\(\s*)"([^"]+)"/g)]
    .map((m) => m[1])
    .filter((path) => path !== "*");

// Everything an anonymous reader is actually shown. Anything else redirects to
// /login and has nothing on it to index.
const PUBLIC = ["/", "/login", "/register", "/terms", "/privacy", "/cookies", "/accessibility"];

const withheld = (path) => disallow.some((prefix) => path === prefix || path.startsWith(prefix));

const stranded = routes.filter((path) => !PUBLIC.includes(path) && !withheld(path));
check(stranded.length === 0,
    `every route is either public or withheld${stranded.length ? `: ${stranded.join(", ")} is neither` : ""}`);

const leaked = PUBLIC.filter(withheld);
check(leaked.length === 0,
    `and nothing a visitor is shown is withheld${leaked.length ? `: ${leaked.join(", ")}` : ""}`);

// Withheld without being a route, and each one needs a reason: `/api/` is the
// Server's half of a one-origin installation, which the sign-in screen links
// into for every provider.
const NOT_A_ROUTE = ["/api/"];
const unknown = disallow.filter((prefix) => !NOT_A_ROUTE.includes(prefix)
    && !routes.some((path) => path === prefix || path.startsWith(prefix)));
check(unknown.length === 0,
    `every withheld prefix is a route or a named exception${unknown.length ? `: ${unknown.join(", ")} is neither` : ""}`);

console.log(`  ---  ${metas.length} meta elements, ${routes.length} routes, ${disallow.length} prefixes withheld`);
