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
import { open, results } from "./harness.mjs";

const APP = process.env.APP ?? "http://localhost:5180";
const { evaluate, go, visit, shot, close } = await open();
const { check, report } = results();

// **Both of these go through `check`, and that is not decoration.**
//
// They used to write to `process.exitCode` directly, which is how a script said
// "I failed" when each one was its own process. Under the test runner it says
// nothing at all: the process is a worker running thirty-seven of these, and a
// test passes or fails on its assertions rather than on an exit code. Left as
// it was, every failure in this file — the longest script here — would have
// been reported as a pass. Found on 2026-08-18 by comparing a run against the
// one taken before the move.
//
// The shape is kept because this script asserts in two halves, choosing the
// message from what it found rather than passing one condition and one string.
const fail = message => check(false, message);
const pass = message => check(true, message);

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

// ── The manager's screen, and the one decision it exists to carry ───────────
//
// A placement waiting for a decision is the only thing on this screen that
// blocks anybody: until somebody accepts it, every launch from that course is
// refused. The badge and the button are checked together, because a badge with
// no way to act on it is what this screen had before.

// **As the administrator, not as a manager.** `provider:manage` is deliberately
// outside the manager set — deciding which platform may assert identity is not
// running a course — so `amy` cannot reach this screen at all.
// **A tab that has not launched.** The launch context lives in `sessionStorage`
// and is scoped to the tab by design, so every page opened after a launch —
// including this one — renders inside the confined shell. Clearing it is what a
// second tab would look like, which is where a manager actually does this work.
await evaluate(`window.sessionStorage.clear(); return true;`);

await go(`${APP}/manager/lti?fakeUser=john`,
    // **The heading, then a row.** The heading renders before the placements
    // arrive, so waiting for it reads an empty table and calls it a screen that
    // says nothing.
    `document.body.innerText.includes("Podpięcia w kursach")
        && document.body.innerText.includes("AMMPZ-2019")`);
await shot("lti-manager");

const manager = (await evaluate(`return document.body.innerText;`)).toLowerCase();
if (!manager.includes("Moodle WMiI".toLowerCase())) {
    fail("the platforms table shows no platform");
} else {
    pass("the platform this installation accepts launches from is listed");
}
if (!manager.includes("Czeka na decyzję".toLowerCase())) {
    fail("a placement nobody has accepted is not marked as waiting");
} else {
    pass("a shared placement nobody accepted says it is waiting");
}
if (!manager.includes("Tylko ten kurs".toLowerCase()) && !manager.includes("Współdzielona".toLowerCase())) {
    fail("the sharing column says nothing at all");
} else {
    pass("the sharing column distinguishes the ordinary case from the shared one");
}

// The button, clicked — then the modal's own button, and the badge must change.
// **Renamed when the copy answer arrived**: accepting the sharing is now one of
// two things a person can choose, so the label says which one it is.
const opened = await evaluate(`
    const button = [...document.querySelectorAll("button")]
        .find(b => b.dataset.testid === "share-one-activity");
    if (!button) return false;
    button.click();
    return true;`);
if (!opened) {
    fail("nothing on the screen offers to accept the sharing");
} else {
    await new Promise(r => setTimeout(r, 900));
    const asked = await evaluate(`return document.body.innerText;`);
    if (!asked.includes("oba dzienniki")) {
        fail("accepting does not say what it means for the gradebooks");
    } else {
        pass("accepting asks first, and says both gradebooks are fed");
    }
    await shot("lti-manager-sharing");

    await evaluate(`
        const confirm = [...document.querySelectorAll("button")]
            .filter(b => b.dataset.testid === "accept-sharing");
        confirm[confirm.length - 1].click();
        return true;`);
    await new Promise(r => setTimeout(r, 1500));
    const after = (await evaluate(`return document.body.innerText;`)).toLowerCase();
    if (after.includes("Czeka na decyzję".toLowerCase())) {
        fail("the placement still says it is waiting after being accepted");
    } else if (!after.includes("zgoda udzielona")) {
        fail("the placement does not say the sharing was accepted");
    } else {
        pass("accepting the sharing is recorded and the row says so");
    }
    await shot("lti-manager-accepted");
}

// ── The roster, and the four reasons somebody is left out ────────────────
//
// The screen exists for the people it *cannot* place: a roster that links
// everybody needs no interface at all. So every check below is about a row that
// did not work out, and about saying which kind of not-working-out it was.

const rosterOpened = await evaluate(`
    const button = [...document.querySelectorAll("button")]
        .find(b => b.dataset.testid === "who-is-in-course");
    if (!button) return false;
    button.click();
    return true;`);

