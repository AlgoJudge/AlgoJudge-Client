// Filtering a list: that choosing narrows it, that clearing gives it back, and
// that two values compose rather than replace.
//
// **What this cannot establish, and it is the whole reason the defect it was
// written for survived.** `check:ui` runs with `VITE_APP_USE_FAKE_API`, so no
// request leaves the page: `ParticipantApiHttp` is never constructed, and the
// fake is called in-process with a typed filter object. The repeated keys, the
// empty-selection guard and every `[FromQuery]` binding in the Server are
// unreachable from here.
//
// On 2026-09-14 three filters on the participant's submissions screen had been
// dead against the real Server for months — the action bound `page` and
// `pageSize` and nothing else, so ASP.NET Core discarded the rest and answered
// 200 with the whole list. **The fake honored all three**, so the screen worked
// in every place anybody tested it. A browser check would have been green
// throughout, and one claiming otherwise would be worse than none.
//
// What guards the wire instead: `AlgoJudge-Workspace/scripts/check-query-params.py`
// compares what is sent against what is documented, the Server's own suite
// proves the query narrows, and `e2e/` drives a real stack.
//
// What this *can* prove is that the screen narrows at all — and nothing else
// does. No script in this suite had ever chosen a filter value and asserted the
// list changed; `verify-printouts.mjs` opens a dropdown and asserts its
// *options*, which is as close as the suite came.
import { open, results } from "./harness.mjs";

const APP = process.env.APP ?? "http://localhost:5180";
const { evaluate, until, wait, shot, go, visit, click, close } = await open();
const { check, report } = results();

const rows = `[...document.querySelectorAll("[data-testid=app-main] tbody tr")].length`;

/**
 * **Two races, and both read as "the filter matched nothing"** — which is also
 * what a broken filter looks like, so getting this wrong would be worse than not
 * checking. The screen blanks its list before refetching, so a count on a timer
 * catches either the old list, before the blank, or the empty window during it.
 *
 * The loader is the signal, and it is the screen's own: wait for it to appear,
 * then for it to go. Where it went by too fast to catch, the second wait still
 * holds until the list says something — rows, or the message that nothing
 * matched.
 */
const loading = `Boolean(document.querySelector("[data-testid=app-main] [class*=Loader-root]"))`;

const spoken = `${rows} > 0
    || [...document.querySelectorAll("[data-testid=app-main] *")]
        .some(e => e.children.length === 0 && /filtr|filter/i.test(e.textContent ?? ""))`;

const landed = async () => {
    await until(loading, 12);
    await until(`!(${loading}) && (${spoken})`, 40);
    await wait(250);
};

const count = async () => await evaluate(`return ${rows};`);

/** The wrapper a control lives in, as an expression. */
const field = (testid) =>
    `document.querySelector("input[data-testid=${testid}]")?.closest("[class*=InputWrapper-root]")`;

/** What a control currently holds, read off its pills. */
const chosen = async (testid) => await evaluate(`
    return [...(${field(testid)}?.querySelectorAll("[class*=Pill-root]") ?? [])]
        .map(p => p.textContent.trim()).filter(Boolean);
`);

/**
 * Every option a control offers.
 *
 * **Filtered by `offsetParent`.** Mantine hides a closed dropdown rather than
 * unmounting it, so every option on the screen is in the document whether or not
 * anybody can see it — an unfiltered `[role=option]` counts the neighboring
 * controls' options too.
 */
const optionsOf = async (testid) => {
    await click(`document.querySelector("input[data-testid=${testid}]")`);
    await wait(500);
    const offered = await evaluate(`
        return [...document.querySelectorAll("[role=option]")]
            .filter(o => o.offsetParent !== null)
            .map(o => o.textContent.trim());
    `);
    await evaluate(`document.querySelector("input[data-testid=${testid}]")?.blur(); return true;`);
    await wait(300);
    return offered;
};

