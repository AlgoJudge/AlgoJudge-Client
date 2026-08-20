// The seven corrections, in the order they were asked for.
import { open, results } from "./harness.mjs";

const APP = process.env.APP ?? "http://localhost:5180";
const { evaluate, wait, shot, go, visit, click, tab, close } = await open();
const { check, report } = results();

const body = () => evaluate(`return document.body.innerText;`);
const headerLinks = () => evaluate(`
    const header = document.querySelector("header");
    return [...(header?.querySelectorAll("a") ?? [])].map(a => a.textContent.trim()).filter(Boolean);
`);

// 1 — a way to register, and only where there is one.
await go(`${APP}/`, `document.body !== null`);
await evaluate(`localStorage.clear(); sessionStorage.clear(); return true;`);
await go(`${APP}/?fakeRegistration=off`, `document.querySelector("header") !== null`);
check(!(await headerLinks()).some(l => /Rejestracja|Register/i.test(l)),
    "an instance taking no sign-ups offers no way to register");

await go(`${APP}/?fakeRegistration=on`, `document.querySelector("header") !== null`);
const withSignups = await headerLinks();
check(withSignups.some(l => /Rejestracja|Register/i.test(l)),
    "one that does offers it in the header");
check(withSignups.indexOf("Rejestracja") < withSignups.indexOf("Logowanie"),
    "before the sign-in entry, which is the order somebody reads them in");
await shot("seven-header");

// 2 — the terms are read without losing the form.
await visit("/register", `document.body.innerText.includes("Rejestracja")`);
await evaluate(`
    const fields = [...document.querySelectorAll("input")];
    const set = (field, value) => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(field, value);
        field.dispatchEvent(new Event("input", { bubbles: true }));
    };
    set(fields[0], "nowy-student");
    return true;
`);
await wait(500);
check(await evaluate(`
    const box = [...document.querySelectorAll("input[type=checkbox]")].at(-1);
    return box?.required === true;
`), "the acceptance box is marked required");
await click(`[...document.querySelectorAll("button")].find(b => /Regulamin/.test(b.textContent))`);
await wait(2500);
check(await evaluate(`return document.querySelector("[class*=Modal-content]") !== null;`),
    "the terms open over the form rather than instead of it");
check(/Regulamin|zasady/i.test(await evaluate(`
    const modal = document.querySelector("[class*=Modal-content]");
    return modal ? modal.innerText : "";
`)), "with the document in them");
await shot("seven-terms");
await click(`[...document.querySelectorAll("[class*=Modal-close]")].at(-1)`);
await wait(1200);
check(await evaluate(`
    return document.querySelector("input")?.value === "nowy-student";
`), "and closing leaves what was typed exactly where it was");

// 3 — the same on the enrolment form, with one label rather than two.
await go(`${APP}/activities/PROG-1-LB?fakeUser=amy`, `document.body.innerText.includes("Zapisz si")`);
check(await evaluate(`
    const box = [...document.querySelectorAll("input[type=checkbox]")].at(-1);
    return box?.required === true;
`), "the rules box is marked required too");
check(!/akceptuję go — |akceptuję go —/.test(await body()),
    "and its label names the document once, not twice");
await click(`[...document.querySelectorAll("button")].find(b => /Zapoznałem/.test(b.textContent))`);
await wait(2500);
check(await evaluate(`return document.querySelector("[class*=Modal-content]") !== null;`),
    "the rules open over the enrolment form");
await shot("seven-rules");
await click(`[...document.querySelectorAll("[class*=Modal-close]")].at(-1)`);
await wait(1000);

// 6 — and the way into the problems, for somebody already in.
await go(`${APP}/activities/PROG-1-LA?fakeUser=amy`, `document.body.innerText.includes("Witamy")`);
check(await evaluate(`
    return [...document.querySelectorAll("a")].some(a =>
        /Przejdź do zadań/.test(a.textContent) && a.getAttribute("href") === "/activities/PROG-1-LA/problems");
`), "the activity page offers the way into the problems");

// 7 — the ranking follows who sees scores.
const navLinks = () => evaluate(`
    const navbar = document.querySelector("[class*=AppShell-navbar]");
    return [...(navbar?.querySelectorAll("a") ?? [])].map(a => a.textContent.trim());
`);
check((await navLinks()).includes("Ranking"),
    "a course whose scores only their owner sees still offers the ranking");
await visit("/activities/PROG-1-LA/ranking", `document.body.innerText.length > 0`);
await wait(2000);
check(await evaluate(`
    const head = [...document.querySelectorAll("th")].map(h => h.textContent.trim());
    return !head.includes("Miejsce");
`), "and it has no place column, because there is no place to give");
check(await evaluate(`
    return document.querySelectorAll("tbody tr").length === 1;
`), "and one row: their own");
await shot("seven-ranking");

await go(`${APP}/activities/AMMPZ-2019/ranking?fakeUser=amy`, `document.body.innerText.length > 0`);
await wait(2000);
check(await evaluate(`
    const head = [...document.querySelectorAll("th")].map(h => h.textContent.trim());
    return head.includes("Miejsce");
`), "an activity whose scores everybody sees keeps the places");
check(await evaluate(`return document.querySelectorAll("tbody tr").length > 1;`),
    "and the whole board");

report();
close();
