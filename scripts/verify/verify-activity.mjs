// The activity's own page, self-enrolment, and the documents behind both.
import { open, results } from "./harness.mjs";

const APP = process.env.APP ?? "http://localhost:5180";
const PASSWORD = "PROG1-LA";
const { evaluate, wait, shot, go, visit, click, type, tab, close } =
    await open();
const { check, report } = results();

const navLinks = () => evaluate(`
    const navbar = document.querySelector("[data-testid=app-navbar]");
    return [...(navbar?.querySelectorAll("a") ?? [])].map(a => a.textContent.trim());
`);
const body = () => evaluate(`return document.body.innerText;`);

// 1 — an activity with a participant page: clicking it lands there, and the
//     entry sits above the problems.
// **Waits for the cards, not for the word.** "Aktywno" is in the sidebar's own
// navigation and is true while the list is still being fetched — so under load
// this clicked at a page that had drawn its shell and nothing else. Found on
// 2026-08-20, the first time the suite ran four at a time. Waiting for the card
// is waiting for a precondition, not for what is asserted below.
await go(`${APP}/activities?fakeUser=amy`,
    `[...document.querySelectorAll("[data-testid=card]")].some(c => c.innerText.includes("PROG-1-LA"))`);
await click(`[...document.querySelectorAll("[data-testid=card]")]
    .find(c => c.innerText.includes("PROG-1-LA"))`);
await wait(1500);
check(await evaluate(`return location.pathname === "/activities/PROG-1-LA";`),
    "an activity with a participant page opens on that page");
check(/Witamy na zaj/i.test(await body()),
    "and the page is the document its organiser wrote");
const links = await navLinks();
// Above Zadania, not first in the sidebar: the application's own entries come
// before the activity's block.
check(links.indexOf("Strona aktywności") >= 0
    && links.indexOf("Strona aktywności") < links.indexOf("Zadania"),
    "the entry to it sits above Zadania");
check(links.includes("Regulamin"),
    "and the rules are offered because a rules document exists");
await shot("act-home");

// 2 — an activity with no participant page goes straight to the problems.
await visit("/activities", `document.body.innerText.includes("AMMPZ-2019")`);
await click(`[...document.querySelectorAll("[data-testid=card]")]
    .find(c => c.innerText.includes("AMMPZ-2019"))`);
await wait(1500);
check(await evaluate(`return location.pathname === "/activities/AMMPZ-2019/problems";`),
    "an activity with none goes straight to its problems");
check(!(await navLinks()).includes("Strona aktywności"),
    "and offers no entry to a page that does not exist");
check((await navLinks()).includes("Regulamin"),
    "its rules are still offered, from the reference");

// 3 — the rules read from the reference, not from a module flag.
await visit("/activities/AMMPZ-2019/rules", `document.body.innerText.includes("Regulamin")`);
check(/Zawody trwają pięć godzin/.test(await body()),
    "the rules page draws what was published");

// 4 — an unlisted activity is in nobody's list until they are in it.
await visit("/activities", `document.body.innerText.includes("AMMPZ-2019")`);
const listed = await evaluate(`
    return [...document.querySelectorAll("[data-testid=card]")].map(c => c.innerText).join(" | ");
`);
check(!listed.includes("PROG-1-LB"),
    "an unlisted activity is absent from the list of somebody not in it");
check(listed.includes("TRENING-OTWARTY"),
    "while an open one that is listed is there to be joined");

// 5 — the link out of an email: the address, with the password in the fragment.
await visit("/activities/PROG-1-LB", `document.body.innerText.includes("Zapisz si")`);
check(/Programowanie 1 — grupa LB/.test(await body()),
    "the address of an unlisted activity still opens");
check(/Jeżeli jesteś w tej grupie/.test(await body()),
    "and shows the page written for people who are not in it");
check(!(await navLinks()).some(l => ["Zadania", "Wyślij", "Moje zgłoszenia"].includes(l)),
    "the sidebar offers no screens that would refuse");
check(await evaluate(`
    return document.querySelector("input[type=password]") !== null;
`), "a password is asked for, because that is how this one is joined");
check(/akceptuj|regulamin/i.test(await body()),
    "and the rules have to be accepted, because there are rules");
await shot("act-enrol");

// 6 — the wrong password is refused, and says so.
await click(`[...document.querySelectorAll("input[type=checkbox]")].at(-1)`);
await type("input[type=password]", "nie-to-haslo");
await click(`[...document.querySelectorAll("button")].find(b => b.textContent.trim() === "Zapisz się")`);
await wait(2000);
check(/nieprawidłow/i.test(await body()),
    "a wrong password is refused in words rather than silently");
check(await evaluate(`return document.querySelector("input[type=password]") !== null;`),
    "and the form is still there to try again");

// 7 — the right one puts them in, and the page becomes the participant's.
await type("input[type=password]", PASSWORD);
await click(`[...document.querySelectorAll("button")].find(b => b.textContent.trim() === "Zapisz się")`);
await wait(3000);
check(!/Zapisz się na tę aktywność/.test(await body()),
    "the right password enrols, and the form goes");
check(/Witamy na zaj/i.test(await body()),
    "and the page becomes the one written for participants");
const after = await navLinks();
check(after.includes("Zadania") && after.includes("Strona aktywności"),
    "the sidebar now offers the activity's screens");
await shot("act-enrolled");

// 8 — an activity anybody may join asks for no password.
await visit("/activities/TRENING-OTWARTY", `document.body.innerText.includes("Zapisz si")`);
check(await evaluate(`return document.querySelector("input[type=password]") === null;`),
    "an open activity asks for no password");
check(/Trening otwarty/.test(await body()),
    "and still shows what it wrote for outsiders");
await click(`[...document.querySelectorAll("button")].find(b => b.textContent.trim() === "Zapisz się")`);
await wait(3000);
check(await evaluate(`return location.pathname === "/activities/TRENING-OTWARTY/problems";`),
    "enrolling in one with no participant page lands on its problems");

// 9 — a closed activity offers no form at all.
await visit("/activities/WARSZTAT-9", `document.body.innerText.length > 0`);
check(/zapisuje organizator/i.test(await body()),
    "a closed activity says the organiser enrols, and offers no form");
check(await evaluate(`
    return [...document.querySelectorAll("button")].every(b => b.textContent.trim() !== "Zapisz się");
`), "there is nothing to press");

// 10 — the statement still renders, in both languages, through the file store.
// Waited on the statement itself, not on the title: the screen fetches the
// activity, the problem and the rounds before it asks for the text.
await visit("/activities/AMMPZ-2019/problems/A",
    `/Dany jest graf|spójny/i.test(document.body.innerText)`);
check(/Dany jest graf|spójny/i.test(await body()),
    "a problem statement still renders, fetched by reference");
await click(`[...document.querySelectorAll("[data-testid=segmented] label")]
    .find(l => /Angielski|English/i.test(l.textContent))`);
await wait(2500);
check(/graph|connected/i.test(await body()),
    "and switching the language fetches the other one");
await shot("act-statement");

report();
close();
