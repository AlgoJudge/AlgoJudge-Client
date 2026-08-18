// The link a manager copies, under each of the three policies.
import { open, results } from "./harness.mjs";

const APP = process.env.APP ?? "http://localhost:5180";
const { evaluate, wait, shot, go, click, tab, close } = await open();
const { check, report } = results();

/** The one monospace line holding an address, whatever else is on the card. */
const shownLink = () => evaluate(`
    const marker = [...document.querySelectorAll("*")]
        .find(e => e.children.length === 0 && /\\/activities\\//.test(e.textContent));
    return marker ? marker.textContent.trim() : null;
`);
const heading = () => evaluate(`
    return /Link do samodzielnego zapisu|Link do aktywności|Link pojawi/.exec(document.body.innerText)?.[0] ?? null;
`);
const choosePolicy = async (label) => {
    await click(`[...document.querySelectorAll("input")]
        .find(i => i.closest("[class*=InputWrapper-root]")?.textContent.includes("Kto może dołączyć"))`);
    await wait(600);
    await click(`[...document.querySelectorAll("[role=option]")]
        .find(o => o.textContent.includes(${JSON.stringify(label)}))`);
    await wait(900);
};

// The course joined with a password: the link carries it in the fragment.
await go(`${APP}/manager/activities?fakeUser=john`,
    `[...document.querySelectorAll("tbody tr")].some(r => r.innerText.includes("PROG-1-LA"))`);
await click(`[...document.querySelectorAll("tbody tr")]
    .find(r => r.innerText.includes("PROG-1-LA"))?.querySelector("td")`);
await wait(2500);
await click(tab("Ustawienia"));
await wait(900);

check(await heading() === "Link do samodzielnego zapisu",
    "a password-joined activity offers the self-enrolment link");
check(/\/activities\/PROG-1-LA#PROG1-LA$/.test(await shownLink() ?? ""),
    "with the password in the fragment");

// Switched to open: the link stays, without the fragment.
await choosePolicy("Otwarta");
check(await heading() === "Link do aktywności",
    "an open activity offers the link too, named for what it is");
const open_ = await shownLink();
check(/\/activities\/PROG-1-LA$/.test(open_ ?? ""),
    `and it carries no fragment, because there is no password (${open_})`);
check(await evaluate(`
    return [...document.querySelectorAll("label, [class*=InputWrapper-label]")]
        .every(l => !l.textContent.includes("Hasło zapisu"));
`), "and the password field is gone with the policy that needed it");
await shot("share-open");

// Closed: nobody to give a link to.
await choosePolicy("Zamknięta");
check(await heading() === null,
    "a closed activity offers none: nobody enrols themselves");
await shot("share-closed");

report();
close();
