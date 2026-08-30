// The results feed, and the boards computed from it.
import { open, results } from "./harness.mjs";

const APP = process.env.APP ?? "http://localhost:5180";
const { evaluate, wait, shot, go, visit, click, close, clock } =
    await open({ clock: true });
const { check, report } = results();

const body = () => evaluate(`return document.body.innerText;`);
const heads = () => evaluate(`
    return [...document.querySelectorAll("th")].map(h => h.textContent.trim());
`);
const pick = (label) => click(`[...document.querySelectorAll("[data-testid=segmented] label")]
    .find(l => l.textContent.trim() === ${JSON.stringify(label)})`);

// ── 1. The combined board carries every available round, frozen included ─────
await go(`${APP}/activities/AMMPZ-2019/ranking?fakeUser=anowak`, `document.body.innerText.includes("Ranking")`);
await wait(3000);
const combined = await heads();
check(combined.some(h => /^[RS]$/.test(h)),
    `the combined board carries the settled round's problems (${combined.join(" ")})`);
check(combined.some(h => /^[A-D]\*$/.test(h)),
    "and the frozen round's, marked with an asterisk");
check(!combined.some(h => /^[RS]\*$/.test(h)),
    "while the settled round's columns carry none");
await shot("res-combined");

// ── 2. The freeze is real: late outcomes are withheld, not published ─────────
await pick("Runda 1");
await wait(2500);
check(/zamro|frozen/i.test(await body()),
    "the frozen round says so");
const pending = await evaluate(`
    return [...document.querySelectorAll("tbody td")]
        .filter(c => c.textContent.trim().startsWith("?")).length;
`);
check(pending > 0, `and carries cells whose outcome is withheld (${pending})`);
await shot("res-frozen");

// ── 3. A penalty is what its own cells add up to ─────────────────────────────
// The board is computed in the Client now, so this checks the arithmetic rather
// than a fixture: `h:mm` per solved cell, `+n` for the rejections before it.
await pick("Runda 0 — rozgrzewkowa");
await wait(2500);
const adds = await evaluate(`
    const clock = s => {
        const m = /^(\\d+):(\\d{2})$/.exec(s.trim());
        return m ? Number(m[1]) * 60 + Number(m[2]) : undefined;
    };
    const bad = [];
    const rows = [...document.querySelectorAll("tbody tr")];
    for (const row of rows) {
        const cells = [...row.querySelectorAll("td")].map(c => c.innerText.trim());
        const solved = Number(cells[2]);
        const printed = clock(cells[3]) ?? 0;
        let sum = 0, counted = 0;
        for (const cell of cells.slice(4)) {
            const minute = clock(cell.split(/\\s+/)[0] ?? "");
            if (minute === undefined) continue;
            const extra = /\\+(\\d+)/.exec(cell);
            sum += minute + 20 * (extra ? Number(extra[1]) : 0);
            counted += 1;
        }
        if (sum !== printed || counted !== solved) {
            bad.push(cells[1] + ": printed " + printed + "/" + solved + ", cells " + sum + "/" + counted);
        }
    }
    return { rows: rows.length, bad };
`);
check(adds.rows > 0 && adds.bad.length === 0,
    `every penalty is what its own cells add up to (${adds.rows} rows${adds.bad.length ? ": " + adds.bad.join("; ") : ""})`);

// ── 4. A round whose window is shut is still offered, and says from when ─────
// **The clock is advanced inside the loop, never once before it.**
//
// The fake schedules the opening with `setTimeout` when it is constructed, so a
// single jump taken before the page has got that far fires nothing — and a
// virtual clock does not advance on its own afterwards, which turns a 45-second
// wait into an unbounded one. It passed locally and **failed in CI**, where the
// page mounts slower: `nothing to click: Runda 2`. Ten virtual seconds per turn,
// after the DOM has been read, so the timer exists by the time time moves.
// Runda 2 opens 45 s after load and its board is held back until it ends.
await visit("/activities/AMMPZ-2019/ranking", `document.body.innerText.includes("Ranking")`);
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
check(/będzie dostępny od|dostępny od/i.test(await body()),
    "a round whose window is shut says from when");
check(await evaluate(`return document.querySelectorAll("tbody tr").length === 0;`),
    "and draws no board at all");
await shot("res-held");

// ── 4b. `ranking:read:unfrozen` is applied to the FEED, not by the screen ───
// amy holds it. She gets the rounds the window and the freeze would withhold —
// with their columns. The bug this locks down drew a board out of a feed that
// carried none of it: five contestants, no columns, everybody on nought.
await go(`${APP}/activities/AMMPZ-2019/ranking?fakeUser=amy`, `document.body.innerText.includes("Ranking")`);
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
const privileged = await heads();
check(privileged.includes("E") && privileged.includes("F") && privileged.includes("G"),
    `a held-back round reaches whoever may read past the window, with its columns (${privileged.join(" ")})`);
check(await evaluate(`return document.querySelectorAll("tbody tr").length > 0;`),
    "and its board is drawn rather than a table of empty rows");

await pick("Zbiorczy");
await wait(2500);
const unfrozen = await heads();
check(unfrozen.includes("A") && !unfrozen.includes("A*"),
    `and the frozen round reaches them unfrozen, so its columns lose the mark (${unfrozen.join(" ")})`);
check(!/zamro|frozen/i.test(await body()),
    "with nothing claiming the board is frozen for them");
await shot("res-unfrozen");

// ── 5. participantOnly: the reader's own row, and no place ──────────────────
await go(`${APP}/activities/PROG-1-LA/ranking?fakeUser=amy`, `document.body.innerText.includes("Ranking")`);
await wait(3000);
const course = await evaluate(`
    const head = [...document.querySelectorAll("th")].map(h => h.textContent.trim());
    const rows = [...document.querySelectorAll("tbody tr")];
    return {
        head,
        rows: rows.length,
        names: rows.map(r => r.querySelectorAll("td")[0]?.textContent.trim()),
    };
`);
check(course.rows === 1, `a participantOnly board shows one row (${course.rows})`);
check(!course.head.includes("Miejsce"), "and no place column");
check(course.names.some(n => /Amy/.test(n ?? "")), `which is the reader's (${course.names.join(", ")})`);
await shot("res-own");

// ── 6. `extra` reaches the feed, and the freeze takes it with the outcome ───
// Nothing renders it — no ranking type here needs it yet — so it is read where
// the raw feed is printed: the fallback for an unsupported ranking type.
await go(`${APP}/activities/WARSZTAT-9/ranking?fakeUser=amy`, `document.body.innerText.includes("Ranking")`);
await wait(3000);
const raw = await body();
check(/Nieobsługiwany|Unsupported/i.test(raw),
    "an unsupported ranking type falls back to the raw feed");
check(/"extra"/.test(raw) && /guesses/.test(raw),
    "which carries what the Runner measured beyond the score");
await shot("res-extra");

// Withheld with the rest of the outcome: a frozen result carries `frozen` and
// nothing about how it went, `extra` included — one return path in `resultOf`.
await go(`${APP}/activities/AMMPZ-2019/ranking?fakeUser=anowak`, `document.body.innerText.includes("Ranking")`);
await wait(3000);
await pick("Runda 1");
await wait(2500);
check(await evaluate(`
    return [...document.querySelectorAll("tbody td")]
        .some(c => c.textContent.trim().startsWith("?"));
`), "and a frozen round discloses neither a score nor a metric");

report();
close();
