// Copying a round, and being told what a copy is.
//
// **A copy is a shape, not a history**, and until 2026-08-25 the product said
// so in one place out of three: the activity list explained it, the problem
// library duplicated from a bare icon with no sentence anywhere, and a round
// could not be copied at all. One dialog now states it for all three.
//
// **The rule this script is really about** is the one nothing else would catch:
// an assignment slug is unique across an *activity*, not across a round, so a
// round copied in place collides on every problem it holds. `Runda 3` of
// `AMMPZ-2019` holds exactly two — `H` and `I` — which makes the freed slugs
// deterministic rather than "something ending in a digit".
//
// **From the copy onwards it is `visit`, never `go`.** The fake keeps a
// manager's writes in memory, so a full page load would throw the new round away
// and the checks after one would measure the seed again and pass for the wrong
// reason.
import { open, results } from "./harness.mjs";

const APP = process.env.APP ?? "http://localhost:5180";
const { evaluate, wait, shot, go, click, tab, close } = await open();
const { check, report } = results();

const body = () => evaluate(`return document.body.innerText;`);

/** The dialog's own text. Reading `document.body` reads the page behind it. */
const modal = () => evaluate(`
    return document.querySelector("[data-testid=modal]")?.innerText ?? "";
`);

const modalButton = (text) => `[...document.querySelectorAll("[data-testid=modal] button")]
    .find(b => b.textContent.trim() === ${JSON.stringify(text)})`;

/** A field inside the dialog, found by its label — Mantine gives it no id. */
const modalField = (label) => `[...document.querySelectorAll("[data-testid=modal] [class*=InputWrapper-root]")]
    .find(w => w.textContent.includes(${JSON.stringify(label)}))`;

const roundBlock = (name) => `[...document.querySelectorAll("[data-testid=accordion-item]")]
    .find(i => i.innerText.startsWith(${JSON.stringify(name)}))`;

/**
 * Fills one of the dialog's fields.
 *
 * The harness's own `type` takes a CSS selector and these fields are found by
 * their label, which is an expression — Mantine gives an input no id, and the
 * dialog holds three of them.
 */
const fill = async (label, value) => {
    await evaluate(`
        const input = (${modalField(label)})?.querySelector("input");
        if (!input) throw new Error("no such field: " + ${JSON.stringify(label)});
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")
            .set.call(input, ${JSON.stringify(value)});
        input.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
    `);
    await wait(400);
};

// ── 1. The library says what a duplicate costs ──────────────────────────────
//
// It said nothing at all: an icon, a tooltip reading "Duplikuj", and a problem
// appeared. What a copy does not carry — the version history, the visibility,
// the attachments — was discoverable only by doing it.

await go(`${APP}/manager/problems?fakeUser=john`,
    `document.querySelectorAll("tbody tr").length > 0`);
await wait(1500);

await click(`document.querySelector("tbody tr [aria-label='Duplikuj']")`);
await wait(1200);

const library = await modal();
check(/najnowsz/i.test(library),
    `the dialog says only the newest version travels (${library.slice(0, 60)}…)`);
check(/prywatn/i.test(library),
    "and that the copy arrives private, whatever the original was");
check(/Historia nie wędruje/i.test(library),
    "and why the history does not travel");
await shot("copy-problem");

await click(modalButton("Wróć"));
await wait(800);

// ── 2. A round can be copied, and the dialog asks the two things it cannot
//      infer: where it goes, and when it starts ────────────────────────────

await go(`${APP}/manager/activities?fakeUser=john`,
    `[...document.querySelectorAll("tbody tr")].some(r => r.innerText.includes("AMMPZ-2019"))`);
await click(`[...document.querySelectorAll("tbody tr")]
    .find(r => r.innerText.includes("AMMPZ-2019"))?.querySelector("td")`);
await wait(2500);

await click(tab("Serie"));
await wait(2000);

/**
 * Opens a round's panel, and only if it is shut.
 *
 * **A toggle is not "open".** Mantine keeps every panel mounted, so the rows
 * inside a collapsed one are still in `document` and read back correctly — but a
 * button in it has no box, and a click on it lands at a meaningless coordinate
 * without failing. Clicking the control blindly closed the panel this script
 * needed and every later check measured a page nothing had happened on.
 */
