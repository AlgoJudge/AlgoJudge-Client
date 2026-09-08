// The sign-in and registration screens, when an installation says to send
// people straight to a provider.
//
// **What makes this checkable without a Server**: under the fake,
// `resolvedApiBase()` is empty, so the challenge address is a path rather than
// an origin and the browser lands back on this application. That is the same
// exposure the provider buttons have always had, and it is what lets a check
// assert on `location.pathname` instead of on somebody else's login page.
//
// The four suppressions are the point of the file. Each one is a way somebody
// would otherwise be stuck on an installation that redirects: an administrator
// with no form, and — worse — a refused federated sign-in bounced back to the
// provider that just refused it, for ever.
import { open, results } from "./harness.mjs";

const APP = process.env.APP ?? "http://localhost:5180";
const { evaluate, wait, shot, go, visit, click, close } = await open();
const { check, report } = results();

/** Where the browser ended up, path and query, once everything settled. */
const at = () => evaluate(`return location.pathname + location.search;`);

/**
 * The address of the document itself, which is not the same question.
 *
 * **A location alone cannot tell a real navigation from a history push**, and
 * under the fake both land on this origin — so a redirect quietly changed to a
 * router navigation would leave `location` looking exactly right and would
 * still never make a request. Found by sabotage on 2026-09-06: replacing
 * `location.replace` with `history.pushState` reddened nothing.
 *
 * A navigation entry is created per document, so it names the address the
 * document was loaded from and a `pushState` does not touch it.
 */
const loadedFrom = () => evaluate(
    `return performance.getEntriesByType('navigation')[0]?.name ?? '';`);

const drawn = () => evaluate(`
    const body = document.body.innerText;
    return {
        password: document.querySelector("input[type=password]") !== null,
        text: body.replace(/\\s+/g, " ").slice(0, 400),
    };
`);

// ── it leaves, and carries where the person was going ───────────────────────

await go(`${APP}/login?fakeSignInRedirect=university`,
    `document.documentElement.dataset.instance === "loaded" || location.pathname.startsWith("/identity/")`);
await wait(1200);

const left = await at();
check(left.startsWith("/identity/providers/university/challenge"),
    `the sign-in screen leaves for the provider (${left})`);
check(left.includes("returnUrl="),
    "and carries a returnUrl, so a deep link survives the round trip");
check((await loadedFrom()).includes("/identity/providers/university/challenge"),
    "and the document itself was loaded from there, so a request was made");
await shot("sign-in-redirect-left");

// ── ?admin=true is the way back to the form ─────────────────────────────────

await go(`${APP}/login?fakeSignInRedirect=university&admin=true`,
    `document.documentElement.dataset.instance === "loaded"`);
await wait(1200);

const admin = await at();
const adminScreen = await drawn();
check(admin.startsWith("/login"), `?admin=true stays on the sign-in screen (${admin})`);
check(adminScreen.password, "and the password form is drawn for whoever needs it");
await shot("sign-in-redirect-admin");

// ── a refused sign-in is explained, not bounced back ────────────────────────
//
// Without this suppression the person is sent back to a provider that still
// holds their session, is refused again, and returns here: a loop through
// somebody else's servers with nothing on the screen.

await go(`${APP}/login?fakeSignInRedirect=university&error=provider.unmapped`,
    `document.documentElement.dataset.instance === "loaded"`);
await wait(1200);

const refused = await at();
const refusedScreen = await drawn();
check(refused.startsWith("/login"), `a refused sign-in stays here to be read (${refused})`);
check(/nie daje Ci dost/i.test(refusedScreen.text),
    "and the reason is on the screen rather than in a loop");
await shot("sign-in-redirect-refused");

// ── a slug nobody offers is not acted on ────────────────────────────────────
//
// The Server filters the setting against the providers it actually offers, and
// the fake mirrors that. Without it, disabling a provider would turn this
// screen into a permanent dead end.

await go(`${APP}/login?fakeSignInRedirect=nobody-offers-this`,
    `document.documentElement.dataset.instance === "loaded"`);
await wait(1200);

const unknown = await at();
check(unknown.startsWith("/login"),
    `a redirect naming a provider nobody offers is ignored (${unknown})`);
check((await drawn()).password, "and the screen draws itself as it always did");

// ── somebody already signed in is not sent on a round trip ──────────────────

await go(`${APP}/login?fakeUser=john&fakeSignInRedirect=university`,
    `location.pathname !== "/login"`);
await wait(1200);

const signedIn = await at();
check(signedIn.startsWith("/activities"),
    `somebody already signed in goes to their screen, not to a provider (${signedIn})`);

