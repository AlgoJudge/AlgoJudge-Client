// The manager panel as a manager actually holds it.
//
// **Every other script here drives `amy` or `john`, and neither is a manager.**
// The fake hands `amy` a system-scope set no template grants — `user:read:all`,
// `template:read`, `activity:create`, `runner:read` among them — and `john` is
// the administrator. So every manager screen has been checked by somebody
// holding more than the product gives out, and a screen that needs a permission
// the manager template does not carry looks right here and refuses in an
// installation.
//
// `jkowalski` holds exactly one grant: the manager template, on one course, and
// nothing at system scope. That is what a manager is.
//
// **Start on `/` and not on a manager address.** `?fakeUser=` is read while the
// fake is built, and a cold load straight onto `/manager` renders nothing at
// all — measured, and an artefact of the fake rather than of the product.
import { open, results } from "./harness.mjs";

const APP = process.env.APP ?? "http://localhost:5180";
const { evaluate, wait, shot, go, visit, close } = await open();
const { check, report } = results();

const AS = "fakeUser=jkowalski";

const main = () => evaluate(`
    const area = document.querySelector("[data-testid=app-main]");
    return (area?.innerText ?? "").replace(/\\s+/g, " ").trim();
`);

const REFUSED = "Nie masz uprawnień";

await go(`${APP}/?${AS}`, `document.body.innerText.includes("AlgoJudge")`);
await wait(1200);

// ── what the panel offers ───────────────────────────────────────────────────

await go(`${APP}/manager?${AS}`, `document.querySelector("[data-testid=app-main]") !== null`);
await wait(1500);

const offered = await evaluate(`
    return [...document.querySelectorAll("[data-testid=app-main] a[href^='/manager/']")]
        .map(a => a.getAttribute("href")).sort();
`);
check(offered.length > 0, `the panel offers ${offered.length}: ${offered.join(" ")}`);

// The seven administration areas are installation-wide and deliberately not a
// manager's. Naming them is what makes the list above evidence rather than a
// tally: if one appears, a template gained a permission nobody decided on.
for (const withheld of ["/manager/users", "/manager/permission-templates", "/manager/runners",
    "/manager/instance", "/manager/oidc", "/manager/lti", "/manager/external-content"]) {
    check(!offered.includes(withheld), `and does not offer ${withheld}`);
}

// ── each one, opened ────────────────────────────────────────────────────────
//
// A card that leads to a refusal is the defect this file exists to catch, and so
// is a screen that draws its heading and then fails to fill.

for (const area of offered) {
    await visit(area, `document.querySelector("[data-testid=app-main]") !== null`);
    await wait(2000);
    const text = await main();
    check(!text.includes(REFUSED), `${area} opens`);
    check(text.length > 40, `${area} draws something (${text.slice(0, 110)})`);
}

// ── the lists are narrowed, not emptied and not refused ─────────────────────
//
// **This is the report of 2026-09-09.** The panel asks these with no activity,
// because it is the list of everything this person may see. The Server required
// the permission at that empty scope, so a grant on an activity answered
// nothing and the screens refused. They narrow now — and narrowing is only
// worth anything if it also leaves somebody else's work out.

// By slug, because that is what the rows carry — the name is on the activity's
// own screen, not in a list of two hundred.
const NARROWED = [
    ["/manager/submissions", "PROG-1-LA", "AMMPZ-2019"],
    ["/manager/questions", "PROG-1-LA", "AMMPZ-2019"],
];

for (const [area, mine, theirs] of NARROWED) {
    await visit(area, `document.querySelector("[data-testid=app-main]") !== null`);
    await wait(2200);
    const text = await main();
    check(!text.includes(REFUSED), `${area} is not refused`);
    check(text.includes(mine), `and carries the course this person manages (${mine})`);
    check(!text.includes(theirs), `and none of the contest they do not (${theirs})`);
}

// ── configuring the one activity this manager has ───────────────────────────
//
// Opening the panel is not what the report was about: configuring is. All four
// tabs of the course `jkowalski` manages, because that is where a manager spends
// the day and where a missing permission would show as a tab that never fills.

// Each tab is judged on something only that tab draws. The four share a header,
// and a length or a "no refusal" alone passes on the header while the body below
// it is empty — which is what the first version of this did.
const TABS = [
    ["series", "Nowa seria"],
    ["settings", "Tożsamość"],
    ["documents", "Dokument"],
    ["participants", "Grupy"],
];

for (const [tab, marker] of TABS) {
    await visit(`/manager/activities/PROG-1-LA?tab=${tab}`,
        `document.querySelector("[data-testid=app-main]") !== null`);
    await wait(2200);
    const text = await main();
    check(!text.includes(REFUSED), `the course's ${tab} tab opens`);
    check(text.includes(marker), `and draws its own body (${tab}: ${marker})`);
}

// **The button a manager may not use, and no longer sees.** `activity:create` is
// a system-scope right the manager template deliberately does not carry: whoever
// creates an activity is granted the template *on it*, so creating belongs to the
// installation. The list drew the control to everybody until 2026-09-09, which
// put a manager one click from a refusal.
await visit("/manager/activities", `document.querySelector("[data-testid=app-main]") !== null`);
await wait(1500);
const create = await evaluate(`
    const button = [...document.querySelectorAll("button")]
        .find(b => (b.innerText ?? "").includes("Nowa"));
    return button ? button.innerText.trim() : "";
`);
check(create === "", `and offers no create control to a manager (${create || "none"})`);

// ── and one it withholds, typed in by hand ──────────────────────────────────

await visit("/manager/users", `document.body.innerText.includes("uprawnie")`);
await wait(1200);
check((await main()).includes(REFUSED), "an area the panel withholds refuses when typed in");

await shot("manager-template");
report();
close();
