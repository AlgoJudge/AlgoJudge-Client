// The three documents an assignment carries, typed rather than pasted.
//
// Each is a `JsonInput` driven from a parsed object. Fully controlled from that
// object, every keystroke that was not already a complete JSON document left the
// object unchanged, so the next render put the previous text back and the
// character vanished. `config`, `spec` and `props` could only ever be set by
// pasting a whole object in one event — and nothing noticed, because no check
// had ever typed into them.
import { open, results } from "./harness.mjs";

const APP = process.env.APP ?? "http://localhost:5180";
const { evaluate, wait, shot, go, click, close } = await open();
const { check, report } = results();

const MODAL = `document.querySelector("[data-testid=modal]")`;

/** One of the three text areas, found by the label above it. */
const fieldOf = (label) => `(() => {
    const modal = ${MODAL};
    if (!modal) return null;
    return [...modal.querySelectorAll("textarea")]
        .find(t => t.closest("[data-testid=field]")?.innerText.startsWith(${JSON.stringify(label)}))
        ?? null;
})()`;

/**
 * Types one character, the way a keyboard does.
 *
 * React listens for `input`, and the value has to be set through the prototype
 * setter or React's own value tracker swallows the event as a no-op.
 */
const typeInto = (label, text) => evaluate(`
    const field = ${fieldOf(label)};
    if (!field) return "no field";
    const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
    for (const ch of ${JSON.stringify(text)}) {
        set.call(field, field.value + ch);
        field.dispatchEvent(new Event("input", { bubbles: true }));
    }
    return field.value;
`);

const valueOf = (label) => evaluate(`
    const field = ${fieldOf(label)};
    return field ? field.value : null;
`);

const MANAGER_LIST = `[...document.querySelectorAll("tbody tr")].some(r => r.innerText.includes("AMMPZ-2019"))`;

// The contest, then its rounds, then one assignment's own dialog.
await go(`${APP}/manager/activities?fakeUser=john`, MANAGER_LIST);
await click(`[...document.querySelectorAll("tbody tr")]
    .find(r => r.innerText.includes("AMMPZ-2019"))?.querySelector("td")`);
await wait(2500);

const ROUND = `[...document.querySelectorAll("[data-testid=accordion-item]")]
    .find(i => i.innerText.startsWith("Runda 1"))`;

// The rounds arrive open, so pressing the control would close this one. Only
// the round that is running is ever found shut.
await evaluate(`
    const control = (${ROUND})?.querySelector("[data-testid=accordion-control]");
    if (control && control.getAttribute("aria-expanded") !== "true") control.click();
    return true;
`);
await wait(1500);
await click(`[...((${ROUND})?.querySelectorAll("button") ?? [])]
    .find(b => b.textContent.trim() === "Edytuj")`);
await wait(1800);

check(await evaluate(`return ${MODAL} !== null;`),
    "an assignment opens its own dialog");
check(await evaluate(`return ${fieldOf("Konfiguracja")} !== null;`),
    "which carries the configuration document");
await shot("opaque-open");

// **The whole of the defect, in one assertion.** An opening brace is not a
// document, so the old field reverted it and the field could not be started.
await evaluate(`
    const field = ${fieldOf("Konfiguracja")};
    const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
    set.call(field, "");
    field.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
`);
await wait(300);

const opened = await typeInto("Konfiguracja", "{");
await wait(300);
check(await valueOf("Konfiguracja") === "{",
    `an opening brace stays where it was typed (${JSON.stringify(opened)})`);

const half = await typeInto("Konfiguracja", `"timeMs": 15`);
await wait(300);
check(await valueOf("Konfiguracja") === `{"timeMs": 15`,
    `and so does a half-written document (${JSON.stringify(half)})`);
check(/nie jest poprawny json/i.test(await evaluate(`
    const field = ${fieldOf("Konfiguracja")};
    return field.closest("[data-testid=field]").innerText;
`)), "which says it is not JSON yet, rather than silently refusing the keys");
await shot("opaque-half");

await typeInto("Konfiguracja", "00}");
await wait(400);
check(await valueOf("Konfiguracja") === `{"timeMs": 1500}`,
    "finishing it leaves exactly what was typed");
check(!/nie jest poprawny json/i.test(await evaluate(`
    const field = ${fieldOf("Konfiguracja")};
    return field.closest("[data-testid=field]").innerText;
`)), "and the complaint goes away once it is a document again");

// Valid JSON is not enough: these three are objects or nothing.
await evaluate(`
    const field = ${fieldOf("Wyświetlanie")};
    const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
    set.call(field, "42");
    field.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
`);
await wait(400);
check(/nie jest obiekt json/i.test(await evaluate(`
    const field = ${fieldOf("Wyświetlanie")};
    return field.closest("[data-testid=field]").innerText;
`)), "a number is refused as a document, not accepted as valid JSON");
await shot("opaque-scalar");

// Saving keeps what was typed, which is the point of typing it.
await click(`[...(${MODAL}?.querySelectorAll("button") ?? [])]
    .find(b => b.dataset.testid === "save")`);
await wait(2500);
check(await evaluate(`return ${MODAL} === null;`),
    "the dialog closes on save");

report();
close();
