// The front pages, the instance mark, and navigation that obeys permissions —
// as a manager, as a per-activity manager, and as somebody with nothing.
import { open, results } from "./harness.mjs";


const APP = process.env.APP ?? "http://localhost:5180";
const { send, evaluate, wait, shot, go } = await open();
const { check, report } = results();

/**
 * Every assertion here reads something derived from the signed-in person's
 * permissions, and those arrive after the shell does. So a page is not "loaded"
 * when it has text — `RequirePermission` is still drawing a spinner, and the
 * navigation entry a manager gets is still absent because `has` answers false
 * until the answer is in.
 *
 * Waiting for the spinner to go is not waiting for what is asserted: it waits
 * for the decision to be **made**, and the checks below say what it should have
 * been. Without it this script failed a different assertion on each run.
 */
const settled = async (tries = 40) => {
    for (let i = 0; i < tries; i++) {
        const busy = await evaluate(`
            return document.querySelector("[data-testid=loader]") !== null;
        `);
        if (!busy) return;
        await wait(500);
    }
};
const text = () => evaluate(`return document.body.innerText;`);
// Mantine draws the navbar as a div with its own class, not as a <nav>.
const NAVBAR = "[data-testid=app-navbar]";
const navLabels = () => evaluate(`
    const navbar = document.querySelector("${NAVBAR}");
    if (!navbar) return [];
    return [...navbar.querySelectorAll("a, span")]
        .map(e => e.innerText.trim().split("\\n")[0]).filter(Boolean);
`);

// Permissions arrive in a request of their own, after the session settles, and
// until they do `hasAny` answers no to everything — so a screen looks exactly
// like one this person may not open and an assertion about an absence proves
// nothing. Every navigation below waits for the answer, not just for the page.
const READY = `document.documentElement.dataset.permissions === "ready"`;
await send("Page.setDeviceMetricsOverride", { width: 1500, height: 1300, deviceScaleFactor: 1, mobile: false });

// 1 — signed out: the welcome page, with the placeholder mark inside it.
// Cleared on the application's own origin: on about:blank it clears nothing, and
// the language i18next stored in an earlier run would decide the next check.
await go(`${APP}/`, `document.body !== null`);
await evaluate(`sessionStorage.clear(); localStorage.clear(); return true;`);
await go(`${APP}/`, `document.body.innerText.includes("Skąd wziąć konto")`);
check(true, "the welcome page is shown to a visitor who is not signed in");
check(await evaluate(`
    const isMark = src => src.includes("instance-logo") || src.startsWith("data:image/svg");
    return [...document.querySelectorAll("img")].some(i => isMark(i.src ?? ""));
`), "the placeholder mark is drawn inside the document");
check(await evaluate(`return [...document.querySelectorAll("a")].some(a => a.getAttribute("href") === "/login");`),
    "the visitor is offered a way to sign in");
await shot("n-welcome");

// 2 — as amy, the manager the fixtures are written around.
await go(`${APP}/?fakeUser=amy`, `document.body.innerText.includes("Twoje aktywności") && ${READY}`);
check((await text()).includes("Gdzie co jest"), "the signed-in page is the operator's, not the visitor's");
check(await evaluate(`
    return [...document.querySelectorAll("a")].some(a => a.getAttribute("href") === "/manager");
`), "a manager is offered the panel");
await shot("n-home-manager");

await go(`${APP}/activities`, `document.querySelector("${NAVBAR}") !== null && ${READY}`);
const amyNav = await navLabels();
check(amyNav.includes("Panel menedżera"), `the shell offers the manager panel (${amyNav.join(", ")})`);
check(await evaluate(`
    const navbar = document.querySelector("${NAVBAR}");
    const isMark = src => src.includes("instance-logo") || src.startsWith("data:image/svg");
    return navbar !== null && [...navbar.querySelectorAll("img")].some(i => isMark(i.src ?? ""));
`), "the mark sits at the top of the navigation");
await shot("n-shell-manager");

// 3 — the manager landing lists what she may open.
await go(`${APP}/manager`, `document.body.innerText.includes("Zadania") && ${READY}`);
const amyAreas = await text();
check(amyAreas.includes("Użytkownicy") && amyAreas.includes("Runnery") && amyAreas.includes("Nadania"),
    "the landing lists the areas she administers");
await shot("n-manager-amy");

// 4 — a participant: nothing of the panel, and a refusal in front of it.
await go(`${APP}/?fakeUser=anowak`, `document.body.innerText.includes("Twoje aktywności") && ${READY}`);
check(!(await evaluate(`return [...document.querySelectorAll("a")].some(a => a.getAttribute("href") === "/manager");`)),
    "a participant is not offered the panel");
await go(`${APP}/activities`, `document.querySelector("${NAVBAR}") !== null && ${READY}`);
const participantNav = await navLabels();
check(!participantNav.includes("Panel menedżera"), `the shell hides it too (${participantNav.join(", ")})`);

await go(`${APP}/manager/users`, `document.body.innerText.length > 0 && ${READY}`);
check((await text()).includes("Nie masz uprawnień"), "a participant asking for the users screen is refused");
check((await text()).includes("user:read:all"), "the refusal names the permission it needs");
check(!(await text()).includes("Platformy LTI"),
    "somebody being refused gets no manager navigation, not even the dead entries");
await shot("n-forbidden");

await go(`${APP}/manager`, `document.body.innerText.length > 0 && ${READY}`);
check((await text()).includes("Nie masz uprawnień"), "and the panel itself is refused");

// 5 — a manager of one activity and nothing else still gets in.
await go(`${APP}/?fakeUser=jkowalski`, `document.body.innerText.includes("Twoje aktywności") && ${READY}`);
check(await evaluate(`return [...document.querySelectorAll("a")].some(a => a.getAttribute("href") === "/manager");`),
    "a manager of one activity is offered the panel");
await go(`${APP}/manager`, `document.body.innerText.length > 0 && ${READY}`);
const kowalskiAreas = await text();
check(!kowalskiAreas.includes("Nie masz uprawnień"), "and may open it");
check(kowalskiAreas.includes("Aktywności") && !kowalskiAreas.includes("Użytkownicy"),
    "he sees the activities he manages and not the user administration");
await shot("n-manager-kowalski");

await go(`${APP}/manager/users`, `document.body.innerText.length > 0 && ${READY}`);
check((await text()).includes("Nie masz uprawnień"), "the users screen refuses him as well");

report();
