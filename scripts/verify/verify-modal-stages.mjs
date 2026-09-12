// Sending, reading the verdict and reading the source — all in one window, over
// the statement it was written against.
//
// **The address is the assertion.** Every step here happens on the problem's own
// page and must leave it there: that is the whole of the rule the panel follows,
// and the reason the window exists. A screen is reached as a screen; nothing the
// panel opens is.
//
// The source is reached through the window's own stages rather than by an
// address, because there is no longer an address for it — `/submissions/:id/code`
// was removed on 2026-09-10, and the source view is a modal everywhere.
import { open, results } from "./harness.mjs";

const APP = process.env.APP ?? "http://localhost:5180";
const { send, evaluate, wait, shot, go, click, close } = await open();
const { check, report } = results();

const bar = `document.querySelector("[data-testid=submissions-panel]")`;
const modal = `document.querySelector("[data-testid=modal]")`;
const text = () => evaluate(`return (${modal})?.innerText.replace(/\\s+/g, " ").trim() ?? "";`);
const idShown = () => evaluate(`
    const m = (${modal})?.innerText.match(/ID:\\s*(\\S+)/);
    return m ? m[1] : null;
`);

// ── 1. Send from the statement, and stay on it ──────────────────────────────
await go(`${APP}/activities/AMMPZ-2019/problems/B?fakeUser=amy`,
    `/Najkrótsza|ścieżka/i.test(document.body.innerText)`);
await wait(2000);

const address = await evaluate(`return location.pathname;`);

await click(`[...(${bar})?.querySelectorAll("button") ?? []].find(b => /Wyślij/.test(b.textContent))`);
await wait(2500);
check(await evaluate(`return ${modal} !== null;`), "the window opens over the statement");

// Monaco owns its buffer and ignores a `value` set on its hidden textarea, so
// this goes in as real input.
await click(`document.querySelector("[data-testid=modal] .monaco-editor .view-lines")`);
await wait(500);
await send("Input.insertText", { text: "int main(){ return 1; }" });
await wait(800);
await click(`[...(${modal})?.querySelectorAll("button") ?? []].find(b => /Wyślij|Send/.test(b.textContent))`);
await wait(3000);

const sent = await idShown();
check(sent !== null, `sending leaves the submission in the window (${sent})`);
check(await evaluate(`return location.pathname;`) === address,
    `and the reader is still on the statement (${address})`);
await shot("stages-sent");

// ── 2. Its source, in the same window ───────────────────────────────────────
await click(`(${modal})?.querySelector("[data-testid=show-code]")`);
await wait(2500);

const source = await text();
check(/int\s*main/.test(source.replace(/ /g, " ")),
    `the source stage shows what was sent (${source.slice(0, 80)})`);
check(await evaluate(`return location.pathname;`) === address,
    "and reading it changed no address");
await shot("stages-source");

// ── 3. The way back is a step, not the browser's Back ───────────────────────
// The window walks a trail of its own; the browser's history never moved, so
// there is nothing there to go back to.
await click(`(${modal})?.querySelector("[data-testid=modal-back]")`);
await wait(1200);
check(await evaluate(`return (${modal})?.querySelector("[data-testid=submission-view]") !== null;`),
    "the back arrow returns to the submission");
check(await idShown() === sent, "and to the same one it came from");

// ── 4. A correction is a new submission, and it lands in the window ─────────
await click(`(${modal})?.querySelector("[data-testid=show-code]")`);
await wait(2000);
await click(`(${modal})?.querySelector("[data-testid=edit]")`);
await wait(800);
check(/nowe zgłoszenie/i.test(await text()),
    "editing says it creates a new submission rather than rewriting this one");

await click(`document.querySelector("[data-testid=modal] .monaco-editor .view-lines")`);
await wait(500);
await send("Input.insertText", { text: "// corrected" });
await wait(600);
await click(`(${modal})?.querySelector("[data-testid=resubmit]")`);
await wait(3000);

// **Asserted as a stage, not as a new id.** The fake derives an id from the
// round, the contestant, the problem and *minutes since the round started*
// (`ParticipantApiFake.countAttempt`), so two submissions a few seconds apart
// are one row carrying one id — a property of the fake, not of the product,
// where an id is a UUID. What this can say is that the window left the editor
// behind of its own accord, which is the callback under test;
// `verify-resubmit.mjs` is where a resubmission is followed to a different
// submission, from a seeded one whose minute is days old.
const landed = await evaluate(`
    const m = ${modal};
    return {
        submission: m?.querySelector("[data-testid=submission-view]") !== null,
        editor: m?.querySelector(".monaco-editor") !== null,
        resubmit: m?.querySelector("[data-testid=resubmit]") !== null,
    };
`);
check(landed.submission, "resubmitting shows the submission it created");
check(!landed.editor && !landed.resubmit,
    "and leaves the editor behind rather than sitting on it");
check(await evaluate(`return location.pathname;`) === address,
    `and the statement is still the page underneath (${address})`);
await shot("stages-resubmitted");

// ── 5. A row in the panel opens the window, and nothing navigates ───────────
await click(`(${modal})?.querySelector("[data-testid=close-button]")`);
await wait(800);
await click(`[...(${bar})?.querySelectorAll("button") ?? []]
    .find(b => /Moje zgłoszenia/.test(b.textContent))`);
await wait(1200);
await click(`(${bar})?.querySelector("[data-testid=submission-row]")`);
await wait(2000);

check(await evaluate(`return (${modal})?.querySelector("[data-testid=submission-view]") !== null;`),
    "a row in the panel opens the submission in the window");
check(await evaluate(`return location.pathname;`) === address,
    `rather than navigating away from the statement (${address})`);
await shot("stages-from-row");

report();
close();