// ── signing out is a way out, not a way round ───────────────────────────────
//
// **The fifth suppression, and the one that was missing.** Signing out sent
// people to `/login`, which is the screen the first check above watches leave
// for the provider — and the provider still holds a session, so it handed the
// same person straight back. On an installation that redirects there was no way
// to sign out at all. Reported from production on 2026-09-08.
//
// Continues from the tab the check above left signed in, which is the state
// this needs.

await click(`document.querySelector("[data-testid=user-menu]")`);
await click(`document.querySelector("[data-testid=logout]")`);
await wait(1500);

const out = await at();
check(out === "/", `signing out lands on the front page (${out})`);

// **And stays there.** What went wrong was not where it landed but what that
// screen then did, so a location read once proves nothing: the bounce is a
// redirect fired by `/login` after it had drawn.
await wait(1500);
const settled = await at();
check(settled === "/", `and is still there once the screen has had its say (${settled})`);
await shot("sign-in-redirect-signed-out");

// ── the registration screen, same rule ──────────────────────────────────────
//
// **The session the check above left behind has to go first.** `?fakeUser=`
// writes it to `sessionStorage`, and a signed-in tab is sent to /activities by
// this screen's own guard before the redirect is ever reached — which reads as
// the redirect not working. It is the trap `README.md` records for /login, and
// it is the same one here.

await evaluate(`sessionStorage.clear(); return true;`);

await go(`${APP}/register?fakeRegisterRedirect=university`,
    `document.documentElement.dataset.instance === "loaded" || location.pathname.startsWith("/identity/")`);
await wait(1200);

const registering = await at();
check(registering.startsWith("/identity/providers/university/challenge"),
    `the registration screen leaves for the provider too (${registering})`);

await go(`${APP}/register?fakeRegisterRedirect=university&admin=true`,
    `document.documentElement.dataset.instance === "loaded"`);
await wait(1200);

const registerAdmin = await at();
const registerScreen = await drawn();
check(registerAdmin.startsWith("/register"),
    `?admin=true reaches the registration screen (${registerAdmin})`);
// It reveals the refusal, not a form: `localRegistrationEnabled` still governs,
// and the fake ships it off.
check(/nie przyjmuje|organizator|dostawc/i.test(registerScreen.text),
    "and what it reveals is the honest refusal, not a form");
await shot("register-redirect-admin");

// ── and the manager can set it, and it survives leaving the screen ──────────

await go(`${APP}/manager/instance?fakeUser=john`,
    `document.body.innerText.includes("Instancja")`);
await wait(1500);

const picker = () => evaluate(`
    const area = document.querySelector("[data-testid=app-main]");
    const inputs = [...(area?.querySelectorAll("input") ?? [])];
    const ours = inputs.find(i => (i.getAttribute("aria-haspopup") === "listbox")
        && i.closest("[data-testid=field]")?.innerText.includes("logowania"));
    return { drawn: ours !== undefined, value: ours ? ours.value : null };
`);

const before = await picker();
check(before.drawn, "the manager is offered a picker for the sign-in redirect");
check(before.value === "Brak", `and it starts at none (${before.value})`);
await shot("sign-in-redirect-setting");

// Chosen, saved, and read back by **leaving the screen and coming back**, never
// by reloading: `go()` rebuilds the fake and would throw the saved value away,
// so a reload here would test the fixture rather than the save. It is the trap
// `verify-external-judging.mjs` records.
//
// **What this proves is the write and the answer, not the fake's own storage.**
// `visit()` is a `pushState`, so nothing is re-read from `sessionStorage` and
// the fake's `persist()` never takes part — measured by sabotage on 2026-09-06:
// deleting the field from `persist()` reddened nothing here. This harness cannot
// reach that path at all, because the one navigation that would re-read it is
// also the one that rebuilds the fixture.
await click(`[...document.querySelectorAll("[data-testid=field]")]`
    + `.find(f => f.innerText.includes("logowania")).querySelector("input")`);
await wait(400);
await click(`[...document.querySelectorAll("[role=option]")]`
    + `.find(o => o.textContent.includes("Uczelniane"))`);
await wait(400);
await click(`[...document.querySelectorAll("button")].find(b => b.dataset.testid === "save")`);
await wait(1200);

await visit("/manager/runners", `document.body.innerText.length > 0`);
await wait(600);
await visit("/manager/instance", `document.body.innerText.includes("Instancja")`);
await wait(1500);

const after = await picker();
check(after.value === "Uczelniane SSO",
    `the choice survives leaving the screen and coming back (${after.value})`);

