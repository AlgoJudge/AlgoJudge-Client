// Several people competing as one, on the manager's screen.
//
// **Two things had to be got right before this passed, and both are recorded
// because the next person will hit them.**
//
// The panel refreshes through `useApiEffect`, and the fake sleeps **300 ms per
// call** — six sequential calls before the group list is set, so a screen takes
// close to two seconds to redraw after a write. A wait of a second looked
// exactly like a write that never landed.
//
// And the panel's own handlers swallowed their errors: they duplicated `run()`
// badly instead of calling it, so a refusal from the fake produced silence. The
// conflict below is what proves both halves now work — the second group of the
// same name is refused, which can only happen if the first one landed.
import { open, results } from "./harness.mjs";

const APP = process.env.APP ?? "http://localhost:5180";
const { evaluate, wait, go, click, tab, close } = await open();
const { check, report } = results();

const ACTIVITY = "PROG-1-LA";
const NAME = "Zespół Sprawdzający";

const body = () => evaluate(`return document.body.innerText;`);

/** Types a name and presses the button, reporting whether it could. */
const addGroup = (name) => evaluate(`
    const input = [...document.querySelectorAll("input")]
        .find(i => (i.placeholder ?? "").includes("Nazwa grupy"));
    if (!input) return "no field";

    // Through the native setter, because React listens for its own input event
    // and a plain assignment raises none.
    const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, "value").set;
    setter.call(input, ${JSON.stringify(name)});
    input.dispatchEvent(new Event("input", { bubbles: true }));

    const button = [...document.querySelectorAll("button")]
        .find(b => b.dataset.testid === "add-group");
    if (!button) return "no button";
    if (button.disabled) return "the name did not reach React";
    button.click();
    return "clicked";
`);

/** Whatever the panel is complaining about, if anything. */
const alerts = () => evaluate(`
    return [...document.querySelectorAll("[data-testid=alert]")].map(a => a.textContent).join(" / ");
`);

/**
 * Waits for something to become true, rather than sleeping for as long as it
 * could take.
 *
 * **The panel needs about two seconds to redraw** — `useApiEffect` makes six
 * sequential calls and the fake sleeps 300 ms in each — and a fixed pause long
 * enough for that on a loaded machine is dead time on every run. Two of them
 * were enough to push a neighbouring check past its own timeout in CI.
 */
const until = async (expression, tries = 30) => {
    for (let attempt = 0; attempt < tries; attempt++) {
        if (await evaluate(`return ${expression};`)) return true;
        await wait(200);
    }
    return false;
};

// Reached the way `verify-activity-manager` reaches the same screen: through the
// list and the row, because the manager's activity page opens from a table cell
// rather than from a link anybody can address.
await go(`${APP}/manager/activities?fakeUser=john`,
    `document.body.innerText.includes(${JSON.stringify(ACTIVITY)})`);
await click(`[...document.querySelectorAll("tbody tr")]
    .find(r => r.innerText.includes(${JSON.stringify(ACTIVITY)}))
    ?.querySelector("td")`);
await wait(2500);

await click(tab("Uczestnicy"));
await wait(900);

const panel = await body();
check(panel.includes("Grupy"), "the participants panel offers groups");
check(
    panel.includes("Grupa startuje jako jedno"),
    "and says what a group is, because sending as one is compulsory rather than a choice");

// ── one is made, and it appears ─────────────────────────────────────────────

check(await addGroup(NAME) === "clicked", "a group is created from the panel");

// Uppercased by the badge, so matched without case.
check(
    await until(`document.body.innerText.toLowerCase().includes(${JSON.stringify(NAME.toLowerCase())})`),
    "and it appears in the roster");

// ── two rows in one ranking may not carry one name ──────────────────────────

check(await addGroup(NAME) === "clicked", "a second group of the same name is offered");

const conflicted = await until(
    `[...document.querySelectorAll("[data-testid=alert]")]
        .some(a => a.textContent.includes("group.name.taken"))`);
check(
    conflicted,
    `and refused, which also proves the first one landed (${(await alerts()).slice(0, 60)})`);

// ── and every participant may be put in one ─────────────────────────────────
//
// Staff rows are disabled: they do not compete, so they are not grouped — the
// same reason the ranking leaves them out.
const offered = await evaluate(`
    return [...document.querySelectorAll("tbody tr")]
        .filter(r => r.querySelector("input[role=combobox], input[aria-haspopup=listbox]"))
        .length;
`);
check(offered >= 1, `the roster offers a group per participant (${offered} rows)`);

await close();
report();
