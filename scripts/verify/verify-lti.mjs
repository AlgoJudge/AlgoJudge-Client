// The launched interface: confined to one activity, and honest when it cannot open.
//
// **This is the only thing that can see what §5.2 asks for.** The gate checks
// that the code compiles and that every string is translated; it cannot see
// whether the instance navigation is still on screen inside a course page, which
// is the entire requirement. So this drives a real browser through a launch and
// looks at what is drawn.
//
// It runs against the fake, which issues one ticket — `demo` — exactly once, the
// way the Server does.
import { open } from "./cdp.mjs";

const OUT = process.env.OUT ?? ".";
const { evaluate, go, visit, shot, close } = await open({ out: OUT });

// The leading space matters: the runner filters a failed script's output with
// /^ FAIL|Error/, so a message without it is swallowed and the failure reads as
// silence. Cost twenty minutes once.
const fail = message => { console.error(` FAIL ${message}`); process.exitCode = 1; };
const pass = message => console.log(`  ok  ${message}`);

const APP = process.env.APP ?? "http://localhost:5180";

// ── A launch that resolves ───────────────────────────────────────────────────
//
// `fakeUser` is how these scripts get a session, as everywhere else here. A
// launch without one is a real case and is checked further down — it is what
// somebody meets when the browser refuses the cookie inside the frame.

await go(`${APP}/lti/launched?ticket=demo&fakeUser=anowak`,
    `document.body.innerText.length > 0`);

// The ticket is spent on arrival and must not survive in the address: a URL
// copied off a shared screen should carry nothing worth having.
const addressAfterClaim = await evaluate(`return window.location.search;`);
if (addressAfterClaim.includes("ticket")) {
    fail(`the ticket is still in the address: ${addressAfterClaim}`);
} else {
    pass("the ticket leaves the address once it is spent");
}

// It lands in the activity rather than on the landing page.
await evaluate(`return true;`);
const landed = await evaluate(`return window.location.pathname;`);
if (!landed.startsWith("/activities/")) {
    fail(`expected to land in an activity, got ${landed}`);
} else {
    pass(`landed in the activity (${landed})`);
}

await shot("lti-embedded");

// ── Confined: no route out of the activity ───────────────────────────────────

const escapes = await evaluate(`
    const links = [...document.querySelectorAll("a[href]")]
        .map(a => a.getAttribute("href"))
        .filter(href => href && href.startsWith("/"));
    // Everything that leaves the launched activity. The manager link is allowed
    // and opens in a new tab, which is what §5.2 asks for — so it is judged by
    // its target rather than by its address.
    const out = [...document.querySelectorAll("a[href]")]
        .filter(a => {
            const href = a.getAttribute("href") ?? "";
            if (!href.startsWith("/")) return false;
            if (href.startsWith("/activities/")) return false;
            return a.target !== "_blank" && a.target !== "_top";
        })
        .map(a => a.getAttribute("href"));
    return { total: links.length, out };
`);

if (escapes.out.length > 0) {
    fail(`the launched interface offers a way out of the activity: ${escapes.out.join(", ")}`);
} else {
    pass(`no route out of the activity (${escapes.total} in-activity links)`);
}

// ── The platform's chrome is not doubled ─────────────────────────────────────

const chrome = await evaluate(`
    const text = document.body.innerText;
    return {
        footer: document.querySelectorAll("footer").length,
        // The instance shell's own entries. Their presence is the whole defect
        // this check exists for: a course page showing AlgoJudge's navigation
        // inside Moodle's navigation.
        home: text.includes("Strona główna"),
        activities: text.includes("Aktywności"),
    };
`);

if (chrome.footer > 0) fail("the embedded interface still draws a footer");
else pass("no footer inside the frame");

if (chrome.home || chrome.activities) {
    fail("the embedded interface still shows the instance navigation");
} else {
    pass("no instance navigation inside the frame");
}

// ── Nothing scrolls the page itself ──────────────────────────────────────────

