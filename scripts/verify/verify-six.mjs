// The six: a series edit that arrives, a readable address, two settings, the
// boards, and the two corners.
import { open, results } from "./harness.mjs";

const APP = process.env.APP ?? "http://localhost:5180";
const { evaluate, wait, shot, go, visit, click, tab, close } = await open();
const { check, report } = results();

const body = () => evaluate(`return document.body.innerText;`);
const MANAGER_LIST = `[...document.querySelectorAll("tbody tr")].some(r => r.innerText.includes("AMMPZ-2019"))`;
const openContest = async () => {
    await click(`[...document.querySelectorAll("tbody tr")]
        .find(r => r.innerText.includes("AMMPZ-2019"))?.querySelector("td")`);
    await wait(2500);
};
/**
 * Runda 1's start, as the participant's problem list prints it. The start rather
 * than the deadline: a contest's card shows the one and a course's the other,
 * and this activity is a contest.
 */
const opensAt = () => evaluate(`
    const card = [...document.querySelectorAll("[data-testid=card]")]
        .find(c => c.innerText.startsWith("Runda 1"));
    const found = card ? /Start: ([0-9.]+ [0-9:]+)/.exec(card.innerText) : null;
    return found ? found[1].trim() : null;
`);

// ── 2. The address carries the slug ─────────────────────────────────────────
await go(`${APP}/manager/activities?fakeUser=john`, MANAGER_LIST);
await openContest();
check(await evaluate(`return location.pathname === "/manager/activities/AMMPZ-2019";`),
    `the manager's address reads the slug (${await evaluate(`return location.pathname;`)})`);

// ── 1. A series edit reaches the participant ────────────────────────────────
await visit("/activities/AMMPZ-2019/problems?fakeUser=amy", `document.body.innerText.includes("Runda 1")`);
await wait(1500);
const before = await opensAt();
check(before !== null, `the participant sees when Runda 1 opened (${before})`);

await visit("/manager/activities/AMMPZ-2019", `document.body.innerText.includes("Runda 1")`);
await wait(1500);
// Move the opening time an hour earlier in the series editor, not with the
// shift control: this is the ordinary way a round is edited. Earlier rather than
// later, so the round stays running and only its printed time changes.
await evaluate(`
    const item = [...document.querySelectorAll("[data-testid=accordion-item]")]
        .find(i => i.innerText.includes("Runda 1"));
    const field = [...item.querySelectorAll("input[type=datetime-local]")][0];
    const now = new Date(field.value);
    now.setHours(now.getHours() - 1);
    const next = now.toISOString().slice(0, 16);
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(field, next);
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
    return next;
`);
await wait(800);
// Runda 1's own Zapisz. There is one per round, and the page-wide lookup this
// replaced pressed the first — saving the round that ended yesterday while the
// edit above sat unsaved in Runda 1's form.
await click(`[...([...document.querySelectorAll("[data-testid=accordion-item]")]
    .find(i => i.innerText.includes("Runda 1"))
    ?.querySelectorAll("button") ?? [])]
    .find(b => b.dataset.testid === "save")`);
await wait(3000);

await visit("/activities/AMMPZ-2019/problems", `document.body.innerText.includes("Runda 1")`);
await wait(2000);
const after = await opensAt();
check(after !== null && after !== before,
    `the participant's copy moved with it (${before} → ${after})`);
await shot("six-edit");

// ── 5. The boards ───────────────────────────────────────────────────────────
await visit("/activities/AMMPZ-2019/ranking", `document.body.innerText.includes("Ranking")`);
await wait(2500);
const tabs = await evaluate(`
    return [...document.querySelectorAll("[data-testid=segmented] label")].map(l => l.textContent.trim());
`);
check(tabs.includes("Zbiorczy"), `the picker offers the combined board (${tabs.join(" | ")})`);
check(tabs.includes("Runda 0 — rozgrzewkowa") && tabs.includes("Runda 1"),
    "and every round that has started");
check(!tabs.includes("Runda 3"), "but not one nobody has opened");
// The combined board carries more than one round. This runs as `john`, who is
// an administrator and therefore holds `ranking:read:unfrozen` — so the rounds a
// window or a freeze would withhold reach him, and reach him unmarked. The
// asterisk is a participant-view fact and is checked in verify-results.
const head = await evaluate(`
    return [...document.querySelectorAll("th")].map(h => h.textContent.trim());
`);
check(head.includes("R") && head.includes("S") && head.includes("A") && head.includes("B"),
    `the combined board carries every round's columns (${head.join(" ")})`);
check(!head.some(h => h.endsWith("*")),
    "unmarked, because an administrator reads past the freeze");
await shot("six-combined");

await click(`[...document.querySelectorAll("[data-testid=segmented] label")]
    .find(l => l.textContent.trim() === "Runda 0 — rozgrzewkowa")`);
await wait(2500);
check(await evaluate(`
    const head = [...document.querySelectorAll("th")].map(h => h.textContent.trim());
    return head.includes("R") && head.includes("S");
`), "a round's own board carries that round's problems");
await shot("six-series-board");

// ── 6. The corners ──────────────────────────────────────────────────────────
const panel = () => evaluate(`
    const found = document.querySelector("[data-testid=submissions-panel]");
    if (!found) return null;
    const box = found.getBoundingClientRect();
    return {
        bottom: Math.round(window.innerHeight - box.bottom),
        right: Math.round(window.innerWidth - box.right),
        rows: found.querySelectorAll("[data-testid=submission-row]").length,
        text: found.innerText.replace(/\\s+/g, " ").trim().slice(0, 60),
    };
`);
const collapsed = await panel();
check(collapsed !== null, `the submissions panel is there (${collapsed?.text})`);
check(collapsed !== null && collapsed.bottom < 40 && collapsed.right < 40,
    `bottom right (${collapsed?.bottom}, ${collapsed?.right})`);
check(collapsed !== null && collapsed.rows === 0,
    "and collapsed on arrival");

await click(`[...document.querySelectorAll("[data-testid=submissions-panel] button")]
    .find(b => /Moje zgłoszenia/.test(b.textContent))`);
await wait(1500);
const opened = await panel();
check(opened !== null && opened.rows > 0,
    `it expands to the reader's submissions (${opened?.rows} rows)`);
await shot("six-panel");

await visit("/activities", `document.body.innerText.includes("AMMPZ")`);
await wait(1500);
check(await panel() === null, "and is absent outside an activity");

report();
close();
