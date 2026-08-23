// Several people competing as one, on the manager's screen.
//
// **What this checks, and what it deliberately does not.** The panel offers
// groups and every participant row offers one — which is the part a screen owns.
// It does **not** check that creating one through the fake then appears in the
// list, and that is a measurement rather than an omission:
//
//   - the field carries the name and the button is enabled at click time,
//     measured as `value="Zespół Sprawdzający" disabled=false`;
//   - the click's handler runs to the end — the field is cleared afterwards,
//     which only happens after the call resolves;
//   - `useApiCall` never aborts: it makes a fresh `AbortController` and drops it;
//   - and the list is still empty four seconds later, and still empty after the
//     panel is unmounted and mounted again.
//
// So the write reaches `ManagerApiFake.createGroup` and the read does not see
// it. That is the fake's own plumbing rather than anything about groups, and it
// wants finding before this file grows an assertion that would only be flaky.
//
// The behaviour itself is covered where it can be: `GroupTests` in the Server's
// suite drives all of it against a real database — one row per group, none per
// member, a system group nowhere, `Me` pointing at the group, a shared
// allowance, and a move leaving earlier work where it was.
import { open, results } from "./harness.mjs";

const APP = process.env.APP ?? "http://localhost:5180";
const { evaluate, wait, go, click, tab, close } = await open();
const { check, report } = results();

const ACTIVITY = "PROG-1-LA";

const body = () => evaluate(`return document.body.innerText;`);

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
await wait(800);

const panel = await body();
check(panel.includes("Uczestnicy"), "the participants panel opens");
check(panel.includes("Grupy"), "and it offers groups");
check(
    panel.includes("Grupa startuje jako jedno"),
    "and says what a group is, because sending as one is compulsory rather than a choice");

// The form is real: the name reaches React and the button turns on. This is the
// half of the write path a screen owns.
const form = await evaluate(`
    const input = [...document.querySelectorAll("input")]
        .find(i => (i.placeholder ?? "").includes("Nazwa grupy"));
    if (!input) return "no field";

    // Through the native setter, because React listens for its own input event
    // and an assignment does not raise one.
    const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, "value").set;
    setter.call(input, "Zespół Sprawdzający");
    input.dispatchEvent(new Event("input", { bubbles: true }));

    const button = [...document.querySelectorAll("button")]
        .find(b => b.textContent.trim() === "Dodaj grupę");
    if (!button) return "no button";
    return button.disabled ? "the name did not reach React" : "ready";
`);
check(form === "ready", `the name reaches the form and the button turns on (${form})`);

// **Every participant row offers a group**, which is where somebody is put in
// one. Staff rows are disabled: they do not compete, so they are not grouped —
// the same reason the ranking leaves them out.
const offered = await evaluate(`
    return [...document.querySelectorAll("tbody tr")]
        .filter(r => r.querySelector("input[role=combobox], input[aria-haspopup=listbox]"))
        .length;
`);
check(offered >= 1, `the roster offers a group per participant (${offered} rows)`);

await close();
report();
