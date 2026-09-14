// The panel's live-update control: that a screen redraws from an event with
// nobody navigating, that the switch stops exactly that and nothing else, that
// **Odśwież** reads again without turning it back on, and that turning it back
// on catches up.
//
// The dialog hold and the no-replay rule are asserted in `check:events`, which
// can drive the gate directly and does not need a browser to do it.
//
// **What this cannot establish.** `check:ui` runs with `VITE_APP_USE_FAKE_API`,
// where the connection is `NullEventConnection` and the fakes dispatch straight
// into the dispatchers. So no frame crosses a wire here: the Server's audiences,
// every permission decision behind them, and whether the Server sends the event
// at all are unreachable from this file.
//
// That distinction is not academic. On 2026-09-14 pausing a round told the
// participants nothing — the Server sent `managerSeriesChanged` to staff and no
// `seriesChanged` to anybody — while **the fake had been telling them all
// along** (`ManagerApiFake.pauseSeries` relays `change: "paused"`). Every
// browser check was green, and correctly so. `e2e/live-updates.spec.mjs` is what
// covers that half, against a real Server; `check:events` covers the gate's own
// semantics in Node.
//
// What this *can* prove is everything between the dispatcher and the screen.
import { open, results } from "./harness.mjs";

const APP = process.env.APP ?? "http://localhost:5180";
const { evaluate, until, wait, shot, go, visit, click, close } = await open();
const { check, report } = results();

const rows = `document.querySelectorAll("tbody tr").length`;
const present = (id) => `document.querySelector("[data-testid=${id}]") !== null`;

/**
 * The state badge, as a comparable string.
 *
 * Two traps, and each made this read the right element and the wrong text:
 * Mantine's `Badge` uppercases through CSS and `innerText` returns what is
 * *rendered*, so the label written as "Oceniono" arrives here as "OCENIONO";
 * and Polish labels carry a non-breaking space, so "W kolejce" never matches a
 * plain one.
 */
const stateText = `(document.querySelector("[data-testid=submission-state]")?.innerText ?? "")
    .replace(/\\u00a0/g, " ").trim().toUpperCase()`;

// ── the control is the panel's, and only the panel's ────────────────────────

// Waited on the control itself: `tbody tr` is satisfied by zero rows, which is
// true of a page that has not drawn anything yet.
await go(`${APP}/manager/submissions?fakeUser=amy`, present("live-updates"));
check(await evaluate(`return ${present("live-updates")};`),
    "a manager screen carries the live-update control");

await visit("/manager/runners", `${rows} >= 0`);
check(await evaluate(`return ${present("live-updates")};`),
    "and so does the next one, because the routes carry it rather than the screens");

await visit("/activities", `document.body.innerText.length > 0`);
check(await evaluate(`return !(${present("live-updates")});`),
    "a participant screen does not, which is the decision it was built to");

// ── an event redraws a screen with nobody navigating ─────────────────────────
//
// The rejudge is the one thing the fake does on a timer: queued now, running at
// 1.5s, completed at 4s, each dispatched as `submissionChanged`. The screen's
// own call accounts for the first; everything after it arrives by event alone.

await visit("/manager/submissions", `${rows} > 0`);
await click(`document.querySelector("tbody tr td [style*='cursor']")`);
await until(`location.pathname.split("/").length > 3 && ${present("rejudge")}`);
check(await evaluate(`return ${present("rejudge")};`), "a submission opens from its row");

await click(`document.querySelector("[data-testid=rejudge]")`);
const arrived = await until(`${stateText} === "OCENIONO"`, 24);
check(arrived, "a verdict arriving redraws the screen, with nobody having navigated");

// ── the switch stops that, and says something is waiting ─────────────────────

await evaluate(`
    document.querySelector("[data-testid=live-toggle]").click();
    return true;
`);
check(await evaluate(`return document.querySelector("[data-testid=live-toggle]").checked === false;`),
    "the switch turns updates off");

await click(`document.querySelector("[data-testid=rejudge]")`);
// Its own call still refetches — you always see the result of what you did.
await until(`${stateText} !== "OCENIONO"`, 12);
const held = await evaluate(`
    return new Promise(resolve => setTimeout(() => resolve(${stateText}), 6000));
`);
check(held !== "OCENIONO",
    `with updates off the verdict does not land on its own (${JSON.stringify(held)})`);
check(await evaluate(`return ${present("live-pending")};`),
    "and the screen says something changed, without claiming how much");

// ── and coming back catches up ───────────────────────────────────────────────

await evaluate(`
    document.querySelector("[data-testid=live-toggle]").click();
    return true;
`);
check(await until(`${stateText} === "OCENIONO"`, 20),
    "turning updates back on reads the screen again, because a pause replays nothing");
check(await evaluate(`return !(${present("live-pending")});`),
    "and nothing is left waiting once it has caught up");

// ── Refresh reads again while updates are off ────────────────────────────────

await evaluate(`document.querySelector("[data-testid=live-toggle]").click(); return true;`);
await click(`document.querySelector("[data-testid=rejudge]")`);
await until(`${stateText} !== "OCENIONO"`, 12);
await evaluate(`return new Promise(resolve => setTimeout(() => resolve(true), 5500));`);
check(await evaluate(`return ${stateText} !== "OCENIONO";`),
    "still held");
await click(`document.querySelector("[data-testid=live-refresh]")`);
check(await until(`${stateText} === "OCENIONO"`, 20),
    "Refresh reads everything again without turning updates back on");

// ── the posture survives a move between screens ──────────────────────────────

await visit("/manager/runners", `${rows} >= 0`);
check(await evaluate(`return document.querySelector("[data-testid=live-toggle]").checked === false;`),
    "the switch is the panel's, not one screen's, and is remembered across it");

await shot("live-updates-held");
report();
await close();
