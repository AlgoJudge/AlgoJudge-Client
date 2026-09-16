// How long a runner has been judging, on the box that says it is.
//
// The box a participant waits at said "a runner is evaluating this submission"
// and nothing on it moved, so after twenty seconds it read exactly like a page
// that had quietly broken. It carries the elapsed time now — **and only while a
// runner actually has it**: a queued submission has nobody working on it, and a
// number there would say otherwise.
//
// It says how long and no more. How many tests have passed stays private.
//
// Driven through the corner panel rather than the submissions list: the panel
// holds the last twelve whatever the paging says, and the window it opens is the
// same `SubmissionView` the screen uses — which is also where somebody actually
// watches a verdict arrive, having just sent it.
//
// **The virtual clock, and `runFor` rather than `fastForward`.** The harness
// records why at its `clock` comment: `fastForward` fires each due timer at most
// once, so a self-rescheduling one-second tick would advance a single step and
// "the number changed" would pass for the wrong reason. The clock also takes the
// race out of it — the fake judges this submission between six and fifteen
// seconds after the dataset is first read, which is not a window to navigate
// inside of.
import { open, RESOLVE, results } from "./harness.mjs";

const APP = process.env.APP ?? "http://localhost:5180";
const { evaluate, until, wait, shot, go, click, close, clock } = await open({ clock: true });
const { check, report } = results();

const modal = `document.querySelector("[data-testid=modal]")`;
const timer = `document.querySelector("[data-testid=judging-for]")`;
const timerText = () => evaluate(`
    return (${timer})?.innerText.replace(/\\s+/g, " ").trim() ?? null;
`);

/**
 * Badges are uppercased by Mantine and Polish labels carry a non-breaking space.
 *
 * **It opens on the same line as the backtick, and that is not a matter of
 * style.** These go into the page as `return ${expression};`, so an expression
 * beginning on the next line becomes `return` followed by a newline — which
 * JavaScript reads as `return;`. The page then answers `undefined` without ever
 * evaluating it, and the check fails while looking exactly like a missing
 * element.
 */
const queuedRow = `([...document.querySelectorAll("[data-testid=submission-row]")]
    .find(r => r.innerText.replace(/\\u00a0/g, " ").toUpperCase().includes("W KOLEJCE")))`;

/**
 * Every answer the fake gives is 300 ms of `setTimeout` behind, and an installed
 * clock advances for nobody — so each fetch is nudged by hand. Without this a
 * page loads and then waits for ever for rows that are one timer away.
 */
const settle = async () => {
    await clock.runFor(1000);
    await wait(400);
};

// ── the submission nobody is working on yet ─────────────────────────────────

await go(`${APP}/activities/AMMPZ-2019/problems?fakeUser=amy`,
    `document.querySelector("[data-testid=submissions-panel]") !== null`);
await settle();

// Collapsed by default, and remembered per tab.
await click(`document.querySelector("[data-testid=submissions-panel] [aria-expanded]")`);
await settle();
await until(`document.querySelectorAll("[data-testid=submission-row]").length > 0`, 10);

check(await evaluate(`return ${queuedRow} !== undefined;`),
    "the fixture has a submission waiting for a runner");

// **Opened and read without settling first.** The fake hands this submission to
// a runner six seconds in, and a `runFor` here would spend part of that budget
// before the queued case has been looked at — the window's own first paint is
// what is wanted, not a later one.
await click(queuedRow);
await until(`${modal} !== null`, 12);
check(await evaluate(`return ${modal} !== null;`), "its row opens the window over the page");

const waiting = await evaluate(`return (${modal})?.innerText ?? "";`);
check(/kolejce|Czekamy/i.test(waiting), "and the box says it is waiting for a runner");
check(await evaluate(`return ${timer} === null;`),
    "with no timer, because nothing is being judged yet");

/**
 * The colour of the waiting box, resolved by the browser rather than read off
 * the prop.
 *
 * A queued submission has nobody working on it, and the badge a few lines above
 * it already says so in grey; a box in the active colour there said the opposite
 * of its own sentence. Asked of the computed background, because a custom
 * property read back answers with whatever tokens were written into it.
 */
const banner = () => evaluate(`
    ${RESOLVE}
    const box = document.querySelector("[data-testid=modal] [data-testid=pending]");
    return {
        bg: box ? hex(getComputedStyle(box).backgroundColor) : null,
        gray: resolved("var(--mantine-color-gray-light)"),
        blue: resolved("var(--mantine-color-blue-light)"),
    };
`);

const queued = await banner();
check(queued.bg === queued.gray && queued.bg !== queued.blue,
    `and it is grey while it only waits — ${queued.gray}, not ${queued.blue}, got ${queued.bg}`);

// ── a runner picks it up ────────────────────────────────────────────────────
//
// The fake flips it at six seconds and stamps the attempt as the Server does:
// `startedAt` is projected from the claim, not from when it was sent.

// **Advanced a second at a time rather than in one jump.** The fake gives this
// submission a verdict at fifteen seconds, and a single leap over the moment it
// is claimed spends most of that budget before the timer has been read twice.
for (let i = 0; i < 14 && await evaluate(`return ${timer} === null;`); i++) {
    await settle();
}

check(await evaluate(`return ${timer} !== null;`),
    "once a runner has it, the box says how long it has been at it");

// **The other half, or grey would pass by being grey always.** A submission a
// runner has is work in progress and keeps the active colour.
const running = await banner();
check(running.bg === running.blue && running.bg !== running.gray,
    `and it turns blue once a runner has it — ${running.blue}, got ${running.bg}`);

const first = await timerText();
check(/\d+:\d\d/.test(first ?? ""),
    `and it reads as a duration (${JSON.stringify(first)})`);

// ── and it moves, which is the whole point ──────────────────────────────────

await settle();
await settle();
const second = await timerText();
check(second !== null && second !== first,
    `the number moves as time passes (${JSON.stringify(first)} → ${JSON.stringify(second)})`);

// Taken here rather than at the first reading: a picture of `0:00` shows the
// element and not the thing it was added for.
await shot("judging-for");

// ── and is gone once there is a verdict ─────────────────────────────────────

await clock.runFor(10_000);
await settle();
check(await evaluate(`return ${timer} === null;`),
    "and it goes when the verdict lands, because there is nothing left to wait for");

report();
await close();