// ── the sequence that used to destroy it ────────────────────────────────────
//
// **This is the whole reason the panel stopped seeding its form from the public
// answer.** With a redirect set and its provider switched off, that answer says
// nothing — so the picker read *Brak*, and any save of this tab wrote the blank
// back and cleared the column. An operator who disabled a provider for an hour
// of maintenance came back to an installation that had quietly stopped
// redirecting, and nothing anywhere said so.
//
// `visit()` throughout, never `go()`: `go()` rebuilds the fake, and
// `?fakeSignInRedirect=` would re-seed the very column under test.

/**
 * Switch `university` on or off from the providers screen.
 *
 * **The switch is in the edit dialog, not on the card**, and that dialog's Save
 * carries the same `data-testid` as the instance screen's — so both selectors
 * are scoped to the modal. Written once because this walk needs it twice, and
 * two copies differing by one word is how the second one rots.
 */
const setProviderEnabled = async () => {
    await visit("/manager/oidc", `document.body.innerText.includes("Uczelniane")`);
    await wait(1500);
    await click(`[...document.querySelectorAll("[data-testid=card]")]`
        + `.find(c => c.innerText.includes("university"))`
        + `?.querySelector("button")`);
    await wait(800);
    const found = await evaluate(`
        const boxes = [...document.querySelectorAll("[data-testid=modal] [data-testid=switch]")];
        const ours = boxes.find(b => b.innerText.includes("ekranie logowania"));
        if (!ours) return false;
        ours.querySelector("input").click();
        return true;
    `);
    await wait(400);
    await click(`[...document.querySelectorAll("[data-testid=modal] button")]`
        + `.find(b => b.dataset.testid === "save")`);
    await wait(1200);
    return found;
};

const toggled = await setProviderEnabled();
check(toggled !== false, "the provider can be switched off from its own screen");

await visit("/manager/instance", `document.body.innerText.includes("Instancja")`);
await wait(1500);

const off = await picker();
check(off.value !== "Brak",
    `a redirect whose provider is off does not read as none (${off.value})`);
check((off.value ?? "").includes("Uczelniane"),
    `and still names what is stored (${off.value})`);

const noted = () => evaluate(`
    const note = document.querySelector("[data-testid=sign-in-redirect-note]");
    return note === null ? null : note.innerText.replace(/\\s+/g, " ").slice(0, 200);
`);
const note = await noted();
check(note !== null, "and the screen says the redirect is not in force");
await shot("sign-in-redirect-provider-off");

// **The save that used to do the damage.** Something unrelated is changed and
// the tab is saved, exactly as an operator would.
// **One word, and no space in it.** The label reads *Pokazuj znak\u00a0w\u00a0aplikacji*
// on screen: Polish does not leave a one-letter word at the end of a line, so
// `w` carries a hard space and a needle written with an ordinary one matches
// nothing. Matching a word avoids the whole question.
await click(`[...document.querySelectorAll("[data-testid=switch]")]`
    + `.find(s => /znak/.test(s.textContent))?.querySelector("input")`);
await wait(300);
await click(`[...document.querySelectorAll("button")].find(b => b.dataset.testid === "save")`);
await wait(1500);

// **That the save worked, not only that the value survived.** A form that sends
// the redirect on every save is refused here — the slug names a provider that is
// off — so the setting would survive for the wrong reason, and a check reading
// only the picker would call that a pass.
const refusal = await evaluate(`
    const shown = document.querySelector("[data-testid=instance-error]");
    return shown ? shown.innerText.replace(/\\s+/g, " ").slice(0, 160) : null;
`);
check(refusal === null, `the save itself went through (${refusal ?? "no refusal"})`);

const survived = await picker();
check((survived.value ?? "").includes("Uczelniane"),
    `saving an unrelated switch leaves the redirect alone (${survived.value})`);
check(await noted() !== null, "and the note is still there after the save");

// **What a visitor is offered after this is not checked here, and cannot be.**
// Everything above runs signed in as `john`, so `/login` answers by sending the
// browser to `/activities` and the sign-in screen never draws. An assertion
// written here passed on a screen that had not rendered — measured 2026-09-06,
// where the whole body read `AlgoJudge` — which is a green that means nothing.
//
// So the fake's provider projection dropping a disabled registration is proved
// by the read above rather than by a screen: the state comes back `disabled`,
// which is the same list read the sign-in buttons are drawn from.

// Switched back on, the redirect resumes — which is the property the column
// keeping its value exists for.
await setProviderEnabled();

await visit("/manager/instance", `document.body.innerText.includes("Instancja")`);
await wait(1500);
const back = await picker();
check(back.value === "Uczelniane SSO",
    `switching the provider on puts the redirect back in force (${back.value})`);
check(await noted() === null, "and the note goes away with it");

report();
close();