/**
 * Put a control into exactly this selection, and prove it took.
 *
 * **Every phase starts from empty**, because a dropdown left open by the phase
 * before is a click landing somewhere nobody predicted. And the selection is
 * read back rather than assumed: a `MultiSelect` grows as pills are added, which
 * moves the options under the pointer, so a click that misses is not a
 * hypothetical — it was the first three drafts of this file.
 */
const selectOnly = async (testid, labels) => {
    // Only wait where something was actually cleared: a control that was already
    // empty starts no fetch, and waiting for a loader that will never appear is
    // six seconds of nothing, thirty times over.
    const cleared = await evaluate(`
        const input = document.querySelector("input[data-testid=${testid}]");
        const button = input?.closest("[class*=InputWrapper-root]")
            ?.querySelector("[class*=CloseButton-root], button[aria-label]");
        if (button) button.click();
        input?.blur();
        return Boolean(button);
    `);
    if (cleared) await landed();

    for (const label of labels) {
        for (let attempt = 0; attempt < 3; attempt++) {
            await click(`document.querySelector("input[data-testid=${testid}]")`);
            await wait(400);
            await click(`[...document.querySelectorAll("[role=option]")]
                .filter(o => o.offsetParent !== null)
                .find(o => o.textContent.trim() === ${JSON.stringify(label)})`);
            await landed();
            await evaluate(`document.querySelector("input[data-testid=${testid}]")?.blur(); return true;`);
            await wait(200);
            if ((await chosen(testid)).includes(label)) break;
        }
    }

    const held = await chosen(testid);
    return labels.every(label => held.includes(label)) && held.length === labels.length;
};

// ── The participant's own submissions ────────────────────────────────────────

await go(`${APP}/activities/AMMPZ-2019/submissions?fakeUser=amy`, `${rows} > 0`);
await landed();

const everything = await count();
check(everything > 0, `the list starts with rows on it (${everything})`);

const stateOptions = await optionsOf("submission-state");
check(stateOptions.length > 0, `the status filter offers ${stateOptions.length} option(s)`);

// **Discovered rather than assumed.** Which statuses this participant's rows
// happen to be in is not the subject here, and naming one would make the check
// fail the day somebody edits `world.ts` for an unrelated reason.
//
// One is all this fixture can carry: amy's eleven submissions in this activity
// are ten judged and one failed, so every other status is empty and `completed`
// fills the page on its own. **The multi-value assertions are on the manager's
// list below**, which holds five statuses across fifty-four rows. Measured
// rather than assumed — the first draft asserted two here and got them from a
// race, not from the data.
let narrows;
for (const label of stateOptions) {
    if (!await selectOnly("submission-state", [label])) continue;
    const narrowed = await count();
    if (narrowed > 0 && narrowed < everything) { narrows = { label, narrowed }; break; }
}

check(Boolean(narrows), `a status narrows the participant's list (${narrows?.label ?? "none did"})`);

if (narrows) {
    const alone = await count();
    check(alone === narrows.narrowed && alone < everything,
        `choosing "${narrows.label}" narrows ${everything} rows to ${alone}`);

    // **The other direction.** A control that narrows and never lets go passes a
    // one-way check and leaves a reader on a list they cannot widen.
    check(await selectOnly("submission-state", []), "the status filter can be cleared");
    const back = await count();
    check(back === everything, `clearing gives every row back (${back} of ${everything})`);
    await shot("filters-participant");
}

// ── Two controls intersect rather than overwrite ─────────────────────────────

const seriesOptions = await optionsOf("submission-series");
check(seriesOptions.length > 1, `the round filter offers ${seriesOptions.length} rounds`);

const rounds = [];
for (const label of seriesOptions) {
    if (!await selectOnly("submission-series", [label])) continue;
    const narrowed = await count();
    if (narrowed > 0) rounds.push({ label, narrowed });
    if (rounds.length === 2) break;
}

check(rounds.length === 2, `two rounds have submissions in them (${rounds.map(r => r.label).join(", ")})`);

