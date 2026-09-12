// The two things about the document only a running page can say.
//
// Everything static is asserted from the source by `npm run check:seo`, which is
// where the head belongs: this harness reads a live page, so it sees what
// `src/seo.ts` did rather than what `index.html` shipped. What it can see, and
// nothing else can:
//
//   - the document's language follows the reader's, which it did not for as long
//     as this application has been bilingual — `index.html` says `en` and a
//     screen reader takes its voice from that attribute before reading a word;
//   - the canonical address is the page without the query, which is only
//     knowable once there is an origin to read.
import { open, results } from "./harness.mjs";

const APP = process.env.APP ?? "http://localhost:5180";
const { send, evaluate, wait, go, click } = await open();
const { check, report } = results();

await send("Page.setDeviceMetricsOverride", { width: 1400, height: 1000, deviceScaleFactor: 1, mobile: false });

// The stored language decides the next load, so a run after one that switched to
// English would start in English. Cleared on the application's own origin.
await go(`${APP}/`, `document.body !== null`);
await evaluate(`localStorage.clear(); sessionStorage.clear(); return true;`);

await go(`${APP}/login`, `document.querySelector("[data-testid=footer]") !== null`);

check(await evaluate(`return document.documentElement.lang;`) === "pl",
    "the document is in the reader's language, not the file's");

// The footer's own switcher, rather than i18next directly: it is the one an
// anonymous visitor has, and driving it proves the whole path.
const menu = `[...document.querySelectorAll("a")].find(a => a.getAttribute("href") === "#1")`;
const item = (label) =>
    `[...document.querySelectorAll("[role=menuitem]")].find(e => e.textContent.trim() === "${label}")`;

await click(menu);
await click(item("English"));
await wait(600);
check(await evaluate(`return document.documentElement.lang;`) === "en",
    "and it follows the switcher");

// Weaker than the one above and deliberately kept: with the listener removed
// the language never left `pl`, so this passes on its own. It says the change is
// not one-way, and the assertion before it is what catches a dead listener.
await click(menu);
await click(item("Polski"));
await wait(600);
check(await evaluate(`return document.documentElement.lang;`) === "pl",
    "and back again");

// `?admin=true` is one of four parameters that reach a public screen; each would
// otherwise be an address of its own with the same page on it.
await go(`${APP}/login?admin=true`, `document.querySelector("link[rel=canonical]") !== null`);
const canonical = await evaluate(`return document.querySelector("link[rel=canonical]").href;`);
check(canonical === `${APP}/login`, `the canonical drops the query (${canonical})`);

const description = await evaluate(
    `return document.querySelector("meta[name=description]")?.content ?? "";`);
check(description.length > 50 && /AlgoJudge/.test(description),
    "and the description is still there once the application has mounted");

report();
