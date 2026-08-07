// The link a lecturer mails to a class: opened by somebody who is not signed in,
// it has to survive the sign-in screen with its password intact.
import { open, results } from "./cdp.mjs";

const APP = process.env.APP ?? "http://localhost:5180";
const { evaluate, wait, shot, go, click, type, close } = await open({ out: process.env.OUT ?? "." });
const { check, report } = results();

const body = () => evaluate(`return document.body.innerText;`);

// Signed out, and arriving at an activity nothing links to.
await go(`${APP}/`, `document.body !== null`);
await evaluate(`localStorage.clear(); sessionStorage.clear(); return true;`);
await go(`${APP}/activities/PROG-1-LB#PROG1-LA`, `document.body.innerText.length > 0`);

check(await evaluate(`return location.pathname === "/login";`),
    "somebody signed out is asked to sign in first");
check(/logowanie|zaloguj/i.test(await body()),
    "and gets the sign-in screen rather than an error");
await shot("link-login");

// Mantine's TextInput has no type attribute, so it is found by not being the
// password one.
await evaluate(`
    const fields = [...document.querySelectorAll("input")];
    const login = fields.find(f => f.type !== "password");
    const password = fields.find(f => f.type === "password");
    const set = (field, value) => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(field, value);
        field.dispatchEvent(new Event("input", { bubbles: true }));
    };
    set(login, "amy");
    set(password, "Test1!");
    return true;
`);
await wait(400);
await click(`[...document.querySelectorAll("button")].find(b => /zaloguj/i.test(b.textContent))`);
await wait(3500);

check(await evaluate(`return location.pathname === "/activities/PROG-1-LB";`),
    "signing in returns to the activity the link named");
check(await evaluate(`
    const field = document.querySelector("input[type=password]");
    return field ? field.value : "";
`) === "PROG1-LA", "with the password from the fragment already filled in");
check(await evaluate(`return location.hash === "";`),
    "and the fragment is cleared, so it does not sit in the address bar");
await shot("link-arrived");

// And it still works: accepting and pressing enrol puts them in.
await click(`[...document.querySelectorAll("input[type=checkbox]")].at(-1)`);
await click(`[...document.querySelectorAll("button")].find(b => b.textContent.trim() === "Zapisz się")`);
await wait(3500);
check(!/Zapisz się na tę aktywność/.test(await body()),
    "the password that came in the link is the one that enrols them");

report();
close();