if (rounds.length === 2) {
    check(await selectOnly("submission-series", rounds.map(r => r.label)), "both rounds can be held");
    const bothRounds = await count();
    // **Capped by the page**, which is why the sum is not asserted raw: eleven
    // matching rows still draw ten. `everything` is an unfiltered page, so it is
    // the page's ceiling where there is more than one page and the whole list
    // where there is not — correct in both, and it does not name `PAGE_SIZE`.
    // The exact sum is asserted on the manager's list below, where the numbers
    // are small enough to fit.
    const expected = Math.min(rounds[0].narrowed + rounds[1].narrowed, everything);
    check(bothRounds === expected,
        `both rounds together carry both (${rounds[0].narrowed} + ${rounds[1].narrowed}, `
        + `${everything} to a page, so ${bothRounds})`);

    if (narrows) {
        // A second control narrows what the first left rather than replacing it.
        check(await selectOnly("submission-state", [narrows.label]),
            "a status can be added on top of the rounds");
        const crossed = await count();
        check(crossed < bothRounds, `and it narrows them further (${crossed} of ${bothRounds})`);
        check((await chosen("submission-series")).length === 2,
            "while the rounds stay chosen — the second control did not replace the first");

        await selectOnly("submission-state", []);
    }

    // ── The pager counts what matched, not what was drawn ────────────────────
    //
    // The one assertion here that reaches past what is drawn to what was
    // counted, which is the shape of the defect fixed on 2026-09-08: `total`
    // counted rows the filter would have removed, so the pager offered pages
    // that were empty by construction.
    const pagesOffered = `[...document.querySelectorAll("[data-testid=app-main] button")]
        .filter(b => /^\\d+$/.test(b.textContent.trim())).length`;

    await selectOnly("submission-series", []);
    const before = await evaluate(`return ${pagesOffered};`);

    await selectOnly("submission-series", [rounds[0].label]);
    const after = await evaluate(`return ${pagesOffered};`);
    check(after <= before, `the pager follows the filter (${before} page(s), then ${after})`);
}

// ── The manager's list, driven through the address ───────────────────────────
//
// **No clicking here, deliberately.** This screen keeps its filters in the URL
// because it is what a manager sends somebody a link to, so driving it by
// address is driving it the way it is meant to be used — and it takes the
// dropdown out of the measurement entirely. `visit` rather than `go`: a reload
// rebuilds the fake's world from scratch.
//
// It also has the variety the participant's own list does not: five statuses
// across fifty-four rows, so two of them can be asked for and their answers
// added up.

const managed = async (query) => {
    await visit(`/manager/submissions${query}`, `${rows} >= 0`);
    await landed();
    return await count();
};

const everyRow = await managed("");
check(everyRow > 0, `the manager's list starts with rows on it (${everyRow})`);

const statuses = [];
for (const state of ["queued", "running", "failed", "canceled"]) {
    const narrowed = await managed(`?state=${state}`);
    if (narrowed > 0 && narrowed < everyRow) statuses.push({ state, narrowed });
    if (statuses.length === 2) break;
}

check(statuses.length === 2,
    `two statuses narrow the manager's list (${statuses.map(s => `${s.state}=${s.narrowed}`).join(", ")})`);

if (statuses.length === 2) {
    const [first, second] = statuses;
    const together = await managed(`?state=${first.state},${second.state}`);

    // **Two values answer with both.** A screen or a Server taking only the
    // first of what was asked for passes every assertion above and fails this
    // one. The fixture's statuses are disjoint, so the sum is exact.
    check(together === first.narrowed + second.narrowed,
        `and both together answer with both (${first.narrowed} + ${second.narrowed} = ${together})`);
    check(together > first.narrowed && together > second.narrowed,
        `which is strictly more than either alone (${together})`);

    // A word nothing is in narrows to nothing rather than to everything — the
    // rule the Server applies, mirrored by the fake so the two agree.
    const nonsense = await managed("?state=nonsense");
    check(nonsense === 0, `a status nothing is in shows nothing, not everything (${nonsense})`);

    const cleared = await managed("?state=");
    check(cleared === everyRow, `and a cleared status shows every row (${cleared} of ${everyRow})`);
}

