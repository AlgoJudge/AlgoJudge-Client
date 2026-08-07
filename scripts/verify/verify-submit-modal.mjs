// Sending from the corner, and the bar that now carries two controls.
import { open, results } from "./cdp.mjs";

const APP = process.env.APP ?? "http://localhost:5180";
const { send, evaluate, wait, shot, go, visit, click, close } =
    await open({ out: process.env.OUT ?? "." });
const { check, report } = results();

const body = () => evaluate(`return document.body.innerText;`);
const bar = `[...document.querySelectorAll("[class*=Paper-root]")]
    .find(p => /Moje zgłoszenia/.test(p.innerText) && getComputedStyle(p).position === "fixed")`;
const modal = `document.querySelector("[class*=Modal-content]")`;
const sendButton = `[...(${bar})?.querySelectorAll("button") ?? []]
    .find(b => /Wyślij/.test(b.textContent))`;

// ── 1. The bar carries both controls, as siblings ───────────────────────────
await go(`${APP}/activities/AMMPZ-2019/problems?fakeUser=amy`, `document.body.innerText.includes("Runda 1")`);
await wait(2000);

const shape = await evaluate(`
    const panel = ${bar};
    if (!panel) return null;
    const buttons = [...panel.querySelectorAll("button")];
    return {
        // A button inside a button is what this layout exists to avoid.
        nested: buttons.some(b => b.closest("button") !== b),
        labels: buttons.map(b => b.textContent.replace(/\\s+/g, " ").trim()).filter(Boolean),
        // Both must be reachable by keyboard, which nesting would have cost.
        focusable: buttons.filter(b => b.tabIndex >= 0).length,
    };
`);
check(shape !== null && !shape.nested, "no control in the bar is nested inside another");
check(shape !== null && shape.labels.some(l => /Wyślij/.test(l)),
    `the bar carries a send button (${shape?.labels.join(" | ")})`);
check(shape !== null && shape.focusable >= 2,
    `and both it and the toggle are reachable by keyboard (${shape?.focusable})`);

// ── 2. Sending does not toggle the panel ────────────────────────────────────
const wasOpen = await evaluate(`return (${bar})?.querySelectorAll("[class*=row]").length > 0;`);
await click(sendButton);
await wait(1500);
check(await evaluate(`return ${modal} !== null;`), "the send button opens a modal");
const stillSame = await evaluate(`return (${bar})?.querySelectorAll("[class*=row]").length > 0;`);
check(stillSame === wasOpen, "and does not expand or collapse the panel behind it");

// ── 3. It is wide, and offers only rounds that accept something ─────────────
const width = await evaluate(`
    const m = ${modal};
    return m ? Math.round(m.getBoundingClientRect().width) : null;
`);
check(width !== null && width >= 800, `the modal is wide enough for an editor (${width}px)`);

await click(`(${modal})?.querySelector("input")`);
await wait(900);
const options = await evaluate(`
    return [...document.querySelectorAll("[class*=Combobox-option], [role=option]")]
        .map(o => o.textContent.trim());
`);
check(options.some(o => /\[A\]/.test(o)), `the picker offers the running round's problems (${options.join(" | ")})`);
// Runda 0 ended yesterday: readable, and accepting nothing.
check(!options.some(o => /\[R\]|\[S\]/.test(o)),
    "and none from a round that has ended");
await shot("mod-picker");

// ── 4. Choosing one draws the form ──────────────────────────────────────────
await click(`[...document.querySelectorAll("[class*=Combobox-option], [role=option]")]
    .find(o => /\\[B\\]/.test(o.textContent))`);
await wait(2500);
const form = await evaluate(`
    const m = ${modal};
    if (!m) return null;
    return {
        text: m.innerText.replace(/\\s+/g, " ").trim().slice(0, 200),
        inputs: m.querySelectorAll("input").length,
        hasSend: [...m.querySelectorAll("button")].some(b => /Wyślij|Send/.test(b.textContent)),
    };
`);
check(form !== null && /Język programowania|Programming language/i.test(form.text),
    `choosing a problem draws the form (${form?.text.slice(0, 80)})`);
check(form !== null && form.hasSend, "with a send button of its own");
await shot("mod-form");

// ── 5. Sending closes it and leaves the route alone ─────────────────────────
const before = await evaluate(`return location.pathname;`);
const countBefore = await evaluate(`
    const m = (${bar})?.innerText.match(/Moje zgłoszenia\\s+(\\d+)/);
    return m ? Number(m[1]) : null;
`);
// Type something, so the form has a solution to send. Monaco owns its buffer and
// ignores a `value` set on its hidden textarea, so this goes in as real input.
await click(`document.querySelector("[class*=Modal-content] .monaco-editor .view-lines")`);
await wait(500);
await send("Input.insertText", { text: "int main(){ return 0; }" });
await wait(800);
// Read from the rendered lines, with Monaco's non-breaking spaces normalised.
const typed = await evaluate(`
    const lines = document.querySelector("[class*=Modal-content] .view-lines");
    return (lines?.textContent ?? "").replace(/\\u00a0/g, " ").trim();
`);
check(/int\s+main/.test(typed), `the editor takes what is typed into it (${typed})`);
await click(`[...(${modal})?.querySelectorAll("button") ?? []].find(b => /Wyślij|Send/.test(b.textContent))`);
await wait(3500);

check(await evaluate(`return ${modal} === null;`), "sending closes the modal");
check(await evaluate(`return location.pathname;`) === before,
    `and leaves the screen exactly where it was (${before})`);
const countAfter = await evaluate(`
    const m = (${bar})?.innerText.match(/Moje zgłoszenia\\s+(\\d+)/);
    return m ? Number(m[1]) : null;
`);
check(countBefore !== null && countAfter === countBefore + 1,
    `the panel picks the new submission up on its own (${countBefore} → ${countAfter})`);
await shot("mod-sent");

// ── 6. Opening from a problem's page starts on that problem ─────────────────
await visit("/activities/AMMPZ-2019/problems/C", `/Sortowanie|topologiczne/i.test(document.body.innerText)`);
await wait(2000);
await click(sendButton);
await wait(2500);
check(await evaluate(`
    const input = (${modal})?.querySelector("input");
    return input ? /\\[C\\]/.test(input.value) : false;
`), "opening it from a problem's own page starts on that problem");
await shot("mod-preselected");

report();
close();
