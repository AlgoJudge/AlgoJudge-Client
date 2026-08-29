// What a manager does to an activity: publishes its documents, sets how people
// join it, and makes accounts for a class that has none.
import { open, results } from "./harness.mjs";

const APP = process.env.APP ?? "http://localhost:5180";
const { evaluate, wait, shot, go, visit, click, type, setTextarea, tab, close } =
    await open();
const { check, report } = results();

const body = () => evaluate(`return document.body.innerText;`);
/** A row of the manager's own table, not the slug wherever it happens to appear. */
const MANAGER_LIST = `[...document.querySelectorAll("tbody tr")].some(r => r.innerText.includes("PROG-1-LA"))`;
const PL = "---\nversion: 1\n---\n\n# Zasady grupy LA\n\nTermin oddania: niedziela.\n";
const EN = "---\nversion: 1\n---\n\n# Rules for group LA\n\nDue on Sunday.\n";

// 1 — the manager screen lists the three kinds and what is published.
await go(`${APP}/manager/activities?fakeUser=john`, `document.body.innerText.includes("PROG-1-LA")`);
await click(`[...document.querySelectorAll("tbody tr")]
    .find(r => r.innerText.includes("PROG-1-LA"))
    ?.querySelector("td")`);
await wait(2500);
await click(tab("Dokumenty"));
const rows = await evaluate(`
    return [...document.querySelectorAll("tbody tr")].map(r => r.innerText.replace(/\\s+/g, " ").trim());
`);
check(rows.some(r => /Strona dla niezapisanych/.test(r)) &&
      rows.some(r => /Strona dla uczestników/.test(r)) &&
      rows.some(r => /Regulamin/.test(r)),
    "an activity's three documents are listed");
check(rows.filter(r => /publikowany/i.test(r) && !/nie publikowany|niepublikowany/i.test(r)).length >= 3,
    "and all three are published, in the languages they were written in");
await shot("mact-documents");

// 2 — republishing the rules replaces what readers get, and keeps the old one.
//     Publishing in two languages at once goes through this very panel and is
//     covered where it was built, against the instance's documents.
await click(`[...document.querySelectorAll("tbody tr")]
    .find(r => r.innerText.includes("Regulamin"))
    ?.querySelector("button")`);
await wait(2500);
check(await evaluate(`
    return [...document.querySelectorAll("[role=tab]")].some(t => /angielski|english/i.test(t.textContent));
`), "the rules open with every language they were written in");
await setTextarea(PL);
await click(`[...document.querySelectorAll("button")].find(b => b.textContent.trim() === "Opublikuj")`);
await wait(3000);
check(/Wcześniejsze wersje/.test(await body()),
    "publishing keeps the revision it replaced in the history");

// 3 — and the participant reads the new one.
await visit("/activities/PROG-1-LA/rules", `document.body.innerText.includes("Zasady grupy LA")`);
check(/Zasady grupy LA/.test(await body()),
    "what the manager published is what the participant reads");

// 4 — the share link carries the password in its fragment.
await visit("/manager/activities", MANAGER_LIST);
await click(`[...document.querySelectorAll("tbody tr")]
    .find(r => r.innerText.includes("PROG-1-LA"))
    ?.querySelector("td")`);
await wait(2500);
await click(tab("Ustawienia"));
await wait(800);
const link = await evaluate(`
    const marker = [...document.querySelectorAll("*")]
        .find(e => e.children.length === 0 && /#/.test(e.textContent) && /\\/activities\\//.test(e.textContent));
    return marker ? marker.textContent.trim() : null;
`);
check(link !== null && /\/activities\/PROG-1-LA#PROG1-LA$/.test(link),
    `the share link is the activity's address with the password in the fragment (${link})`);
check(await evaluate(`
    const switches = [...document.querySelectorAll("input[type=checkbox]")];
    return switches.some(s => s.checked && s.closest("label, [data-testid=switch]")
        ?.textContent.includes("Ukryj"));
`), "and the activity is marked as hidden from the list");
await shot("mact-settings");

