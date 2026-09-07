// The code editor: the face it is set in, and the theme it follows.
import { open, results } from "./harness.mjs";

const APP = process.env.APP ?? "http://localhost:5180";
const { send, evaluate, wait, shot, go, click, close, paintedWith } = await open();
const { check, report } = results();

const editor = `document.querySelector("[data-testid=app-main] .monaco-editor")`;

// ── 1. Reach an editor ──────────────────────────────────────────────────────
// The submit page rather than the modal: the colour-scheme toggle lives in the
// header, and a modal would sit over it.
await go(`${APP}/activities/AMMPZ-2019/submit/D?fakeUser=amy`,
    `document.body.innerText.includes("Język")`);
await wait(2500);
await click(`[...document.querySelectorAll("[data-testid=app-main] input")]
    .find(i => /python|c\\+\\+/i.test(i.value))`);
await wait(900);
await click(`[...document.querySelectorAll("[data-testid=combobox-option], [role=option]")]
    .find(o => /C\\+\\+/.test(o.textContent))`);
await wait(3000);
check(await evaluate(`return ${editor} !== null;`), "choosing a language draws the editor");

// ── 2. The face it is actually painted in ───────────────────────────────────
//
// **Asked of the browser, not of the stylesheet.** `getComputedStyle` reports
// the stack Monaco was handed; only the protocol says which face drew the
// glyphs, and a silent fall back to Consolas looks identical from every other
// angle. Monaco also measures a glyph once at start-up, so this doubles as the
// check that `remeasureFonts` ran: a wrong face here is a wrong column width.
// **An empty editor paints nothing**, and a font report of an empty node is an
// empty list — which would pass a check written as "no stray face". So put a
// line of code in it first. Monaco owns its buffer and ignores a value written
// to its hidden textarea; this goes in as real input, the way
// `verify-submit-modal` does.
await click(`document.querySelector("[data-testid=app-main] .monaco-editor .view-lines")`);
await wait(500);
await send("Input.insertText", { text: "int main() { return 0; }" });
await wait(800);
await evaluate(`await document.fonts.ready; return true;`);
await wait(600);
// `.view-line > span` rather than `.view-lines`: the answer covers a node's own
// text runs, and both containers above this one report nothing at all.
const painted = await paintedWith("[data-testid=app-main] .view-line > span");
const summary = (painted ?? [])
    .map(f => `${f.glyphs}× ${f.family}${f.webfont ? "" : " (this machine's)"}`).join(", ");
check(painted !== null && painted.length > 0 && painted.every(f => f.webfont && f.family === "JetBrains Mono"),
    `the editor is painted in JetBrains Mono — ${summary || "nothing rendered"}`);

// And the token behind it, so a reader of the failure knows which half moved.
const token = await evaluate(`
    return getComputedStyle(document.documentElement).getPropertyValue("--mantine-font-family-monospace").trim();
`);
check(/^"?JetBrains Mono"?/.test(token), `and the theme's monospace token names it — ${token}`);

// ── 3. It follows the application's colour scheme ───────────────────────────
// The frame is on the wrapper, not on `.monaco-editor`, so it is read from the
// wrapper. A border of zero width, or one painted in the colour behind it, says
// nothing about where the editor is — both are what this rules out.
const state = () => evaluate(`
    const el = ${editor};
    const frame = document.querySelector("[data-testid=code-editor]");
    const border = frame ? getComputedStyle(frame) : null;
    return {
        frame: border ? {
            width: parseFloat(border.borderTopWidth),
            colour: border.borderTopColor,
            radius: border.borderTopLeftRadius,
            behind: getComputedStyle(frame.parentElement).backgroundColor,
        } : null,
        scheme: document.documentElement.dataset.mantineColorScheme
            ?? document.documentElement.getAttribute("data-mantine-color-scheme"),
        monaco: el ? [...el.classList].find(c => c === "vs" || c === "vs-dark") ?? null : null,
    };
`);

const framed = (seen) => {
    const f = seen.frame;
    check(f !== null && f.width >= 1 && !/,\s*0\)$/.test(f.colour) && f.colour !== f.behind,
        `${seen.scheme}: the working area is framed — ${f ? `${f.width}px ${f.colour}, radius ${f.radius}, on ${f.behind}` : "no frame"}`);
};

const before = await state();
check(before.monaco === (before.scheme === "dark" ? "vs-dark" : "vs"),
    `the editor's theme matches the page — ${before.scheme} / ${before.monaco}`);
framed(before);
await shot("editor-before");

// A real click on the header control, not a write to `localStorage`: what is
// being checked is that the React prop follows, and a stored preference read at
// start-up would prove nothing about a live toggle.
await click(`document.querySelector("[aria-label='Toggle color scheme']")`);
await wait(1500);

const after = await state();
check(after.scheme !== before.scheme, `the toggle changes the page's scheme — ${before.scheme} → ${after.scheme}`);
check(after.monaco === (after.scheme === "dark" ? "vs-dark" : "vs"),
    `and the editor changes with it — ${after.monaco}`);
framed(after);
// The editor is still the same one: a theme applied by remounting would have
// thrown away the buffer, the undo stack and the scroll position mid-solution.
check(await evaluate(`return ${editor} !== null;`), "without remounting it");
await shot("editor-after");

report("editor");
await close();
