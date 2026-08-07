// What a manager does to an activity: publishes its documents, sets how people
// join it, and makes accounts for a class that has none.
import { open, results } from "./cdp.mjs";

const APP = process.env.APP ?? "http://localhost:5180";
const { evaluate, wait, shot, go, visit, click, type, setTextarea, tab, close } =
    await open({ out: process.env.OUT ?? "." });
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
    return switches.some(s => s.checked && s.closest("label, [class*=Switch-root]")
        ?.textContent.includes("Ukryj"));
`), "and the activity is marked as hidden from the list");
await shot("mact-settings");

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
    const navbar = document.querySelector("[class*=AppShell-navbar]");
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
    const modal = document.querySelector("[class*=Modal-content]");
    return modal !== null && !/Zapisz do|Enrol into/.test(modal.innerText);
`), "and does not ask which activity, because it already knows");
await evaluate(`
    const modal = document.querySelector("[class*=Modal-content]");
    const prefix = modal.querySelector("input");
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(prefix, "grupa-la");
    prefix.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
`);
await wait(500);
await click(`[...document.querySelectorAll("[class*=Modal-content] button")].find(b => b.textContent.trim() === "Utwórz")`);
await wait(3500);
const credentials = await evaluate(`
    const modal = document.querySelector("[class*=Modal-content]");
    return modal ? modal.innerText : "";
`);
check(/username,password/.test(credentials) && /grupa-la-001/.test(credentials),
    "the credentials are handed over once, as a list to keep");
check(/jedyny moment|only time/i.test(credentials),
    "and it says so, because there is no second chance");
await shot("mact-accounts");
await click(`[...document.querySelectorAll("[class*=Modal-content] button")].find(b => b.textContent.trim() === "Gotowe")`);
await wait(2500);
const after = await evaluate(`return document.querySelectorAll("tbody tr").length;`);
check(after > before,
    `the accounts are in the activity already enrolled (${before} → ${after})`);

report();
close();
