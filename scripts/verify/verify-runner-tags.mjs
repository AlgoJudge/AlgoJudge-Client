// Which Runners judge which work, on the two screens that decide it.
//
// **The rule.** A Runner carries tags and so does the work, and they are paired
// when the two lists share at least one — unlike GitLab, whose runner must hold
// every tag a job asks for. An empty list means `default` on both sides, which
// is the whole of the exclusivity: tagging a Runner takes it out of the general
// pool as surely as it puts it into a reserved one.
//
// **The seed states the shape the feature exists for.** `KOLOKWIUM-2` runs an
// examination pinned to `lab-a` and a homework round beside it that inherits
// nothing, and the fixture holds one Runner tagged `lab-a` with the rest in
// `default`. A course pinned whole would send the homework to the laboratory's
// machines too — including whatever is sent from home at night, while those
// machines are off — so the tag belongs on the round.
//
// **The count is the only warning there is.** An activity tagged with something
// nothing carries accepts submissions, queues them, and never has them judged;
// nothing else on any screen would say so. It counts tags and not problem types,
// which is why zero is a promise and a larger number is not.
//
// **From the manager write onwards it is `visit`, never `go`.** The fake keeps
// a manager's writes in memory, so a full page load throws them away and the
// checks after one would measure the seed again and pass for the wrong reason.
import { open, results } from "./harness.mjs";

const APP = process.env.APP ?? "http://localhost:5180";
const { send, evaluate, wait, shot, go, visit, click, close } = await open();
const { check, report } = results();

// **Every selector here is scoped, and that is not tidiness.** Mantine keeps
// every tab panel mounted, so the round's tag field is in `document.body` while
// the settings tab is the one on screen — and the first version of this script
// typed a tag into the wrong one and read the answer back from it.

/** A field found by its label, within a container — Mantine gives it no id. */
const fieldIn = (container, label) => `[...((${container})?.querySelectorAll("[class*=InputWrapper-root]") ?? [])]
    .find(w => w.textContent.includes(${JSON.stringify(label)}))`;

/** A `Switch` is not an `InputWrapper`, so it is found by its own root. */
const switchIn = (container, label) => `[...((${container})?.querySelectorAll("[class*=Switch-root]") ?? [])]
    .find(w => w.textContent.includes(${JSON.stringify(label)}))`;

/** The card a section title belongs to, which scopes the settings tab's fields. */
const cardTitled = (title) => `[...document.querySelectorAll("[class*=Card-root]")]
    .find(c => c.textContent.includes(${JSON.stringify(title)}))`;

/** The tag pills a `TagsInput` is showing. Its value is not in `innerText`. */
const pillsIn = (wrapper) => `[...((${wrapper})?.querySelectorAll("[class*=Pill-label]") ?? [])]
    .map(p => p.textContent.trim())`;

await send("Page.setDeviceMetricsOverride",
    { width: 1400, height: 1200, deviceScaleFactor: 1, mobile: false });

// ── 1. The Runners screen says what a tag does ──────────────────────────────
//
// It said "used to steer work at particular machines" while nothing read the
// field at all. Now it decides, and the description has to carry the half a
// person will not guess: naming a pool leaves the general one.

// The rows, not the text: the name appears in the page before the table is
// built, and a click that lands then finds nothing to open.
await go(`${APP}/manager/runners?fakeUser=john`,
    `document.querySelectorAll("tbody tr").length > 0`);
await wait(2000);

// **The name, not the cell.** A manager row opens from a `<Text onClick>` and
// not from the row or the cell around it, so a click at the centre of the first
// `td` lands beside the handler as often as on it.
await click(`[...document.querySelectorAll("tbody tr")]
    .find(r => r.innerText.includes("Lab runner"))
    ?.querySelector("td [style*=pointer]")`);
await wait(2500);

const MODAL = `document.querySelector("[class*=Modal-content]")`;
check(await evaluate(`return ${MODAL} !== null;`), "the Runner's panel opens");

const runnerPanel = await evaluate(`return ${MODAL}?.innerText ?? "";`);
check(/wyjmuje go z tej puli/i.test(runnerPanel),
    "the Runners screen says that naming a tag leaves the general pool");
check(/pierwszej rejestracji/i.test(runnerPanel),
    "and that a Runner may suggest its tags once, at its first registration");

const runnerTags = await evaluate(`return ${pillsIn(fieldIn(MODAL, "co najmniej jeden z tych tagów"))};`);
check(Array.isArray(runnerTags) && runnerTags.includes("lab-a"),
    `the laboratory Runner carries its tag (${JSON.stringify(runnerTags)})`);
await shot("runner-tags-panel");

// ── 2. The examination is pinned to the laboratory, the homework is not ─────

const MANAGER_LIST = `[...document.querySelectorAll("tbody tr")]
    .some(r => r.innerText.includes("KOLOKWIUM-2"))`;
await go(`${APP}/manager/activities?fakeUser=john`, MANAGER_LIST);
await click(`[...document.querySelectorAll("tbody tr")]
    .find(r => r.innerText.includes("KOLOKWIUM-2"))?.querySelector("td")`);
await wait(2500);

/** Each round's own block: the course holds two, with the same controls. */
const blockOf = (name) => `[...document.querySelectorAll("[class*=Accordion-item]")]
    .find(i => i.innerText.startsWith(${JSON.stringify(name)}))`;

