// The window per round, the combined board's columns, the clock, and the panel.
import { open, results } from "./harness.mjs";

const APP = process.env.APP ?? "http://localhost:5180";
const { evaluate, wait, shot, go, visit, click, tab, close, clock } = await open({ clock: true });
const { check, report } = results();

const body = () => evaluate(`return document.body.innerText;`);
const heads = () => evaluate(`
    return [...document.querySelectorAll("th")].map(h => h.textContent.trim());
`);
const pick = (label) => click(`[...document.querySelectorAll("[data-testid=segmented] label")]
    .find(l => l.textContent.trim() === ${JSON.stringify(label)})`);

// ── 1. One activity, two windows ────────────────────────────────────────────
// anowak holds a participant's set and nothing more; amy carries
// `ranking:read:unfrozen` and reads past a window on purpose.
await go(`${APP}/activities/AMMPZ-2019/ranking?fakeUser=anowak`, `document.body.innerText.includes("Ranking")`);
await wait(2500);
// **The clock is advanced inside the loop, never once before it.**
//
// The fake schedules the opening with `setTimeout` when it is constructed, so a
// single jump taken before the page has got that far fires nothing — and a
// virtual clock does not advance on its own afterwards, which turns a 45-second
// wait into an unbounded one. It passed locally and **failed in CI**, where the
// page mounts slower: `nothing to click: Runda 2`. Ten virtual seconds per turn,
// after the DOM has been read, so the timer exists by the time time moves.
// Runda 2 opens 45 s after load and its board is held back until it ends. It is
// the round with a shut window now that Runda 1's is open and merely frozen.
for (let i = 0; i < 25; i++) {
    const tabs = await evaluate(`
        return [...document.querySelectorAll("[data-testid=segmented] label")].map(l => l.textContent.trim());
    `);
    if (tabs.includes("Runda 2")) break;
    // Ten virtual seconds, then a moment of real time to re-render.
    await clock.fastForward("10");
    await wait(250);
}
await pick("Runda 2");
await wait(2500);
check(/będzie dostępny od/.test(await body()),
    "a round whose board is held back says from when");
check(await evaluate(`return document.querySelectorAll("tbody tr").length === 0;`),
    "and draws none");
await shot("brd-held");

await pick("Runda 0 — rozgrzewkowa");
await wait(2500);
check(await evaluate(`return document.querySelectorAll("tbody tr").length > 0;`),
    "while another round of the same activity shows its board");
check(!/będzie dostępny od/.test(await body()),
    "and says nothing about waiting");

// ── 2. The combined board carries the open rounds' problems ─────────────────
await pick("Zbiorczy");
await wait(2500);
const combined = await heads();
check(combined.includes("R") && combined.includes("S"),
    `the combined board carries the settled round's problems (${combined.join(" ")})`);
// The round being fought is on it too, because its window is open — its columns
// carry an asterisk because it is frozen, which is the whole point of the mark.
check(combined.includes("A*") && combined.includes("B*"),
    "and the frozen round's, marked");
check(!combined.includes("A") && !combined.includes("R*"),
    "with the mark on exactly the frozen ones");
await shot("brd-combined");

// ── 3. The clock ────────────────────────────────────────────────────────────
const cells = await evaluate(`
    return [...document.querySelectorAll("tbody td")].map(c => c.textContent.trim()).filter(Boolean);
`);
check(cells.some(c => /^\d+:\d{2}/.test(c)),
    `times read as a clock (${cells.slice(0, 8).join(" | ")})`);
check(!cells.some(c => /^(118|312|331|74|96)$/.test(c)),
    "and no raw minute count is left");

// ── The leading columns stay put while the board scrolls sideways ───────────
const stuck = await evaluate(`
    const container = document.querySelector("[data-testid=table-scroll], [data-testid=table-scroll]")
        ?? document.querySelector("[data-scrollable], .mantine-ScrollArea-viewport");
    const nameCell = [...document.querySelectorAll("tbody td")]
        .find(c => /Uniwersytet|Politechnika/.test(c.textContent));
    if (!nameCell) return null;
    return getComputedStyle(nameCell).position;
`);
check(stuck === "sticky", `the contestant column is sticky (${stuck})`);

// ── 4. The submissions panel ────────────────────────────────────────────────
await visit("/activities/AMMPZ-2019/problems", `document.body.innerText.includes("Runda 1")`);
await wait(1500);
// What the problems screen calls each problem, so the panel can be checked
// against the application rather than against a name written down here — an
// assignment carries the name its manager gave it, and that name may change.
const named = await evaluate(`
    return [...document.querySelectorAll("[data-testid=card], tbody tr")]
        .map(c => c.innerText.replace(/\\s+/g, " ").trim())
        .filter(Boolean);
`);
await click(`[...document.querySelectorAll("[data-testid=submissions-panel] button")]
    .find(b => /Moje zgłoszenia/.test(b.textContent))`);
await wait(1500);
const row = await evaluate(`
    const panel = document.querySelector("[data-testid=submissions-panel]");
    const first = panel?.querySelector("[data-testid=submission-row]");
    return first ? first.innerText.replace(/\\s+/g, " ").trim() : null;
`);
// **The hour, and the one exception is named rather than inferred.**
// `ActivitySubmissions` prints the hour for a submission made today and the date
// for an older one; the seed's newest is a couple of minutes old, so a run that
// crosses midnight finds *yesterday's* date and this failed for that alone, at
// 00:00 on 2026-08-26.
//
// The exception admits **yesterday's date and nothing else**. Deciding it from
// "does the row start with a date" instead would be circular: a regression to
// the full form on any ordinary day would satisfy its own exception and pass.
const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toLocaleDateString("pl-PL");
const crossedMidnight = row !== null && row.startsWith(yesterday);
check(row !== null && (crossedMidnight ? /^\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}/ : /^\d{2}:\d{2}/).test(row),
    crossedMidnight
        ? `the run crossed midnight, so the row carries yesterday's date (${row})`
        : `the row starts with the hour (${row})`);
check(row !== null && /\[[A-Z]\]/.test(row), "carries the slug");
// The name the row gives has to be the name the problems screen gives.
const slug = row?.match(/\[([A-Z])\]/)?.[1];
const rowName = row?.split(/\[[A-Z]\]\s*/)[1]?.replace(/\s+\d+ \/ \d+.*$/, "").trim();
check(rowName !== undefined && rowName.length > 0
    && named.some(entry => entry.includes(rowName)),
    `and the same name the problems screen gives ${slug} (${rowName})`);
check(row !== null && /\d+ \/ \d+/.test(row), "with the score beside the state");
await shot("brd-panel");

report();
close();
