// The harness the verification scripts share: a tab, and the few things worth
// not writing twice.
//
// **This was `cdp.mjs` until 2026-08-18**, and drove Chrome over the DevTools
// protocol directly. Playwright is underneath it now, and the file was renamed
// because `cdp.mjs` had stopped being true. What did **not** change is the
// contract: `open()` returns the same eleven things under the same names and
// `results()` the same two, so a script that used the old harness changes two
// lines rather than being rewritten. That was the point — the value in this
// directory is five thousand lines of assertions and the traps `README.md`
// records, and a migration that put those at risk to gain a runner would be a
// bad trade.
//
// Small on purpose, as before. Everything here is either something the browser
// makes awkward — a click needs a point, not an element — or something that was
// got wrong once and is worth not getting wrong again.
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));

/**
 * The tab the script about to run should drive.
 *
 * Module-level because the scripts are **scripts**: each one is a sequence of
 * top-level `await`s that opens a tab and asserts against it, which is what they
 * were and what they stay. `ui.spec.mjs` sets this immediately before importing
 * one, so `open()` has a page to hand back without every script having to be
 * rewritten to receive one.
 *
 * **One variable is enough, and stays enough if the suite goes parallel.** A
 * worker runs its tests one after another in a process of its own, so two
 * scripts never hold this at the same time — raising `workers` adds processes,
 * and each gets its own copy of this module.
 */
let currentPage = null;

/** Called by `ui.spec.mjs` only. */
export function usePage(page) {
    currentPage = page;
}

/**
 * Wraps the current page in the harness the scripts were written against.
 *
 * Deliberately **not** Playwright's locators and auto-waiting. The scripts
 * encode traps that its actionability model would fight: Mantine keeps every tab
 * panel mounted and laid out, so "visible" is not what these scripts mean when
 * they scope by content, and `locator.click()` would refuse or re-target where
 * a raw point does what a person does. The waiting is the same reason —
 * `README.md` records races that were fixed by waiting for a **decision**
 * rather than for its outcome, and that reasoning lives in the `waitFor`
 * expressions the call sites pass, not in here.
 *
 * What Playwright is here for is the part that was never the point: finding a
 * browser, owning its lifetime, isolating one script from the next, and being
 * startable by something other than a person at a keyboard.
 */