const examOwn = await evaluate(
    `return ${switchIn(blockOf("Kolokwium 2"), "Oceniana przez własne")}?.querySelector("input")?.checked ?? "gone";`);
check(examOwn === true, `the examination is judged by its own Runners (${examOwn})`);

const examTags = await evaluate(`return ${pillsIn(fieldIn(blockOf("Kolokwium 2"), "Tagi Runner"))};`);
check(Array.isArray(examTags) && examTags.includes("lab-a"),
    `and names the laboratory (${JSON.stringify(examTags)})`);

// **Inheriting, not empty.** These are the two states a `TagsInput` alone
// cannot tell apart, which is why the switch decides and the field only appears
// once it has.
const homeworkOwn = await evaluate(
    `return ${switchIn(blockOf("Ćwiczenia 4"), "Oceniana przez własne")}?.querySelector("input")?.checked ?? "gone";`);
check(homeworkOwn === false, `the homework round inherits its activity's (${homeworkOwn})`);

const homeworkField = await evaluate(
    `return ${fieldIn(blockOf("Ćwiczenia 4"), "Tagi Runner")} ? "shown" : "hidden";`);
check(homeworkField === "hidden",
    "and shows no tag field at all, so inheriting cannot be read as empty");
await shot("runner-tags-rounds");

// ── 3. The count is on the round, and it follows the tags ───────────────────

const examCount = await evaluate(
    `return ${fieldIn(blockOf("Kolokwium 2"), "Tagi Runner")}?.textContent ?? "gone";`);
check(/Pasujące Runnery:\s*1(?!\d)/.test(examCount),
    `one Runner reaches the examination (${(/Pasujące Runnery:[^\n]*/.exec(examCount) ?? ["—"])[0]})`);

// ── 4. The activity's own field, and the warning at zero ────────────────────

await click(`[...document.querySelectorAll("[role=tab]")]
    .find(t => t.textContent.trim().startsWith("Ustawienia"))`);
await wait(2000);

const settings = await evaluate(`return document.body.innerText;`);
check(/Które Runnery oceniają/i.test(settings),
    "the activity's settings carry a Runner-tags section");
check(/zadania domowe/i.test(settings),
    "and say why the tag usually belongs on a round instead");

const activityCard = cardTitled("Które Runnery oceniają tę aktywność");
const activityField = fieldIn(activityCard, "Tagi Runnerów");
// **Off the card, not off the field.** A `TagsInput`'s wrapper ends at its own
// description; the count is a sibling beneath it, and reading the wrapper finds
// the label and never the number.
const before = await evaluate(`return (${activityCard})?.textContent ?? "gone";`);
check(/Pasujące Runnery:\s*[1-9]/.test(before),
    `an untagged activity is reached by the general Runners (${(/Pasujące Runnery:[^\n]*/.exec(before) ?? ["—"])[0]})`);

// A pool nothing carries. Typed, saved, and read back — a check that only looked
// at one of the two could not say which half had failed.
await click(`${activityField}?.querySelector("input")`);
await evaluate(`
    const input = ${activityField}.querySelector("input");
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, "lab-nobody");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
`);
await evaluate(`
    ${activityField}.querySelector("input")
        .dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    return true;
`);
await wait(1200);

// **The visible panel's Save.** Every round in the mounted rounds tab has a
// button reading `Zapisz` too, and they come first in the document — so an
// unscoped search saves a round and leaves this form untouched, which is a way
// of passing that says nothing at all.
await click(`[...(([...document.querySelectorAll("[role=tabpanel]")]
    .find(p => p.offsetParent !== null))?.querySelectorAll("button") ?? [])]
    .find(b => b.textContent.trim() === "Zapisz")`);
await wait(3000);

const after = await evaluate(`return (${activityCard})?.innerText ?? "";`);
check(/Żaden zatwierdzony Runner/i.test(after),
    "an activity tagged with a pool nothing carries says so, rather than failing in silence");
check(!/Pasujące Runnery:/.test(after),
    "and the count is gone with it, so nothing on the card still reads as reachable");
await shot("runner-tags-nobody");

// ── 5. Saving is allowed, because the machines may arrive later ─────────────
//
// Not a refusal: a manager prepares a contest before the laboratory is
// approved, and a form that would not save that is a form nobody can prepare
// with. The warning is the whole of the answer.

const kept = await evaluate(`return ${pillsIn(activityField)};`);
check(Array.isArray(kept) && kept.includes("lab-nobody"),
    `the tags saved anyway (${JSON.stringify(kept)})`);

// ── 6. The round still overrides it ─────────────────────────────────────────
//
// The activity is now pinned to nothing that exists; the examination names its
// own pool and is unaffected. This is the inheritance working in the direction
// nobody tests: downwards is obvious, an override upwards is what makes the
// pinned course usable at all.

await click(`[...document.querySelectorAll("[role=tab]")]
    .find(t => t.textContent.trim().startsWith("Serie"))`);
await wait(2500);

const overriding = await evaluate(
    `return ${fieldIn(blockOf("Kolokwium 2"), "Tagi Runner")}?.textContent ?? "gone";`);
check(/Pasujące Runnery:\s*1(?!\d)/.test(overriding),
    `the examination keeps its own Runner while its course reaches none (${(/Pasujące Runnery:[^\n]*/.exec(overriding) ?? ["—"])[0]})`);
await shot("runner-tags-override");

report();
await close();
