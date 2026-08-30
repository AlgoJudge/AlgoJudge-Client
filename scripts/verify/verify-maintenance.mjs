// What a person sees while the Server is away.
//
// The one screen in the product that replaces everything else, so the only
// useful questions are about what it replaces: does it cover the application,
// does it cover the **login form** as well, and does it stay out of the way when
// the Server is fine.
//
// Driven through the fake's `?fakeMaintenance=`, the same way `?fakeUser=` signs
// somebody in. The real transport reaches this page from a 503; the fake has no
// network to lose, so the level is stated instead.
import { open, results } from "./harness.mjs";

const APP = process.env.APP ?? "http://localhost:5180";
const { evaluate, wait, shot, go, close } = await open();
const { check, report } = results();

const body = () => evaluate(`return document.body.innerText;`);

// ── While the Server drains ─────────────────────────────────────────────────
// **Waits for the answer, then judges the words.**
//
// `/health` is asked once on load and its answer arrives after first paint, so
// until it lands the children render — on `/login` that is the sign-in form.
// Waiting for the notice could not tell *not yet* from *never*: in CI this
// script spent its whole budget and then reported a missing sentence, twice in
// three runs. It waits for `data-maintenance` to *say* `away` or `open`, which
// is the decision, and the assertions below still read the sentence, which is
// the judgement.
//
// **Not `!== "unknown"`.** That was the first form and it was wrong: a fresh
// document carries no attribute at all, `undefined !== "unknown"` is true, and
// the wait fell straight through onto a page that had not mounted yet. It
// passed locally, where React is quick enough that the attribute is already
// there, and failed in CI in 11.4 s — on the assertion rather than on the wait,
// which is the whole reason this attribute exists.
//
// **An earlier reading of this said the session was not the cause. That was
// wrong**, and the correction is worth more than the fix: CPU throttling was
// used as a stand-in for CI load, and it slowed *both* sides of the race
// equally, so the redirect never won and the sign-in form on screen was read as
// the answer. It was an intermediate state. The race is between a 300 ms timer
// and a render, and only one of those is slowed by a busy processor.
await go(`${APP}/activities?fakeUser=amy&fakeMaintenance=draining`,
    `["away", "open"].includes(document.documentElement.dataset.maintenance ?? "")`);
await wait(800);

const draining = await body();
check(/Trwa przerwa techniczna/i.test(draining),
    "a draining Server replaces the application with the maintenance page");
check(/fake maintenance window/i.test(draining),
    "and shows the operator's own reason, in the words they typed");
check(!/Aktywno[śs]ci/.test(draining),
    "the interface underneath is gone rather than merely covered");
await shot("maintenance-draining");

// **The screen a signed-out person would be sent to is covered too.** This is
// the whole reason the gate sits above the session: a Server that cannot answer
// `/account` cannot answer `/identity/login` either, so bouncing somebody to a
// form that will also fail is the worst answer available.
//
// **Signed out first, and this is the fix for a flake that cost two days.**
// `?fakeUser=` above put the account in `sessionStorage`, and `LoginPage`
// answers a signed-in visitor with `<Navigate to={destination}>` — which lands
// on `/activities` and **drops the query string**. The fake reads
// `?fakeMaintenance=` at call time, 300 ms after the call is made, so whichever
// of the two resolves first decides what this page becomes. Locally health won
// and this passed; on a CI runner the redirect won about two runs in three, and
// health then read an address with no parameter and answered `open`.
//
// Clearing the session removes the race rather than tuning it: with no session
// there is no redirect to lose to, at any speed.
await evaluate(`sessionStorage.clear(); return true;`);
await go(`${APP}/login?fakeMaintenance=closed`,
    `["away", "open"].includes(document.documentElement.dataset.maintenance ?? "")`);
await wait(800);

// The precondition, asserted rather than assumed: with a session here the
// redirect above is possible and the parameter can be lost, which is the whole
// of the flake. This fails deterministically if the sign-out is removed.
check(await evaluate(`return sessionStorage.length === 0 && location.search.includes("fakeMaintenance=closed");`),
    "the window is reached signed out, so no redirect can take the parameter with it");

const login = await body();
check(/Trwa przerwa techniczna/i.test(login),
    "the login screen is replaced as well, not left offering a form that cannot work");
check(!/Has[łl]o/.test(login),
    "and there is no password field behind it");
await shot("maintenance-login");

// **No button.** Everything this page could offer needs the Server that is not
// answering, and a control that does nothing invites a second press.
check(await evaluate(`
    const main = document.querySelector("[data-testid=maintenance]") ?? document.body;
    return [...main.querySelectorAll("button, a")].length === 0;
`), "it offers nothing to press, because nothing would work");

// ── And when the Server is fine ─────────────────────────────────────────────
// The regression that would be worst to ship: a gate that blocks an
// installation nobody is maintaining.
await go(`${APP}/activities?fakeUser=amy`,
    `document.body.innerText.length > 0`);
await wait(1500);

const open_ = await body();
check(!/przerwa techniczna/i.test(open_),
    "an open Server shows no maintenance page at all");
check(/Aktywno[śs]ci/.test(open_),
    "and the application is where it was");
await shot("maintenance-open");

report();
close();
