// Carrying one account's work onto another, and the screen that guards it.
//
// **The preview is the guard, so most of this is about the preview.** A merge is
// a manager asserting that two accounts are one person; the Server cannot check
// that, and nothing else can either. What the product offers instead is a
// statement of whose work, how much, and onto whom — before anything moves.
//
// **What this cannot show, and the Server tests do.** The fake blocks the
// emptied account and records the merge; it does not move submissions, because
// it keeps one copy of a submission rather than a per-account ledger to move it
// through. Whether the work actually lands on the target is asserted there, over
// a real database, in `AccountMergeTests`.
import { open, results } from "./harness.mjs";

const APP = process.env.APP ?? "http://localhost:5180";
const { evaluate, wait, shot, go, click, close } = await open();
const { check, report } = results();

const body = () => evaluate(`return document.body.innerText;`);

/**
 * The dialog's own text, and nothing behind it.
 *
 * **Reading `document.body` was wrong and passed anyway.** The word "Zgłoszenia"
 * is in the dialog's own opening sentence and the target's name is in the table
 * underneath, so two checks matched text that had nothing to do with what they
 * claimed to measure — proved by blanking the preview and watching them stay
 * green. An input's value is not in `innerText`, so the chosen target does not
 * leak in through the select either.
 */
const dialog = () => evaluate(`
    const modal = document.querySelector("[data-testid=modal]");
    return modal ? modal.innerText : "";
`);

const USER_LIST = `[...document.querySelectorAll("tbody tr")].length > 0`;
await go(`${APP}/manager/users?fakeUser=john`, USER_LIST);
await wait(1500);

/** One row of the user table, by whatever text identifies it. */
const row = (text) => `[...document.querySelectorAll("tbody tr")]
    .find(r => r.innerText.includes(${JSON.stringify(text)}))`;

/** The row of somebody the seed made temporary, which is the case §11 is for. */
const temporary = await evaluate(`
    const rows = [...document.querySelectorAll("tbody tr")];
    const found = rows.find(r => /tymczasow/i.test(r.innerText));
    return found ? found.innerText.split("\\n")[0] : null;
`);
check(temporary !== null, `the seed offers a temporary account (${temporary})`);

// ── 1. The dialog opens on the account it was asked about ───────────────────

await click(`(${row(temporary)})
    ?.querySelectorAll("button")[(${row(temporary)}).querySelectorAll("button").length - 2]`);
await wait(1200);

const opened = await body();
check(/Przenieś dorobek tego konta/i.test(opened),
    "the dialog names what it is about to do");

// ── 2. Nothing is offered until a target is chosen ──────────────────────────
//
// The button is the last thing in the sequence rather than the first, because a
// merge with no preview behind it is the mistake this screen exists to stop.

const beforeChoosing = await evaluate(`
    const button = [...document.querySelectorAll("[data-testid=modal] button")]
        .find(b => b.textContent.trim() === "Przenieś dorobek");
    return button ? String(button.disabled) : "no button";
`);
check(beforeChoosing === "true",
    `the merge button is not offered before a target is chosen (${beforeChoosing})`);

// ── 3. Choosing one states what would move, and onto whom ───────────────────

await click(`[...document.querySelectorAll("[data-testid=modal] input")]
    .find(i => i.closest("[class*=InputWrapper-root]")?.textContent.includes("Przenieś na"))`);
await wait(700);
const target = await evaluate(`
    const option = [...document.querySelectorAll("[data-testid=combobox-option], [role=option]")][0];
    if (!option) return null;
    const label = option.textContent.trim();
    option.click();
    return label;
`);
check(target !== null, `a target can be chosen (${target})`);
await wait(1500);

const preview = await dialog();
// Counted, not merely mentioned: the words alone are in the sentence above.
check(/Zgłoszenia:\s*\d/i.test(preview) && /Aktywności:\s*\d/i.test(preview),
    `the preview counts what would move (${(/Zgłoszenia:[^\n]*/i.exec(preview) ?? ["—"])[0]})`);
check(preview.includes(temporary),
    "and names the account being emptied, which nothing else in the dialog does");
check(target !== null && preview.includes(target.split(" (")[0]),
    "and the account it would move onto");
await shot("merge-preview");

// ── 4. Only then is the merge offered ───────────────────────────────────────

const afterChoosing = await evaluate(`
    const button = [...document.querySelectorAll("[data-testid=modal] button")]
        .find(b => b.textContent.trim() === "Przenieś dorobek");
    return button ? String(button.disabled) : "no button";
`);
check(afterChoosing === "false",
    `the merge is offered once the preview is on screen (${afterChoosing})`);

// ── 5. Merging blocks the account it emptied ────────────────────────────────
//
// The one effect the fake does carry, and the one a manager sees immediately:
// the account stops working the moment its work leaves.

await click(`[...document.querySelectorAll("[data-testid=modal] button")]
    .find(b => b.textContent.trim() === "Przenieś dorobek")`);
await wait(2500);

const after = await evaluate(`
    const found = [...document.querySelectorAll("tbody tr")]
        .find(r => r.innerText.includes(${JSON.stringify(temporary)}));
    return found ? found.innerText : "gone from the list";
`);
check(/zablokowan/i.test(after) || after === "gone from the list",
    `the emptied account is blocked or filtered out of the list (${after.split("\n")[0]})`);
await shot("merge-done");

report();
close();