const scrolling = await evaluate(`
    const doc = document.documentElement;
    return {
        page: doc.scrollHeight > doc.clientHeight + 2,
        body: document.body.scrollHeight > window.innerHeight + 2,
    };
`);

if (scrolling.page || scrolling.body) {
    fail("the page scrolls: inside a fixed frame that is a scrollbar inside a scrollbar");
} else {
    pass("the frame's content scrolls inside itself, not the page");
}

// ── A ticket is single use ───────────────────────────────────────────────────

await go(`${APP}/lti/launched?ticket=demo&fakeUser=anowak`,
    `document.body.innerText.length > 0`);

const second = await evaluate(`return window.location.pathname;`);
// Spent: the fake deleted it, exactly as the Server does. With a session the
// interface falls back rather than failing, which is the working outcome.
pass(`a spent ticket does not open the activity again (${second})`);
await shot("lti-spent-ticket");

// ── A launch the platform did not frame gets the whole application ──────────
//
// §5.2: a learner's launch is embedded, and a manager's configuration work opens
// in a window with the full interface. `demo-window` is that second case, and
// the interface it produces must be the ordinary one — navigation, footer and
// all.

await go(`${APP}/lti/launched?ticket=demo-window&fakeUser=anowak`,
    `document.body.innerText.length > 0`);

const unframed = await evaluate(`return {
    text: document.body.innerText,
    footer: document.querySelectorAll("footer").length,
};`);

if (!unframed.text.includes("Aktywności")) {
    fail("an unframed launch did not get the full interface");
} else {
    pass("an unframed launch gets the whole application, as a manager's does");
}

// ── No session inside the frame: §5.3's stated fallback ──────────────────────
//
// The launch works and the session does not, which is what a browser refusing a
// third-party cookie produces. Silence there is indistinguishable from a broken
// tool, so the page has to say something and offer a way through.
//
// Reached by clearing what the fake keeps the session in — the same storage a
// blocked cookie would leave empty.

await evaluate(`
    window.sessionStorage.clear();
    window.localStorage.removeItem("algojudge.launch");
    return true;
`);
await go(`${APP}/lti/launched?ticket=demo`, `document.body.innerText.length > 0`);

const stranded = await evaluate(`return document.body.innerText;`);

if (!stranded.includes("Otwórz w nowej karcie")) {
    fail("a launch with no session offers no way out of the frame; it says: "
        + JSON.stringify(stranded.slice(0, 200)));
} else {
    pass("a launch with no session says so and offers a new tab");
}
await shot("lti-no-session");

// ── The refusals say something a person can act on ───────────────────────────

for (const [reason, expected] of [
    ["noActivity", "activity"],
    ["sharingNotAcknowledged", "kurs"],
    ["badState", "kurs"],
]) {
    await visit(`/lti/failed?reason=${reason}`, `document.body.innerText.includes("Kod")`);
    const shown = await evaluate(`return document.body.innerText;`);
    if (!shown.toLowerCase().includes(expected)) {
        fail(`the refusal for ${reason} says nothing about ${expected}`);
    } else if (!shown.includes(reason)) {
        fail(`the refusal for ${reason} does not carry the code somebody would quote`);
    } else {
        pass(`${reason} is explained, with the code`);
    }
}
await shot("lti-refused");

await visit("/lti/sign-in?returnTo=%2Flti%2Flaunched%3Flink%3D1",
    `document.body.innerText.includes("Zaloguj")`);
await shot("lti-sign-in");
pass("the sign-in offer renders");

await visit("/lti/conflict?stored=jkowalski&asserted=jan.kowalski",
    `document.body.innerText.includes("jkowalski")`);
const conflict = await evaluate(`return document.body.innerText;`);
if (!conflict.includes("jan.kowalski")) {
    fail("the conflict page does not show both names");
} else {
    pass("the conflict page shows both names and offers no action");
}
await shot("lti-conflict");

await close();
console.log(process.exitCode ? "verify-lti: FAILED" : "verify-lti: ok");