export async function open({ out = process.env.OUT ?? join(here, "out") } = {}) {
    const page = currentPage;
    if (!page) {
        throw new Error(
            "No page. These run under Playwright now: `npm run check:ui`, "
            + "which collects `ui.spec.mjs`. Running one with `node` directly "
            + "cannot work any more.");
    }

    /**
     * The nine protocol methods the suite actually used, mapped.
     *
     * Kept so that the fifteen scripts carrying their own copy of the old
     * harness could be ported by deleting it rather than by rewriting what they
     * assert. The return shape is the protocol's — `{ result: … }` — because
     * that is what those call sites read.
     */
    const send = async (method, params = {}) => {
        switch (method) {
            // The protocol wanted these before it would answer. Playwright needs
            // no announcing, so they are accepted and dropped rather than
            // deleted from fifteen call sites.
            case "Page.enable":
            case "Runtime.enable":
            case "DOM.enable":
                return { result: {} };
            case "Page.navigate":
                await page.goto(params.url, { waitUntil: "commit" });
                return { result: {} };
            case "Page.setDeviceMetricsOverride":
                await page.setViewportSize({ width: params.width, height: params.height });
                return { result: {} };
            case "Page.captureScreenshot":
                return { result: { data: (await page.screenshot()).toString("base64") } };
            case "Page.addScriptToEvaluateOnNewDocument":
                await page.addInitScript({ content: params.source });
                return { result: {} };
            case "Runtime.evaluate": {
                const value = await page.evaluate(params.expression);
                return { result: { result: { value } } };
            }
            case "Input.insertText":
                await page.keyboard.insertText(params.text);
                return { result: {} };
            case "Input.dispatchMouseEvent":
                // Press and release arrive as two calls, as they did on the
                // protocol, and `page.mouse` keeps them two.
                if (params.type === "mousePressed") {
                    await page.mouse.move(params.x, params.y);
                    await page.mouse.down();
                }
                if (params.type === "mouseReleased") await page.mouse.up();
                return { result: {} };
            default:
                throw new Error(`the harness does not carry ${method}`);
        }
    };

    /**
     * Runs an expression in the page and returns its value.
     *
     * The body is wrapped in an async IIFE, so a script writes `return …` and
     * may `await`. That is the form every call site is written in, and the
     * reason this takes a string rather than a function.
     */
    const evaluate = (expression) => page.evaluate(`(async () => { ${expression} })()`);

    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

    const shot = async (name) => {
        // Created here rather than assumed: a missing directory failed the
        // script at its first screenshot, which reads as the screen being wrong.
        mkdirSync(out, { recursive: true });
        await page.screenshot({ path: `${out}/${name}.png` });
    };

    /**
     * Loads a page and waits for a condition.
     *
     * `waitUntil: "commit"` rather than the default: `Page.navigate` returned as
     * soon as the navigation was committed, and the settling was always done by
     * the wait and the poll below. Waiting for `load` here instead would put a
     * second, invisible timeout in front of a condition the caller has already
     * stated.
     */
    const go = async (url, waitFor, tries = 40) => {
        await page.goto(url, { waitUntil: "commit" });
        await wait(2500);
        for (let i = 0; i < tries; i++) {
            if (await evaluate(`return ${waitFor};`)) return;
            await wait(500);
        }
        throw new Error(`timed out on ${url} waiting for ${waitFor}`);
    };

    /** In-app, so the fake is not rebuilt and anything published in this tab survives. */
    const visit = async (path, waitFor, tries = 40) => {
        await evaluate(`
            window.history.pushState({}, "", ${JSON.stringify(path)});
            window.dispatchEvent(new PopStateEvent("popstate"));
            return true;
        `);
        await wait(1200);
        for (let i = 0; i < tries; i++) {
            if (await evaluate(`return ${waitFor};`)) return;
            await wait(500);
        }
        throw new Error(`timed out visiting ${path} waiting for ${waitFor}`);
    };

    /**
     * Clicks where the element actually is.
     *
     * The locator is a JavaScript expression returning an element, evaluated in
     * the page — **not** a Playwright locator. Keeping it that way is what lets
     * a script address one control among four identical ones through the
     * accordion item whose text starts with the round's name.
     */
    const click = async (locator) => {
        const point = await evaluate(`
            const element = ${locator};
            if (!element) return null;
            element.scrollIntoView({ block: "center" });
            const box = element.getBoundingClientRect();
            return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
        `);
        if (!point) throw new Error(`nothing to click: ${locator}`);
        await page.mouse.click(point.x, point.y);
        await wait(1200);
    };

    const type = async (selector, value) => {
        await evaluate(`
            const input = document.querySelector(${JSON.stringify(selector)});
            if (!input) throw new Error("no such field: " + ${JSON.stringify(selector)});
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, ${JSON.stringify(value)});
            input.dispatchEvent(new Event("input", { bubbles: true }));
            return true;
        `);
        await wait(300);
    };

    const setTextarea = async (value) => {
        await evaluate(`
            // The **visible** one. Mantine keeps every tab panel mounted, so the
            // first textarea in the document is whichever language was open
            // first, not the one on screen.
            const area = [...document.querySelectorAll("textarea")].find(a => a.offsetParent !== null)
                ?? document.querySelector("textarea");
            Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(area, ${JSON.stringify(value)});
            area.dispatchEvent(new Event("input", { bubbles: true }));
            return true;
        `);
        await wait(700);
    };

    // By prefix: some tabs carry a count — "Uczestnicy (3)" — and an exact match
    // silently finds nothing.
    const tab = (label) =>
        `[...document.querySelectorAll("[role=tab]")].find(t => t.textContent.trim().startsWith(${JSON.stringify(label)}))`;

    /**
     * Every tab this script has open, including ones the application opened.
     *
     * One screen needs it: the printable sheet of temporary accounts opens in a
     * tab of its own, and the check is that it does that rather than printing
     * the page behind it. The old harness had no such thing, so
     * `verify-systemic.mjs` asked the DevTools endpoint for a target list and
     * then drove the second tab over a WebSocket of its own — about twenty-five
     * lines of protocol to read four values.
     *
     * Each is `{ url, evaluate }`, `evaluate` taking the same `return …` form as
     * the one above so a caller does not have to learn a second convention.
     */
    const pages = () => page.context().pages().map(other => ({
        url: other.url(),
        evaluate: (expression) => other.evaluate(`(async () => { ${expression} })()`),
    }));

    await page.setViewportSize({ width: 1500, height: 1200 });

    // **Nothing is cleared here any more, and that is the improvement.**
    //
    // The old harness cleared `localStorage` and cookies on open, because every
    // script shared one browser: one that switched to English and left it there
    // made every later script fail on Polish text it was right to expect. Each
    // test now gets its own context, so there is nothing to inherit. What the
    // old comment relied on still holds — `sessionStorage` is per tab, so the
    // signed-in user survives inside one script and not between two.

    return {
        send, evaluate, wait, shot, go, visit, click, type, setTextarea, tab, pages,
        // The page belongs to the runner, which closes it. Kept so the call
        // sites that end on it do not have to lose the line.
        close: () => { },
    };
}

/**
 * The checks a script accumulates.
 *
 * `check` records and keeps going — a script that stopped at its first failure
 * would report one defect per run when it can see four. That is what a soft
 * assertion is, so `expect.soft` lines up exactly and the runner fails the test
 * at the end on its own.
 */
export function results() {
    const lines = [];
    return {
        check(ok, what) {
            lines.push(`${ok ? "  ok  " : " FAIL "} ${what}`);
            // `Boolean` deliberately: the old `check` took anything truthy, and
            // several call sites hand it a found element rather than a
            // comparison. `.toBe(true)` on the raw value would fail those for
            // being right in the wrong type.
            expect.soft(Boolean(ok), what).toBe(true);
        },
        report() {
            // Still printed. The runner reports the failures; this is the list
            // of what passed, which is what tells a reader the script did its
            // work rather than exiting early.
            console.log(lines.join("\n"));
        },
    };
}