const openRound = async (name) => {
    const shut = await evaluate(`
        const control = (${roundBlock(name)})?.querySelector("[data-testid=accordion-control]");
        return control ? control.getAttribute("aria-expanded") !== "true" : "no such round";
    `);
    if (shut === "no such round") throw new Error(`no such round: ${name}`);
    if (shut) {
        await click(`(${roundBlock(name)})?.querySelector("[data-testid=accordion-control]")`);
        await wait(1200);
    }
};

await openRound("Runda 3");

/**
 * The assignment slugs of one round, from its table.
 *
 * **The second cell, not the first line of the row.** The first cell holds the
 * two reordering buttons and reads as empty — which is what the first version
 * of this script collected, twice, and then compared two empty strings against
 * each other and reported the slugs freed. Hence the emptiness assertions
 * below: a reader that finds nothing must not pass for finding two of them.
 */
const slugsOf = (name) => evaluate(`
    const block = ${roundBlock(name)};
    return [...(block?.querySelectorAll("tbody tr") ?? [])]
        .map(r => r.querySelectorAll("td")[1]?.innerText.trim() ?? "");
`);

const before = await slugsOf("Runda 3");
check(Array.isArray(before) && before.length === 2 && before.every(s => s.length > 0),
    `the round being copied holds two problems (${JSON.stringify(before)})`);

await click(`(${roundBlock("Runda 3")})?.querySelector("[aria-label='Skopiuj tę rundę']")`);
await wait(1500);

const asked = await modal();
check(/Do której aktywności trafia/.test(asked),
    "the dialog asks which activity the copy goes into");
check(/Kiedy zaczyna się kopia/.test(asked),
    "and when it starts — the one thing a copy cannot infer");
check(/nie zawiera niczyjej pracy/i.test(asked),
    "and says the copy holds nobody's work");
check(/wskazuje na te same/i.test(asked),
    "and that the problems are referenced rather than duplicated");

// **The confirmation is refused until both are answered.** A copy made with an
// empty name is refused by the Server; a copy made with no date would sit on
// last term's, which is the failure the field exists to prevent.
const shut = await evaluate(`return (${modalButton("Skopiuj")})?.disabled ?? "gone";`);
check(shut === true, `the copy is not offered until the dialog is answered (${shut})`);
await shot("copy-series-asked");

// ── 3. Copying in place frees the assignment slugs ──────────────────────────

await fill("Własna nazwa", "runda-3-druga");
await fill("Kiedy zaczyna się kopia", "2027-05-04T09:00");
await wait(500);

const open_ = await evaluate(`return (${modalButton("Skopiuj")})?.disabled ?? "gone";`);
check(open_ === false, `and is offered once it is (${open_})`);

await click(modalButton("Skopiuj"));
await wait(3000);

const listed = await body();
check(/runda-3-druga/.test(listed), "the copy is in the round list");
await shot("copy-series-made");

const copied = await evaluate(`
    const block = [...document.querySelectorAll("[data-testid=accordion-item]")]
        .find(i => i.innerText.includes("runda-3-druga"));
    return block ? null : "no such round";
`);
check(copied === null, `the copy has a block of its own (${copied ?? "found"})`);
await wait(800);

const slugs = await evaluate(`
    const block = [...document.querySelectorAll("[data-testid=accordion-item]")]
        .find(i => i.innerText.includes("runda-3-druga"));
    return [...(block?.querySelectorAll("tbody tr") ?? [])]
        .map(r => r.querySelectorAll("td")[1]?.innerText.trim() ?? "");
`);

// **H and I are taken by the round this was copied from**, in the same
// activity, and the unique index is per activity. Without the freeing the whole
// copy is refused by the database — so this is the check that decides whether
// copying a round in place works at all.
check(Array.isArray(slugs) && slugs.length === 2 && slugs.every(s => s.length > 0),
    `the copy carries both problems (${JSON.stringify(slugs)})`);
check(Array.isArray(slugs) && slugs.every(s => /-2$/.test(s)),
    `and each has been given a free slug (${JSON.stringify(slugs)})`);
check(Array.isArray(slugs) && Array.isArray(before)
    && slugs.every(s => !before.includes(s)),
    "none of which is one the original round already holds");
await shot("copy-series-slugs");

report();
await close();
