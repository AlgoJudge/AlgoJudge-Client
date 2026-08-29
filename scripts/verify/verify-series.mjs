// Moving a series, stopping it, and being told about it.
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
 * One round's own block.
 *
 * The contest holds four rounds, each with the same controls, so a bare
 * `find(b => b.textContent === "Wstrzymaj")` reaches whichever comes first —
 * which is the round that ended yesterday, not the one being fought.
 */
const round = (name) => `[...document.querySelectorAll("[data-testid=accordion-item]")]
    .find(i => i.innerText.startsWith(${JSON.stringify(name)}))`;
const pressIn = (name, text) => click(
    `[...((${round(name)})?.querySelectorAll("button") ?? [])]
        .find(b => b.textContent.trim() === ${JSON.stringify(text)})`);

/** The shift card, which is one card with a round-picker of its own. */
const shiftCard = `[...document.querySelectorAll("[data-testid=card]")]
    .find(c => c.innerText.includes("Przesuń trwanie serii"))`;

const readPreview = () => evaluate(`
    const card = ${shiftCard};
    return card ? card.innerText.replace(/\\s+/g, " ").trim() : null;
`);

/**
 * The preview, once it has stopped moving.
 *
 * Read straight after choosing a round it can be torn — the "from" span still
 * the old round's while the "to" span is already the new one — and the check
 * below then measures a shift between two different rounds. Two equal reads mean
 * the component has settled. It failed about one full run in four before this.
 */
const preview = async () => {
    let last = await readPreview();
    for (let i = 0; i < 10; i++) {
        await wait(400);
        const now = await readPreview();
        if (now === last) return now;
        last = now;
    }
    return last;
};

/** Points the shift card at one round. It opens on the first, which is Runda 0. */
const chooseRound = async (name) => {
    await click(`(${shiftCard})?.querySelector("input")`);
    await wait(700);
    await click(`[...document.querySelectorAll("[data-testid=combobox-option], [role=option]")]
        .find(o => o.textContent.trim() === ${JSON.stringify(name)})`);
    await wait(1200);
};

// 1 — the preview says what is about to happen, before it happens.
await go(`${APP}/manager/activities?fakeUser=john`, MANAGER_LIST);
await openContest();
await wait(1200);
// The card opens on the first round, which is the one that ended yesterday.
await chooseRound("Runda 1");
const before = await preview();
check(before !== null && /z \d{2}:\d{2}–\d{2}:\d{2} na \d{2}:\d{2}–\d{2}:\d{2}/.test(before),
    `the preview shows both spans before anything is pressed (${before})`);

const times = /z (\d{2}:\d{2})–(\d{2}:\d{2}) na (\d{2}:\d{2})–(\d{2}:\d{2})/.exec(before ?? "");
// Modulo a day, because a round whose end crosses midnight reads `23:53 → 00:03`
// — ten minutes later, and **-1430** by plain subtraction. That made this
// assertion fail for the hour before midnight and pass for the other
// twenty-three; caught at 22:57 on 2026-08-29. Safe because the shift under test
// is ten minutes, nowhere near a day.
const minutesBetween = (a, b) => {
    const [ah, am] = a.split(":").map(Number);
    const [bh, bm] = b.split(":").map(Number);
    return ((((bh * 60 + bm) - (ah * 60 + am)) % 1440) + 1440) % 1440;
};
check(times !== null && minutesBetween(times[1], times[3]) === 10
    && minutesBetween(times[2], times[4]) === 10,
    "and both instants move by the same ten minutes");

await click(`[...((${shiftCard})?.querySelectorAll("button") ?? [])].find(b => b.textContent.trim() === "Przesuń")`);
await wait(3000);
const after = await preview();
const moved = /z (\d{2}:\d{2})–/.exec(after ?? "");
check(moved !== null && times !== null && moved[1] === times[3],
    `the series now holds the times the preview promised (${moved?.[1]} was ${times?.[3]})`);
await shot("ser-shift");

// 2 — stopping a round, without taking the statements away.
await pressIn("Runda 1", "Wstrzymaj");
await wait(1500);
check(/nie przyjmuje zgłoszeń/.test(await body()),
    "pausing says what a pause does before it is confirmed");
check(await evaluate(`
    const modal = document.querySelector("[data-testid=modal]");
    const box = [...(modal?.querySelectorAll("input[type=checkbox]") ?? [])].at(-1);
    return box ? !box.checked : false;
`), "and offers to hide the statements, unticked");
await shot("ser-pause");
await click(`[...document.querySelectorAll("[data-testid=modal] button")].find(b => b.textContent.trim() === "Wstrzymaj")`);
await wait(3000);
check(await evaluate(`
    return [...document.querySelectorAll("[data-testid=badge]")].some(b => /Wstrzymana/.test(b.textContent));
`), "the series says it is stopped");

// The participant sees it, and cannot submit into it.
await visit("/activities/AMMPZ-2019/problems", `document.body.innerText.includes("Runda 1")`);
await wait(1500);
check(/wstrzymana/i.test(await body()), "and so does the participant, on the problems");
check(/sp[óo]jno[śs][ćc]/i.test(await body()),
    "with the statements still there, because that is what was chosen");
await shot("ser-participant");

await visit("/activities/AMMPZ-2019/submit/A", `/spójność/i.test(document.body.innerText)`);
await wait(1500);
check(/wstrzymana/i.test(await body()),
    "the submit form says the series is paused");
check(await evaluate(`
    const send = [...document.querySelectorAll("button")].find(b => /Wyślij/.test(b.textContent));
    return send ? send.disabled : false;
`), "and refuses to send rather than letting an answer be written first");

// 3 — starting it again, giving the time back.
await visit("/manager/activities", MANAGER_LIST);
await openContest();
await wait(1200);
await pressIn("Runda 1", "Wznów");
await wait(1500);
check(/Przerwa trwa/.test(await body()), "resuming says how long the pause lasted");
check(await evaluate(`
    const modal = document.querySelector("[data-testid=modal]");
    const box = [...(modal?.querySelectorAll("input[type=checkbox]") ?? [])].at(-1);
    return box ? box.checked : false;
`), "and offers to give the time back, ticked");
await click(`[...document.querySelectorAll("[data-testid=modal] button")].find(b => b.textContent.trim() === "Wznów")`);
await wait(3000);
check(await evaluate(`
    return [...document.querySelectorAll("[data-testid=badge]")].some(b => /Trwa/.test(b.textContent))
        && [...document.querySelectorAll("[data-testid=badge]")].every(b => !/Wstrzymana/.test(b.textContent));
`), "and the series is running again");

report();
close();