if (!rosterOpened) {
    fail("no placement offers to show who is in the course");
} else {
    await new Promise(r => setTimeout(r, 1500));
    const listed = (await evaluate(`return document.body.innerText;`)).toLowerCase();

    if (!listed.includes("jan kowalski") || !listed.includes("anna nowak")) {
        fail("the roster shows no people");
    } else {
        pass("the roster lists the course's people");
    }

    // Somebody the platform will not name, and somebody who has left: both are
    // in the list rather than quietly dropped from it.
    if (!listed.includes("bez nazwy u\u017cytkownika")) {
        fail("somebody the platform sent no username for is not marked as such");
    } else {
        pass("a member with no username is shown, and said to have none");
    }
    if (!listed.includes("opu\u015bci\u0142")) {
        fail("somebody who has left the course is not marked as such");
    } else {
        pass("a member the course says has left is marked");
    }
    if (!listed.includes("potwierdzone")) {
        fail("an existing link does not say how firm it is");
    } else {
        pass("an existing link says whether it is confirmed");
    }

    await shot("lti-roster");

    await evaluate(`
        const button = [...document.querySelectorAll("button")]
            .find(b => b.dataset.testid === "put-in-activity");
        if (button) button.click();
        return true;`);
    await new Promise(r => setTimeout(r, 2000));

    const after = (await evaluate(`return document.body.innerText;`)).toLowerCase();

    if (!after.includes("pomini\u0119ci")) {
        fail("enrolling says nothing about whom it left out");
    } else {
        pass("enrolling reports whom it left out");
    }
    // The reason, not the code: "noUsername" on a screen is for whoever wrote it.
    if (!after.includes("nie poda\u0142a jego nazwy") && !after.includes("kurs m\u00f3wi")) {
        fail("the reasons are shown as codes rather than as reasons");
    } else {
        pass("each reason is given in words a teacher can act on");
    }
    if (!after.includes("wst\u0119pne")) {
        fail("somebody linked from a roster is not marked provisional");
    } else {
        pass("somebody linked from a roster is marked provisional");
    }

    await shot("lti-roster-enrolled");
}

// ── Expecting a registration ─────────────────────────────────────────────────
//
// The address is the whole mechanism: handing it over is what admits a platform.
// So the screen has to show it while it is live and stop showing it once it is
// not — a spent code left on screen invites somebody to hand it over twice.
await visit("/manager/lti?fakeUser=admin",
    `document.body.innerText.includes("Oczekiwane rejestracje")`);

const expecting = await evaluate(`return document.body.innerText;`);
if (!expecting.includes("Oczekiwane rejestracje")) {
    fail("the platforms screen does not offer to expect a registration");
} else {
    pass("the platforms screen offers to expect a registration");
}

// The seeded one is spent, so its address must not be on screen.
if (expecting.includes("already-used")) {
    fail("a spent invitation still shows the address it was admitted with");
} else {
    pass("a spent invitation shows no address");
}

await evaluate(`
    const label = [...document.querySelectorAll("label")]
        .find(l => l.textContent.includes("Jak to nazwać"));
    const input = label && label.parentElement.querySelector("input");
    if (input) {
        const setter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype, "value").set;
        setter.call(input, "Moodle WMiI");
        input.dispatchEvent(new Event("input", { bubbles: true }));
    }
    const button = [...document.querySelectorAll("button")]
        .find(b => b.textContent.includes("Oczekuj rejestracji"));
    button && button.click();
    return true;
`);
// Waited for rather than slept through: the address appears when the call
// returns, and a fixed sleep is a race dressed as a pause.
for (let i = 0; i < 30; i++) {
    if (await evaluate(`return document.body.innerText.includes("/lti/register?code=");`)) break;
    await new Promise(resolve => setTimeout(resolve, 300));
}

const invited = await evaluate(`return document.body.innerText;`);
if (!invited.includes("Moodle WMiI") || !invited.includes("/lti/register?code=")) {
    fail("expecting a registration does not produce an address to hand over");
} else {
    pass("expecting a registration produces the address to hand over");
}
if (!invited.toLowerCase().includes("oczekuje")) {
    fail("a live invitation is not marked as waiting");
} else {
    pass("a live invitation is marked as waiting");
}

await shot("lti-invitations");

// ── Choosing what to place ───────────────────────────────────────────────────
//
// The platform said it takes several, so the screen must offer several — and
// with one platform that takes one, exactly one.
await visit("/lti/choose?code=demo&fakeUser=admin",
    `document.body.innerText.includes("Wybierz, co umieścić")`);

const choosing = await evaluate(`return document.body.innerText;`);
if (!choosing.includes("Wybierz, co umieścić")) {
    fail("the choosing screen does not open");
} else {
    pass("the choosing screen opens");
}
if (!choosing.includes("Algorytmy i struktury danych")) {
    fail("the choosing screen does not say which course it is placing into");
} else {
    pass("the choosing screen says which course it is placing into");
}

const several = await evaluate(
    `return document.querySelectorAll('input[type=checkbox]').length;`);
if (Number(several) < 2) {
    fail(`a platform taking several items is offered ${several} checkboxes`);
} else {
    pass("a platform taking several items is offered checkboxes");
}

