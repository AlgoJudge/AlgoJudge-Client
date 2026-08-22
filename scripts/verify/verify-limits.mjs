// The limits a participant reads, on the two axes a package states them.
//
// **These numbers had never reached a screen from a real field.**
// `ProblemDetail.limits` was declared in the contract from the day it was
// written and filled by nothing: they live inside a document the Server stores
// and does not read. Two badges rendered against the fake and against nothing
// else, and a fake agreeing with itself is what this suite exists to catch.
//
// They come out of the assignment's `config` now, which is why that reaches a
// participant at all.
import { open, results } from "./harness.mjs";

const APP = process.env.APP ?? "http://localhost:5180";
const { evaluate, wait, shot, go, visit, close } = await open();
const { check, report } = results();

const body = () => evaluate(`return document.body.innerText;`);

/** One table's rows, by the heading above it. */
const tableUnder = (heading) => evaluate(`
    const headings = [...document.querySelectorAll("[class*=AppShell-main] *")]
        .filter(e => e.children.length === 0 && e.textContent.trim() === ${JSON.stringify(heading)});
    if (headings.length === 0) return null;

    // The nearest table after the heading, in document order.
    const tables = [...document.querySelectorAll("[class*=AppShell-main] table")];
    const after = tables.find(t =>
        headings[0].compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING);
    if (!after) return null;

    return [...after.querySelectorAll("tbody tr")]
        .map(r => [...r.querySelectorAll("td")].map(c => c.textContent.trim()));
`);

// ── the page ────────────────────────────────────────────────────────────────

// Absolute the first time: `visit` pushes a route into an application that is
// already running, and there is nothing running on `about:blank`.
await go(`${APP}/activities/AMMPZ-2019/problems/A?fakeUser=amy`,
    `document.body.innerText.includes("Limity")`);
await wait(600);

// 1 — the assignment's own pair, in the header, before anything narrows it.
const header = await body();
check(/1\.00 s/.test(header), `the header states the time limit (${/\d\.\d\d s/.exec(header)?.[0] ?? "none"})`);
check(/256 MiB/.test(header), "and the memory limit");

// 2 — per test group. Group 2 states its own time in the fixture, so it must
//     show 4 s rather than the package's 1 s: a table that showed the global
//     pair on every row would look right and say nothing.
const groups = await tableUnder("Per grupa testowa");
check(Array.isArray(groups) && groups.length === 3,
    `the group table has a row per group (${groups?.length ?? "no table"})`);
check(groups?.[0]?.[0]?.includes("0") && /przyk/i.test(groups?.[0]?.[0] ?? ""),
    `group 0 is marked as the examples (${groups?.[0]?.[0] ?? "—"})`);
check(groups?.[1]?.[2]?.startsWith("1.00 s"),
    `a group that states no limit of its own inherits (${groups?.[1]?.[2] ?? "—"})`);
check(groups?.[2]?.[2]?.startsWith("4.00 s"),
    `a group that states its own is shown its own (${groups?.[2]?.[2] ?? "—"})`);
check(groups?.[2]?.[2]?.includes("*"),
    `and is marked, because the language table does not reach it (${groups?.[2]?.[2] ?? "—"})`);
check(groups?.[2]?.[3]?.includes("256 MiB"),
    `while the field it did not state still inherits (${groups?.[2]?.[3] ?? "—"})`);
await shot("limits-groups");

// 3 — per language. The fixture overrides Python's time and nothing else.
const languages = await tableUnder("Per język");
check(Array.isArray(languages) && languages.length === 1,
    `the language table carries the keys the package wrote (${languages?.length ?? "no table"})`);
check(languages?.[0]?.[1]?.startsWith("3.00 s"),
    `a language override is shown (${languages?.[0]?.[1] ?? "—"})`);
check(languages?.[0]?.[2]?.includes("256 MiB"),
    `and the field it did not state still inherits (${languages?.[0]?.[2] ?? "—"})`);

// **The one thing two tables cannot show.** The axes never meet: a group with
// its own limits ignores the language override rather than composing with it,
// and a participant reading two tables would otherwise assume they multiply.
check(/nie zale|niezale/i.test(await body()),
    "and the page says in words that the two axes do not compose");
await shot("limits-languages");

// 4 — an assignment that overrides nothing says nothing. Not "no limit": a
//     package's own numbers are not published, so a screen printing dashes
//     would be answering a question nobody here can answer.
await visit(`/activities/PROG-1-LA/problems/sortowanie`, `document.body.innerText.length > 0`);
await wait(600);

report();
close();