// 4b — the roster switch draws what is stored, and saving keeps it.
//
// **The setting reached no DTO at all until 2026-08-26**, so this screen could
// not draw it and nothing could turn it on. Both halves are asserted because
// they fail apart: a `toInput` that dropped the field draws the switch off over
// a stored `true`, and a save that dropped it turns a stored `true` off on the
// next visit. The seed has it on for this activity, which is why reading is
// worth anything here.
const roster = () => evaluate(`
    const found = [...document.querySelectorAll("input[type=checkbox]")]
        .find(s => s.closest("label, [data-testid=switch]")?.textContent.includes("skład grupy"));
    return found === undefined ? null : found.checked;
`);
check(await roster() === true,
    "the roster switch draws what the activity has stored");

// The visible panel's Save: every mounted round has a button reading `Zapisz`
// too, and those come first in the document, so an unscoped search saves a round
// and leaves this form untouched — a way of passing that says nothing.
await click(`[...(([...document.querySelectorAll("[role=tabpanel]")]
    .find(p => p.offsetParent !== null))?.querySelectorAll("button") ?? [])]
    .find(b => b.textContent.trim() === "Zapisz")`);
await wait(3000);

await visit("/manager/activities", MANAGER_LIST);
await click(`[...document.querySelectorAll("tbody tr")]
    .find(r => r.innerText.includes("PROG-1-LA"))
    ?.querySelector("td")`);
await wait(2500);
await click(tab("Ustawienia"));
await wait(800);
check(await roster() === true, "and saving the form does not quietly turn it off");

// 5 — withdrawing a document takes its links with it.
await click(tab("Dokumenty"));
await click(`[...document.querySelectorAll("tbody tr")]
    .find(r => r.innerText.includes("Strona dla uczestników"))
    ?.querySelector("button")`);
await wait(2500);
await click(`[...document.querySelectorAll("button")].find(b => b.textContent.trim() === "Przestań publikować")`);
await wait(3000);
check(await evaluate(`
    const row = [...document.querySelectorAll("tbody tr")].find(r => r.innerText.includes("Strona dla uczestników"));
    return row ? /nie\\s*publikowany|niepublikowany/i.test(row.innerText) : false;
`), "a withdrawn document says it is no longer published");

await visit("/activities/PROG-1-LA/problems", `document.body.innerText.length > 0`);
check(await evaluate(`
    const navbar = document.querySelector("[data-testid=app-navbar]");
    return [...(navbar?.querySelectorAll("a") ?? [])].every(a => a.textContent.trim() !== "Strona aktywności");
`), "and the entry to it leaves the navigation at once");
check(await evaluate(`return location.pathname === "/activities/PROG-1-LA/problems";`),
    "while the activity itself still opens");

// 6 — accounts for a class, made and enrolled from inside the activity.
await visit("/manager/activities", MANAGER_LIST);
await click(`[...document.querySelectorAll("tbody tr")]
    .find(r => r.innerText.includes("PROG-1-LA"))
    ?.querySelector("td")`);
await wait(2500);
await click(tab("Uczestnicy"));
await wait(800);
const before = await evaluate(`return document.querySelectorAll("tbody tr").length;`);
check(await evaluate(`
    return [...document.querySelectorAll("button")].some(b => b.textContent.trim() === "Konta tymczasowe");
`), "an activity offers making temporary accounts from inside it");
await click(`[...document.querySelectorAll("button")].find(b => b.textContent.trim() === "Konta tymczasowe")`);
await wait(1200);
check(await evaluate(`
    const modal = document.querySelector("[data-testid=modal]");
    return modal !== null && !/Zapisz do|Enrol into/.test(modal.innerText);
`), "and does not ask which activity, because it already knows");
await evaluate(`
    const modal = document.querySelector("[data-testid=modal]");
    const prefix = modal.querySelector("input");
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(prefix, "grupa-la");
    prefix.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
`);
await wait(500);
await click(`[...document.querySelectorAll("[data-testid=modal] button")].find(b => b.textContent.trim() === "Utwórz")`);
await wait(3500);
const credentials = await evaluate(`
    const modal = document.querySelector("[data-testid=modal]");
    return modal ? modal.innerText : "";
`);
check(/username,password/.test(credentials) && /grupa-la-001/.test(credentials),
    "the credentials are handed over once, as a list to keep");