// **The placing button waits for a choice.** A form that posts an empty answer
// sends the person back to Moodle with nothing placed and no reason given.
const idleFirst = await evaluate(`
    const button = [...document.querySelectorAll("button")]
        .find(b => b.textContent.includes("Umieść"));
    return button ? button.disabled : "no button";
`);
if (idleFirst !== true) {
    fail(`placing is offered before anything is chosen (${idleFirst})`);
} else {
    pass("placing waits until something is chosen");
}

// **The whole label, because this one used to be shared.** The button took the
// key `Place` from the ranking's place column, and the Polish for it went from
// the noun to the verb — which renamed "Miejsce" to "Umieść" on every board in
// the product. `check:i18n` cannot see that: the key exists and has a value.
// Matching on a prefix, as the check above does, would not see it either.
const label = await evaluate(`
    const button = [...document.querySelectorAll("button")]
        .find(b => b.textContent.includes("Umieść"));
    return button ? button.textContent.trim() : "no button";
`);
if (label !== "Umieść w kursie") {
    fail(`the placing button reads "${label}", so it is sharing a key again`);
} else {
    pass("the placing button has a label of its own");
}

await shot("lti-choose");

// The one-item platform, which is the case a checkbox list would get wrong.
await visit("/lti/choose?code=single&fakeUser=admin",
    `document.querySelectorAll("input[type=radio]").length > 0`);
const single = await evaluate(`return {
    radios: document.querySelectorAll("input[type=radio]").length,
    boxes: document.querySelectorAll("input[type=checkbox]").length,
};`);
if (!single || single.radios < 2 || single.boxes !== 0) {
    fail(`a platform taking one item is offered ${JSON.stringify(single)}`);
} else {
    pass("a platform taking one item is offered a single choice");
}

// And a choosing that is over says so rather than showing an empty list.
await visit("/lti/choose?code=spent&fakeUser=admin",
    `document.body.innerText.includes("wygasł")`);
const gone = await evaluate(`return document.body.innerText;`);
if (!gone.includes("zakończony albo wygasł")) {
    fail("a finished choosing does not say so");
} else {
    pass("a finished choosing says so");
}

// ── A course that was copied ─────────────────────────────────────────────────
//
// The screen has to offer both answers, because the data cannot tell them
// apart: one activity shared by two courses is right for two groups of one
// class, and wrong for this year copied from last year.
// **A real navigation, not an in-app one.** The check above accepts the sharing
// on this very placement, and the fake keeps its state for the life of the page
// — so visiting in-app would arrive at a row whose question has been answered.
await go(`${APP}/manager/lti?fakeUser=admin`,
    `document.body.innerText.includes("Wygląda na kopię")`);

const copied = await evaluate(`return document.body.innerText;`);
if (!copied.includes("Wygląda na kopię kursu")) {
    fail("a placement that looks like a copy does not say so");
} else {
    pass("a placement that looks like a copy says which one");
}

const offers = await evaluate(`
    const buttons = [...document.querySelectorAll("button")].map(b => b.textContent);
    return {
        share: buttons.some(text => text.includes("Współdziel jedną aktywność")),
        copy: buttons.some(text => text.includes("Daj mu własną kopię")),
    };
`);
if (!offers.share || !offers.copy) {
    fail(`both answers are not offered: ${JSON.stringify(offers)}`);
} else {
    pass("both answers are offered on the row that is a question");
}

await shot("lti-copied-course");

// **The copy asks for a name and a date**, and refuses to proceed without
// them: a copy made with last year's dates is the failure this whole screen
// exists to prevent.
await evaluate(`
    const button = [...document.querySelectorAll("button")]
        .find(b => b.textContent.includes("Daj mu własną kopię"));
    button && button.click();
    return true;
`);

for (let i = 0; i < 30; i++) {
    if (await evaluate(`return document.body.innerText.includes("Kiedy zaczyna się pierwsza runda");`)) break;
    await new Promise(resolve => setTimeout(resolve, 300));
}

const asks = await evaluate(`
    const text = document.body.innerText;
    const button = [...document.querySelectorAll("button")]
        .find(b => b.dataset.testid === "copy");
    return {
        saysUnpublished: text.includes("nieopublikowana"),
        saysWhatTravels: text.includes("nic z tego, co się wydarzyło"),
        blocked: button ? button.disabled : "no button",
    };
`);

if (!asks.saysUnpublished) {
    fail("the copy dialogue does not say the copy arrives unpublished");
} else {
    pass("the copy dialogue says the copy arrives unpublished");
}
if (!asks.saysWhatTravels) {
    fail("the copy dialogue does not say what the copy leaves behind");
} else {
    pass("the copy dialogue says what the copy leaves behind");
}
if (asks.blocked !== true) {
    fail(`copying is offered before a name and a date are given (${asks.blocked})`);
} else {
    pass("copying waits for a name and a date");
}

// Settled rather than mid-transition: a screenshot taken while the modal fades
// in shows the page through it, which reads as a rendering defect and is not one.
await new Promise(resolve => setTimeout(resolve, 800));
await shot("lti-copy-dialogue");

await close();
report();
