// The activity type is chosen from what this Client can present, in both the
// create form and the settings form — as a problem's type already was.
import { open, results } from "./harness.mjs";


const APP = process.env.APP ?? "http://localhost:5180";
const { send, evaluate, wait, shot, go, click } = await open();
const { check, report } = results();

/**
 * The options of one Select, by its label.
 *
 * Scoped through `aria-controls` to the dropdown that input owns: a settings
 * form has half a dozen Selects and Mantine keeps every one of their option
 * lists in the document, so an unscoped query returns all of them at once.
 */
const inputFor = (label) => `[...document.querySelectorAll("label")]
    .filter(l => l.textContent.trim() === ${JSON.stringify(label)})
    .map(l => document.getElementById(l.getAttribute("for")))
    .find(Boolean)`;

const optionsOf = async (label) => {
    await click(inputFor(label));
    return await evaluate(`
        const input = ${inputFor(label)};
        const dropdown = document.getElementById(input?.getAttribute("aria-controls") ?? "");
        if (!dropdown) return null;
        return [...dropdown.querySelectorAll("[role=option]")].map(o => o.textContent.trim());
    `);
};

await send("Page.setDeviceMetricsOverride", { width: 1500, height: 1100, deviceScaleFactor: 1, mobile: false });

// 1 — the create form.
await go(`${APP}/manager/activities?fakeUser=amy`, `document.querySelectorAll("tbody tr").length > 0`);
await click(`[...document.querySelectorAll("button")].find(b => /Nowa aktywno|New activity/i.test(b.textContent))`);
const creating = await optionsOf("Typ");
check(creating.length === 2, `the create form offers a list, not a field (${creating.join(", ")})`);
check(creating.every(option => /contest@1|course@1/.test(option)),
    "and only the types this Client can present");
check(await evaluate(`
    const modal = document.querySelector("[class*=Modal-content]");
    return modal ? /runda|round|termin|deadline/i.test(modal.innerText) : false;
`), "the chosen type explains itself");
await shot("at-create");

// 2 — the settings form on an activity that exists.
await go(`${APP}/manager/activities`, `document.querySelectorAll("tbody tr").length > 0`);
await click(`document.querySelector("tbody tr td p")`);
await wait(1500);
// The activity opens on its series, not on its settings.
await click(`[...document.querySelectorAll("[role=tab]")].find(t => /Ustawienia|Settings/i.test(t.textContent))`);
await wait(1200);
const editing = await optionsOf("Typ");
check(editing.length === 2, `the settings form offers the same list (${editing.join(", ")})`);
await shot("at-settings");

// 3 — the ranking type was already a list and stays one.
const ranking = await optionsOf("Typ rankingu");
check(ranking.length === 2, `the ranking type is still its own list (${ranking.join(", ")})`);

report();
