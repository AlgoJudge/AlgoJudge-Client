// A problem judged somewhere else, seen from the participant's side.
//
// **The last check is the one this file exists for.** A `uva@1` problem is the
// first thing in the product whose content came from another host, and the rule
// is that a participant screen never reaches one: the statement is a copy stored
// here, and the verdict travelled through the Server. Reviewing that by reading
// the code is exactly how it stops being true, so it is measured instead —
// every `fetch` the page makes and every resource it loaded, compared against
// its own origin.
import { open, results } from "./harness.mjs";

const APP = process.env.APP ?? "http://localhost:5180";
const { evaluate, wait, shot, go, visit, close } = await open();
const { check, report } = results();

/** Records what the page asks for, before it asks for anything. */
const watch = () => evaluate(`
    window.__asked = [];
    const original = window.fetch;
    window.fetch = (...args) => { window.__asked.push(String(args[0])); return original(...args); };
    return true;
`);

const outward = () => evaluate(`
    const ours = location.origin;
    const outside = (url) => url.indexOf("http") === 0 && url.indexOf(ours) !== 0;
    return {
        fetched: (window.__asked || []).filter(outside),
        loaded: performance.getEntriesByType("resource").map(e => e.name).filter(outside),
    };
`);

// ── The statement: the archive's PDF, drawn rather than offered ─────────────

await watch();
await go(`${APP}/activities/PROG-1-LA/problems/uva100?fakeUser=amy`,
    `document.body.innerText.includes("uva100")`);
await wait(1800);

const statement = await evaluate(`
    const object = document.querySelector('object[type="application/pdf"]');
    return { drawn: object !== null, data: object ? object.getAttribute("data") : "" };
`);
check(statement.drawn, "a PDF statement is drawn rather than offered as a download");
// A blob or a path of ours. Either way it is not another host — which is the
// whole reason a statement is copied in at import rather than linked.
check(statement.data.startsWith("blob:") || statement.data.startsWith("/") || statement.data.includes(new URL(APP).host),
    `and it is served from here (${statement.data.slice(0, 48)})`);

// ── The manager's side of the same problem ──────────────────────────────────
//
// **A statement that is not Markdown is still the statement.** The Server named
// every one of them `content.md` until 2026-08-26, so this screen had never been
// drawn against a PDF — and the two questions it asks about a file, "is this the
// statement" and "is this Markdown I can edit", were one function that answered
// the first wrongly.

await visit("/manager/problems/prob-uva-100?fakeUser=amy",
    `document.body.innerText.includes("3n + 1")`);
await wait(1800);

check(/dokumentem, a nie tekstem|document rather than text/i.test(await evaluate(
    `return document.body.innerText;`)),
    "the statement tab says the statement is a document rather than showing an empty editor");
check((await evaluate(`return document.body.innerText;`)).includes("content.pdf"),
    "and names it");

// **The files tab lists every file, the statement included** — it is an
// inventory, not a list of attachments. What marks a statement out is how its
// row is treated: nothing offers to point at it from inside itself, and it
// cannot be removed as ordinary material, because the statement tab owns it.
//
// That treatment keyed on the name ending `.md`, so a `content.pdf` was handed
// both controls.
await visit("/manager/problems/prob-uva-100?fakeUser=amy&tab=files",
    `document.body.innerText.includes("3n + 1")`);
await wait(1500);

const row = await evaluate(`
    const found = [...document.querySelectorAll("tbody tr")]
        .find(r => r.innerText.includes("content.pdf"));
    if (!found) return null;
    const buttons = [...found.querySelectorAll("button")];
    return { buttons: buttons.length, enabled: buttons.filter(b => !b.disabled).length };
`);
check(row !== null, "the files tab lists the statement, as it lists every file");
check(row !== null && row.enabled === 0,
    `and offers no control over it: it belongs to the statement tab (${row?.enabled ?? "?"} enabled of ${row?.buttons ?? "?"})`);
await shot("uva-manager-pdf");

await visit(`/activities/PROG-1-LA/problems/uva100?fakeUser=amy`,
    `document.body.innerText.includes("uva100")`);
await wait(1500);

const scored = await evaluate(`return document.body.innerText.replace(/\\s+/g, " ");`);
check(/5 \/ 5/.test(scored),
    "a problem marked out of one by the archive is worth its whole assignment value");
check(/ROZWIĄZANE/i.test(scored),
    "and the whole of that scale reads as solved, not as a partial");
await shot("uva-statement");

// ── The submission screen says what it is about to do ───────────────────────

await go(`${APP}/activities/PROG-1-LA/submit/uva100?fakeUser=amy`,
    `document.body.innerText.includes("uva100")`);
await wait(2000);

const notices = await evaluate(`
    return [...document.querySelectorAll("[class*=Alert-root]")]
        .map(a => a.innerText.split("\\n").join(" "));
`);
check(notices.some(n => n.includes("onlinejudge.org")),
    "the participant is told the solution leaves this installation, before sending it");
check(notices.some(n => n.includes("0")),
    "and that the program must return zero to the shell");
await shot("uva-submit");

// ── The result: the archive's answer, and no table pretending otherwise ─────

// Reached by its own address rather than by clicking a row: the id is derived
// from the seed, so the check does not depend on where a list happens to put it.
await go(`${APP}/activities/PROG-1-LA/submissions/sub-series-w2-student-me-uva100-8700?fakeUser=amy`,
    `document.body.innerText.includes("uva100")`);
await wait(2500);

const result = await evaluate(`
    const area = document.querySelector("[class*=AppShell-main]");
    return {
        text: (area?.innerText ?? "").replace(/\\s+/g, " "),
        tables: area ? area.querySelectorAll("table").length : 0,
    };
`);
check(/AC|Accepted/.test(result.text), "the result screen shows the archive's own verdict");
check(/60 ms/.test(result.text),
    "and the run time out of the attached document, not a column of the Server's");
check(/31254724/.test(result.text), "and the archive's submission id, as text");
check(!/Test|Grupa/i.test(result.text),
    "and no per-test table, because the archive discloses none");
await shot("uva-result");

// ── And neither screen reached another host ─────────────────────────────────

// **The sweep below has a blind spot, and it is written down rather than
// trusted.** Sabotaged by pointing the statement's `<object>` at
// `onlinejudge.org`, the address check above went red and neither of these two
// did: an `<object>` load does not show up as a `resource` entry here. So the
// address of anything the page embeds is checked explicitly, and this pair is
// the secondary net rather than the guard.
const asked = await outward();
check(asked.fetched.length === 0,
    `no participant screen fetched from another host (${asked.fetched.join(", ") || "none"})`);
check(asked.loaded.length === 0,
    `and loaded nothing from one either (${asked.loaded.join(", ") || "none"})`);

report();
close();
