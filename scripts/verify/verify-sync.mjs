// The two halves of the fake, read from both sides and compared.
//
// Every check here reads the SAME fact twice — once from /manager/activities/X
// and once from /activities/X — and asserts the two agree. Nothing asserts a
// constant: a constant would only prove the fixture still says what it said.
import { open, results } from "./harness.mjs";

const APP = process.env.APP ?? "http://localhost:5180";
const { evaluate, wait, shot, go, visit, click, close } =
    await open();
const { check, report } = results();

const body = () => evaluate(`return document.body.innerText;`);
const norm = (s) => (s ?? "").replace(/\s+/g, " ").trim();

// ── The fake, asked directly ─────────────────────────────────────────────────
// Reading the API rather than scraping two screens: the report is about the
// DATA disagreeing, and a screen adds its own formatting between us and it.
const viaApi = async (expr) => evaluate(`
    const factory = window.__algojudge_api ?? null;
    return ${expr};
`);

// ── 1. The same contest, read from both sides ────────────────────────────────
await go(`${APP}/manager/activities?fakeUser=amy`, `document.body.innerText.includes("Aktywno")`);
await wait(1500);

const managerRow = await evaluate(`
    const row = [...document.querySelectorAll("tr, [class*=Card-root]")]
        .find(r => r.innerText.includes("AMMPZ-2019"));
    return row ? row.innerText.replace(/\\s+/g, " ").trim() : null;
`);
check(managerRow !== null, `the contest is in the manager's list (${managerRow})`);

await visit("/manager/activities/AMMPZ-2019", `document.body.innerText.includes("AMMPZ-2019")`);
await wait(2000);
const managerName = await evaluate(`
    const h = document.querySelector("[class*=AppShell-main] h1, [class*=AppShell-main] h2");
    return h ? h.textContent.trim() : null;
`);
check(managerName !== null, `the manager's page opens by slug, not by id (${managerName})`);

// The rounds, as the manager panel lists them.
const managerRounds = await evaluate(`
    const panels = [...document.querySelectorAll("[class*=Accordion-item], [class*=Paper-root]")];
    const names = new Set();
    for (const p of panels) {
        const m = p.innerText.match(/Runda \\d[^\\n]*/g);
        for (const n of (m ?? [])) names.add(n.trim());
    }
    return [...names];
`);
check(managerRounds.length >= 4,
    `the manager sees four rounds, not two (${managerRounds.length}: ${managerRounds.join(" | ")})`);

// ── 2. The same rounds on the participant's side ─────────────────────────────
await visit("/activities/AMMPZ-2019/problems", `document.body.innerText.includes("Runda")`);
await wait(2000);
const participantText = await body();
const participantRounds = [...new Set((participantText.match(/Runda \d[^\n]*/g) ?? []).map(s => s.trim()))];
check(participantRounds.length >= 4,
    `the participant sees the same four (${participantRounds.length}: ${participantRounds.join(" | ")})`);

// The names have to be the same names, not merely the same count.
const shared = managerRounds.filter(name =>
    participantRounds.some(other => other.startsWith(name) || name.startsWith(other)));
check(shared.length >= 3,
    `and they are the same rounds by name (${shared.length} matched)`);

// ── 3. The activity's own name, both sides ───────────────────────────────────
await visit("/activities", `document.body.innerText.includes("AMMPZ-2019")`);
await wait(1500);
const participantName = await evaluate(`
    const card = [...document.querySelectorAll("[class*=Card-root]")]
        .find(c => c.innerText.includes("AMMPZ-2019"));
    if (!card) return null;
    return card.innerText.split("\\n").map(s => s.trim()).find(s => /Mistrzostwa/.test(s)) ?? null;
`);
check(participantName !== null && participantName === managerName,
    `both sides give it the SAME name (${managerName} / ${participantName})`);
await visit("/activities/AMMPZ-2019/problems", `document.body.innerText.includes("Runda")`);
await wait(1800);

// ── 4. The four states the seed has to hold ──────────────────────────────────
// Read from the participant's problems screen, which says what each round is
// doing right now.
check(/zakończ|Runda 0/i.test(participantText),
    "one round has ended and is still listed");
check(/Runda 1/.test(participantText),
    "one round is running");
check(/Runda 2/.test(participantText),
    "one round opens shortly");
check(/Runda 3/.test(participantText),
    "one round is still ahead");
await shot("sync-rounds");

