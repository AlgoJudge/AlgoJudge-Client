// Two questions asked of a series that is not running: what a direct link shows,
// and what may still be sent.
import { open, results } from "./harness.mjs";

const APP = process.env.APP ?? "http://localhost:5180";
const { evaluate, wait, shot, go, visit, click, tab, close } = await open();
const { check, report } = results();

const body = () => evaluate(`return document.body.innerText;`);
const MANAGER_LIST = `[...document.querySelectorAll("tbody tr")].some(r => r.innerText.includes("AMMPZ-2019"))`;
/**
 * The Submit button of one **row**, not of the series card wrapping it: the
 * outer card contains every row's text, so the first match is always the round.
 */
const rowButton = (slug) => evaluate(`
    const row = [...document.querySelectorAll("[class*=Card-root]")]
        .filter(c => c.innerText.trim().startsWith("[${slug}]"))
        .at(-1);
    const button = [...(row?.querySelectorAll("button, a") ?? [])]
        .find(b => /Wyślij/.test(b.textContent));
    if (!button) return null;
    return {
        tag: button.tagName,
        disabled: button.disabled === true || button.getAttribute("data-disabled") === "true",
    };
`);

/**
 * The Submit control of the page, not the sidebar entry of the same name: the
 * navigation carries "Wyślij zgłoszenie" too, and it comes first in the document.
 */
const pageSubmit = () => evaluate(`
    const main = document.querySelector("[class*=AppShell-main]") ?? document.body;
    const button = [...main.querySelectorAll("button, a")].find(b => /Wyślij/.test(b.textContent));
    if (!button) return null;
    return { disabled: button.disabled === true || button.getAttribute("data-disabled") === "true" };
`);

// ── A round that has ended ──────────────────────────────────────────────────
// Readable for ever, accepting nothing: a competitor goes back to what they
// were solving.
await go(`${APP}/activities/AMMPZ-2019/problems?fakeUser=amy`, `document.body.innerText.includes("Runda 0")`);
await wait(1200);
check(/Rozgrzewka/.test(await body()),
    "an ended round still lists its problems");
const ended = await rowButton("R");
check(ended !== null && ended.disabled,
    `and its Submit button is disabled (${JSON.stringify(ended)})`);
const running = await rowButton("A");
check(running !== null && !running.disabled,
    `while the running round's is not (${JSON.stringify(running)})`);
await shot("closed-list");

await visit("/activities/AMMPZ-2019/problems/R", `document.body.innerText.length > 0`);
await wait(2000);
check(/Rozgrzewka/.test(await body()),
    "the statement of an ended problem opens from its own address");
check((await pageSubmit())?.disabled === true,
    "and the Submit button on the problem screen is shut too");
check(/zakończyła/i.test(await body()), "which says why");
await shot("closed-problem-ended");

await visit("/activities/AMMPZ-2019/problems/A", `/spójność/i.test(document.body.innerText)`);
await wait(1500);
check((await pageSubmit())?.disabled === false,
    "while a running round's problem screen still offers it");

await visit("/activities/AMMPZ-2019/submit/R", `document.body.innerText.length > 0`);
await wait(2000);
check(/zakończyła/.test(await body()),
    "the submit form says the series has ended");
check(await evaluate(`
    const send = [...document.querySelectorAll("button")].find(b => /Wyślij/.test(b.textContent));
    return send ? send.disabled : false;
`), "and refuses to send");
await shot("closed-ended-submit");

// ── A round paused with the statements taken away ───────────────────────────
await go(`${APP}/manager/activities?fakeUser=john`, MANAGER_LIST);
await click(`[...document.querySelectorAll("tbody tr")]
    .find(r => r.innerText.includes("AMMPZ-2019"))?.querySelector("td")`);
await wait(2500);
// By name: the manager's series list is its own, and an index into it is not
// the round this scenario means.
await click(`[...document.querySelectorAll("[class*=Accordion-item]")]
    .find(item => item.innerText.includes("Runda 1"))
    ?.querySelector("button:not([class*=Accordion-control])")`);
await wait(1500);
// This time, take the statements away as well.
await evaluate(`
    const modal = document.querySelector("[class*=Modal-content]");
    const box = [...modal.querySelectorAll("input[type=checkbox]")].at(-1);
    box.click();
    return true;
`);
await wait(600);
check(await evaluate(`
    const modal = document.querySelector("[class*=Modal-content]");
    return [...modal.querySelectorAll("input[type=checkbox]")].at(-1).checked;
`), "the manager chooses to take the statements away as well");
await click(`[...document.querySelectorAll("[class*=Modal-content] button")].find(b => b.textContent.trim() === "Wstrzymaj")`);
await wait(3000);

await visit("/activities/AMMPZ-2019/problems", `document.body.innerText.includes("Runda 1")`);
await wait(1500);
check(!/sp[óo]jno[śs][ćc]/i.test(await body()),
    "the statements are gone from the list");
check(/wstrzymana/i.test(await body()),
    "and it says the series is paused rather than that it has not started");
await shot("closed-hidden");

// The address of a problem is guessable and gets shared.
await visit("/activities/AMMPZ-2019/problems/A", `document.body.innerText.length > 0`);
await wait(2500);
check(!/Dany jest graf|spójny/i.test(await body()),
    "the statement does not open from its own address either");
const hidden = await pageSubmit();
check(hidden === null || hidden.disabled,
    "and offers nothing to press on the way out");
await shot("closed-hidden-direct");

await visit("/activities/AMMPZ-2019/submit/A", `document.body.innerText.length > 0`);
await wait(2500);
// Scoped to the form. The submissions panel in the corner now carries a send
// button of its own — a different control, which opens a picker that offers no
// problem from a round that accepts nothing.
check(await evaluate(`
    const main = document.querySelector("[class*=AppShell-main]");
    const send = [...(main?.querySelectorAll("button") ?? [])].find(b => /Wyślij/.test(b.textContent));
    return send === undefined || send.disabled;
`), "and nothing can be sent to it");

// Put it back, so the next run starts where this one did.
await visit("/manager/activities", MANAGER_LIST);
await click(`[...document.querySelectorAll("tbody tr")]
    .find(r => r.innerText.includes("AMMPZ-2019"))?.querySelector("td")`);
await wait(2500);
await click(`[...document.querySelectorAll("button")].find(b => b.textContent.trim() === "Wznów")`);
await wait(1500);
await click(`[...document.querySelectorAll("[class*=Modal-content] button")].find(b => b.textContent.trim() === "Wznów")`);
await wait(2500);

await visit("/activities/AMMPZ-2019/problems", `document.body.innerText.includes("Runda 1")`);
await wait(1500);
check(/sp[óo]jno[śs][ćc]/i.test(await body()),
    "resuming brings the statements back");

report();
close();
