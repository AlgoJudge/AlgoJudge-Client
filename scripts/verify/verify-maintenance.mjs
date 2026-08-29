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
await go(`${APP}/activities?fakeUser=amy&fakeMaintenance=draining`,
    `/przerwa techniczna/i.test(document.body.innerText)`);
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
await go(`${APP}/login?fakeMaintenance=closed`,
    `/przerwa techniczna/i.test(document.body.innerText)`);
await wait(800);

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