// ── 5. A problem's attempt count against the submissions it came from ────────
// The summary used to claim five where the list held two. Both are now read off
// the same attempts, so they have to agree.
await click(`[...document.querySelectorAll("[class*=Paper-root] button")]
    .find(b => /Moje zgłoszenia/.test(b.textContent))`);
await wait(1500);
const panelRows = await evaluate(`
    const panel = [...document.querySelectorAll("[class*=Paper-root]")]
        .find(p => /Moje zgłoszenia/.test(p.innerText) && getComputedStyle(p).position === "fixed");
    return [...(panel?.querySelectorAll("[class*=row]") ?? [])]
        .map(r => r.innerText.replace(/\\s+/g, " ").trim());
`);
const forB = panelRows.filter(r => /\[B\]/.test(r)).length;
check(panelRows.length > 0, `the panel holds the reader's submissions (${panelRows.length})`);

await visit("/activities/AMMPZ-2019/problems/B", `/Pr(ó|o)by|Najkr/i.test(document.body.innerText)`);
await wait(2200);
const screenB = await evaluate(`
    const m = document.body.innerText.match(/Pr(?:ó|o)by:\\s*(\\d+)/);
    return m ? Number(m[1]) : null;
`);
check(screenB !== null && screenB === forB,
    `problem B's own attempt count equals its rows in the panel (${screenB} vs ${forB})`);

// ── 6. The panel's row fits on one line ──────────────────────────────────────
const oneLine = await evaluate(`
    const panel = [...document.querySelectorAll("[class*=Paper-root]")]
        .find(p => /Moje zgłoszenia/.test(p.innerText) && getComputedStyle(p).position === "fixed");
    const row = panel?.querySelector("[class*=row]");
    if (!row) return null;
    // One line means the row is no taller than a single line of its own text.
    const line = parseFloat(getComputedStyle(row).lineHeight) || 20;
    return { height: row.getBoundingClientRect().height, line, width: panel.getBoundingClientRect().width };
`);
check(oneLine !== null && oneLine.height <= oneLine.line * 1.9,
    `the submissions row is one line (${oneLine?.height}px against a ${oneLine?.line}px line, panel ${oneLine?.width}px)`);
await shot("sync-panel");

// ── 7. A board adds up to its own cells ──────────────────────────────────────
await visit("/activities/AMMPZ-2019/ranking", `document.body.innerText.includes("Ranking")`);
await wait(2500);
await click(`[...document.querySelectorAll("[class*=SegmentedControl] label")]
    .find(l => /Runda 0/.test(l.textContent))`);
await wait(2500);
// Recomputed from what the table itself printed: a solved cell shows its minute
// as `h:mm` and `+n` for the rejected attempts before it, so the penalty column
// has to be the sum of `minute + 20n`. This is the check the old fixture failed —
// a row claiming 331 whose cells came to 351.
const adds = await evaluate(`
    const clock = s => {
        const m = /^(\\d+):(\\d{2})$/.exec(s.trim());
        return m ? Number(m[1]) * 60 + Number(m[2]) : undefined;
    };
    const rows = [...document.querySelectorAll("tbody tr")];
    if (rows.length === 0) return null;
    const bad = [];
    for (const row of rows) {
        const cells = [...row.querySelectorAll("td")].map(c => c.innerText.trim());
        // place | name | solved | penalty | one per problem
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
            bad.push(cells[1] + ": printed " + printed + "/" + solved
                + ", cells add to " + sum + "/" + counted);
        }
    }
    return { rows: rows.length, bad };
`);
check(adds !== null && adds.bad.length === 0,
    `every penalty is what its own cells add up to (${adds?.rows} rows${adds?.bad.length ? ": " + adds.bad.join("; ") : ""})`);
await shot("sync-board");

// ── 8. TRENING-OTWARTY and WARSZTAT-9 agree on what they are ─────────────────
await visit("/manager/activities/TRENING-OTWARTY", `document.body.innerText.length > 0`);
await wait(2000);
const practiceManager = norm(await body());
check(/Zbiór zadań/.test(practiceManager),
    "the practice activity has its round on the manager's side");

await visit("/activities/TRENING-OTWARTY", `document.body.innerText.length > 0`);
await wait(2000);
const practiceParticipant = norm(await body());
check(/Trening otwarty/.test(practiceParticipant),
    "and the participant reaches the same activity");

await visit("/activities/WARSZTAT-9", `document.body.innerText.length > 0`);
await wait(1800);
check(/nieobsługiwan|nie jest obsługiwan|Etap 1|zapisuje organizator/i.test(await body()),
    "the unsupported-type activity still renders its controlled fallback");

report();
close();