// The three controls the specification asked for and the screen never drew.
await managed("");
const offered = await evaluate(`
    return ["submission-problem", "submission-user", "submission-verdict"].map(id => ({
        id,
        present: Boolean(document.querySelector(\`input[data-testid=\${id}]\`)),
        disabled: Boolean(document.querySelector(\`input[data-testid=\${id}]\`)?.disabled),
    }));
`);
check(offered.every(o => o.present),
    `the problem, participant and verdict filters are drawn (${offered.filter(o => o.present).length} of 3)`);

// **Disabled rather than hidden**, which is the house rule for a control that
// only means something inside one activity — and asserted rather than assumed,
// because a control that is merely absent looks the same to a reader.
check(offered.find(o => o.id === "submission-user")?.disabled === true,
    "the participant filter is disabled until an activity is named");
check(offered.find(o => o.id === "submission-problem")?.disabled === true,
    "and so is the problem filter");

const verdictRow = await evaluate(`
    const row = [...document.querySelectorAll("[data-testid=app-main] tbody tr")]
        .find(r => r.innerText.trim().length > 0);
    return row ? row.innerText : "";
`);
check(verdictRow.length > 0, "a row can be read for its verdict");

// ── The filter row survives its own list reloading ───────────────────────────
//
// Every manager list used to blank its items before refetching, and the guard
// underneath returned a full-screen spinner whenever they were falsy — so the
// filter row went with them. A manager typed one letter, the field was
// unmounted under their hands, and the second letter went nowhere.
//
// Asserted on **focus**, because that is what a person loses. A check that the
// input still exists would pass against a screen that destroyed and rebuilt it,
// which is exactly the behavior being fixed.

await visit("/manager/submissions", `${rows} >= 0`);
await landed();

const searchBox = `document.querySelector("[data-testid=app-main] input[placeholder]")`;
const typed = await evaluate(`
    const input = ${searchBox};
    if (!input) return null;
    input.focus();
    const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, "value").set;
    setter.call(input, "k");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
`);
check(Boolean(typed), "the manager's list offers a search box");

if (typed) {
    await landed();
    const held = await evaluate(`
        const input = ${searchBox};
        return Boolean(input) && document.activeElement === input;
    `);
    check(held, "and it keeps the focus while the list behind it reloads");

    // Put it back, so nothing after this reads a narrowed list.
    await evaluate(`
        const input = ${searchBox};
        const setter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype, "value").set;
        setter.call(input, "");
        input.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
    `);
    await landed();
}

// ── The activity list, as a set of names rather than a count ─────────────────
//
// `PAGE_SIZE` is 5 there and the fixture holds fourteen activities, so a count
// is confounded by paging. Two names, asserted in both directions, are not.

await visit("/activities", `document.querySelectorAll("[data-testid=card]").length > 0`);

const namesOn = `[...document.querySelectorAll("[data-testid=card]")].map(c => c.innerText).join(" | ")`;
const chips = await evaluate(`
    return [...document.querySelectorAll("[data-testid=chip-label]")].map(c => c.textContent.trim());
`);
check(chips.length >= 2, `the activity list offers ${chips.length} chips`);

// The type chips are the last two: the states come first. Taken from the end so
// that adding a state does not silently move this onto the wrong control.
const typeChips = chips.slice(-2);
const seen = [];
for (const chip of typeChips) {
    const label = `[...document.querySelectorAll("[data-testid=chip-label]")]
        .find(c => c.textContent.trim() === ${JSON.stringify(chip)})`;
    await click(label);
    await wait(1600);
    seen.push({ chip, text: await evaluate(`return ${namesOn};`) });
    await click(label);
    await wait(1400);
}

if (seen.length === 2) {
    const [one, other] = seen;
    check(one.text !== other.text, `"${one.chip}" and "${other.chip}" show different activities`);
    check(one.text.length > 0 && other.text.length > 0, "and each of them shows some");
}

report();
await close();
