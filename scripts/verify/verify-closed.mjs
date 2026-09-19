// Two questions asked of a series that is not running: what a direct link shows,
// and what may still be sent.
import { open, results } from "./harness.mjs";

const APP = process.env.APP ?? "http://localhost:5180";
const { evaluate, wait, shot, go, visit, click, managerRow, tab, close } = await open();
const { check, report } = results();

const body = () => evaluate(`return document.body.innerText;`);
const MANAGER_LIST = `[...document.querySelectorAll("tbody tr")].some(r => r.innerText.includes("AMMPZ-2019"))`;

const SUBMISSION_ROWS = `document.querySelectorAll("[data-testid=submission-row], tbody tr").length > 0`;
/**
 * A row of the submissions screen, picked by which round it belongs to.
 *
 * **By problem slug, because that is what says which round.** `A`–`D` are Runda
 * 1's, `R` and `S` are Runda 0's; an index into the list would be whichever the
 * ordering happened to put first, and the two rounds are interleaved in it.
 */
const rowOf = (slugs) => `[...document.querySelectorAll("[data-testid=submission-row], tbody tr")]
    .find(r => /\\[(${slugs})\\]/.test(r.innerText))`;
const PAUSED_ROUND_ROW = rowOf("A|B|C|D");
const ENDED_ROUND_ROW = rowOf("R|S");
/**
 * The Submit button of one **row**, not of the series card wrapping it: the
 * outer card contains every row's text, so the first match is always the round.
 */
const rowButton = (slug) => evaluate(`
    const row = [...document.querySelectorAll("[data-testid=card]")]
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
    const main = document.querySelector("[data-testid=app-main]") ?? document.body;
    const button = [...main.querySelectorAll("button, a")].find(b => /Wyślij/.test(b.textContent));
    if (!button) return null;
    return { disabled: button.disabled === true || button.getAttribute("data-disabled") === "true" };
`);

// ── A round that has ended ──────────────────────────────────────────────────
// Readable forever, accepting nothing: a competitor goes back to what they
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

// **The screen's own picker, which is the way in the sidebar offers.** It drew a
// button per problem of every round it thought open until 2026-09-10, and is the
// same control the panel's window uses now — so what may be sent is stated once,
// the Server's way, rather than twice.
await visit("/activities/AMMPZ-2019/submit", `document.body.innerText.length > 0`);
await wait(2000);
await click(`document.querySelector("[data-testid=app-main] [data-testid=problem-choice]")`);
await wait(900);
const offered = await evaluate(`
    return [...document.querySelectorAll("[data-testid=combobox-option], [role=option]")]
        .map(o => o.textContent.trim());
`);
check(offered.some(o => /\[A\]/.test(o)),
    `the picker offers a running round's problems (${offered.join(" | ")})`);
check(!offered.some(o => /\[R\]|\[S\]/.test(o)),
    "and none from the round that has ended");
await shot("closed-picker");

// ── A round paused with the statements taken away ───────────────────────────
await go(`${APP}/manager/activities?fakeUser=john`, MANAGER_LIST);
await click(managerRow("AMMPZ-2019"));
await wait(2500);
// By name: the manager's series list is its own, and an index into it is not
// the round this scenario means.
await click(`[...document.querySelectorAll("[data-testid=accordion-item]")]
    .find(item => item.innerText.includes("Runda 1"))
    ?.querySelector("button:not([data-testid=accordion-control])")`);
await wait(1500);
// This time, take the statements away as well.
await evaluate(`
    const modal = document.querySelector("[data-testid=modal]");
    const box = [...modal.querySelectorAll("input[type=checkbox]")].at(-1);
    box.click();
    return true;
`);
await wait(600);
check(await evaluate(`
    const modal = document.querySelector("[data-testid=modal]");
    return [...modal.querySelectorAll("input[type=checkbox]")].at(-1).checked;
`), "the manager chooses to take the statements away as well");
await click(`[...document.querySelectorAll("[data-testid=modal] button")].find(b => b.textContent.trim() === "Wstrzymaj")`);
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
    const main = document.querySelector("[data-testid=app-main]");
    const send = [...(main?.querySelectorAll("button") ?? [])].find(b => /Wyślij/.test(b.textContent));
    return send === undefined || send.disabled;
`), "and nothing can be sent to it");

// ── And what was written for that round ─────────────────────────────────────
// The statement is gone; the code written against it is the same reading, one
// door along. **The row stays** — a participant is not told their work has
// vanished, only that they cannot open it — and the ended round beside it keeps
// its own source, which is what shows the rule is the round's and not the
// activity's.
//
// **`visit`, never `go`, from the pause on.** The fake's world is in
// memory: a reload rebuilds it and the round is running again, so a `go` here
// asserts the unpaused product. Which also means this stays signed in as the
// manager — the fake's participant surface answers as a participant whoever is
// signed in, so what is asserted here is the participant rule. The staff
// exemption is a Server rule and is pinned in `FileAccessTests`.
await visit("/activities/AMMPZ-2019/submissions", SUBMISSION_ROWS);
await wait(1500);

check(await evaluate(`return ${PAUSED_ROUND_ROW} !== undefined;`),
    "a submission made in the paused round is still listed");
await click(PAUSED_ROUND_ROW);
await wait(2500);
check(await evaluate(`return document.querySelector("[data-testid=show-code]") === null;`),
    "and it offers no way to read its source");
await shot("closed-hidden-source");

await visit("/activities/AMMPZ-2019/submissions", SUBMISSION_ROWS);
await wait(1500);
await click(ENDED_ROUND_ROW);
await wait(2500);
check(await evaluate(`return document.querySelector("[data-testid=show-code]") !== null;`),
    "while the ended round's own source is untouched");

// Put it back, so the next run starts where this one did.
await visit("/manager/activities", MANAGER_LIST);
await click(managerRow("AMMPZ-2019"));
await wait(2500);
await click(`[...document.querySelectorAll("button")].find(b => b.textContent.trim() === "Wznów")`);
await wait(1500);
await click(`[...document.querySelectorAll("[data-testid=modal] button")].find(b => b.textContent.trim() === "Wznów")`);
await wait(2500);

await visit("/activities/AMMPZ-2019/problems", `document.body.innerText.includes("Runda 1")`);
await wait(1500);
check(/sp[óo]jno[śs][ćc]/i.test(await body()),
    "resuming brings the statements back");

// **And the source with them.** Without this the two assertions above would
// pass against a build where the button is simply never drawn.
await visit("/activities/AMMPZ-2019/submissions", SUBMISSION_ROWS);
await wait(1500);
await click(PAUSED_ROUND_ROW);
await wait(2500);
check(await evaluate(`return document.querySelector("[data-testid=show-code]") !== null;`),
    "and the source of what was written for it");
await shot("closed-resumed-source");

report();
close();