check(/jedyny moment|only time/i.test(credentials),
    "and it says so, because there is no second chance");
await shot("mact-accounts");
await click(`[...document.querySelectorAll("[data-testid=modal] button")].find(b => b.textContent.trim() === "Gotowe")`);
await wait(2500);
const after = await evaluate(`return document.querySelectorAll("tbody tr").length;`);
check(after > before,
    `the accounts are in the activity already enrolled (${before} → ${after})`);

// — copying an activity for a new run, and the state it arrives in.
//
// The dangerous case is a copy of last year that opens itself: the dates are
// last year's until somebody moves them, so the screen asks for a start and the
// copy arrives unpublished.
await go(`${APP}/manager/activities?fakeUser=john`, MANAGER_LIST);

const offers = await evaluate(`
    const buttons = [...document.querySelectorAll("button")].map(b => b.textContent);
    return {
        copy: buttons.some(text => text.includes("Skopiuj na nową edycję")),
        withdraw: buttons.some(text => text.includes("Wycofaj")),
    };
`);
check(offers.copy, "an activity can be copied for a new run");
check(offers.withdraw, "a published activity can be withdrawn");

await click(`[...document.querySelectorAll("button")]
    .find(b => b.textContent.includes("Skopiuj na nową edycję"))`);
await wait(700);

const dialogue = await evaluate(`
    const text = document.body.innerText;
    const button = [...document.querySelectorAll("button")]
        .find(b => b.textContent.trim() === "Skopiuj");
    return {
        saysUnpublished: text.includes("nieopublikowana"),
        asksForDate: text.includes("Kiedy zaczyna się pierwsza runda"),
        blocked: button ? button.disabled : false,
    };
`);
check(dialogue.asksForDate, "copying asks when the first round starts");
check(dialogue.saysUnpublished, "copying says the copy arrives unpublished");
check(dialogue.blocked, "copying waits for a name and a date");

// Both fields set the same way: `type` takes a CSS selector, and these two are
// found by placeholder and by input type rather than by any class.
await evaluate(`
    const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, "value").set;
    const fill = (input, value) => {
        setter.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
    };
    const inputs = [...document.querySelectorAll("input")];
    fill(inputs.find(i => i.placeholder === "asd-2027"), "asd-2027");
    fill(inputs.find(i => i.type === "datetime-local"), "2027-10-01T09:00");
    return true;
`);
await wait(300);
await shot("activity-copy-dialogue");

await click(`[...document.querySelectorAll("button")]
    .find(b => b.textContent.trim() === "Skopiuj")`);
await wait(900);

const listed = await body();
check(listed.includes("asd-2027"), "the copy is in the list");
// **And it is marked as not ready**, which is the whole reason the state exists:
// a copy that looked like every other row would be opened by somebody assuming
// it was.
// **`textContent`, not `innerText`.** The badge is styled to ellipsise, and the
// rendered text is what `innerText` reports — so a state can be present, correct
// and invisible to a check that reads the screen the way a person sees it.
const states = await evaluate(`
    return [...document.querySelectorAll("tbody tr")]
        .map(row => row.cells[2] ? row.cells[2].textContent.trim() : "");
`);
check(states.includes("W przygotowaniu"),
    `the copy says it is being prepared (states: ${JSON.stringify(states)})`);

await shot("activity-copied");

report();
close();
