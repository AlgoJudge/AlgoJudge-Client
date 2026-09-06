// The introduction above an installation's own front page: whether it is drawn,
// who sees it, what it links to, and the typeface the whole Client now ships.
//
// The one assertion here that is not about the hero is the registration button,
// and it is the reason this file exists at all: a way in may now be a provider
// rather than a local sign-up form, and nothing else in the suite would notice
// if that reverted to reading one flag.
import { open, results } from "./harness.mjs";

const APP = process.env.APP ?? "http://localhost:5180";
const { send, evaluate, wait, shot, go, close } = await open();
const { check, report } = results();

await send("Page.setDeviceMetricsOverride",
    { width: 1400, height: 1000, deviceScaleFactor: 1, mobile: false });

const HERO = `document.querySelector("[data-testid=home-hero]")`;
const hero = () => evaluate(`return ${HERO} !== null;`);

// A signed-out visitor with no flags: the shipped state.
await go(`${APP}/`, `document.documentElement.dataset.instance === "loaded"`);
await evaluate(`localStorage.clear(); sessionStorage.clear(); return true;`);
await go(`${APP}/`, `document.documentElement.dataset.instance === "loaded"`);
await wait(1200);

check(await hero(), "a signed-out visitor is told what the software is");

// **Above the instance's own document, and measured rather than assumed.** The
// order in the markup is not the order on the screen — a container, a grid or a
// flex `order` can put either first, and this feature is entirely about which
// one a reader meets first.
const above = await evaluate(`
    const intro = ${HERO};
    const heading = [...document.querySelectorAll("h1")]
        .find(h => /instancja|instance/i.test(h.textContent));
    if (!intro || !heading) return null;
    return intro.getBoundingClientRect().top < heading.getBoundingClientRect().top;
`);
check(above === true, `and it sits above the installation's own front page (${above})`);
await shot("hero-anonymous");

// The two links out. Both leave the application, so both are read from the
// anchor rather than followed: a check that navigated away would be measuring
// GitHub's availability.
const links = await evaluate(`
    const inside = [...${HERO}.querySelectorAll("a")].map(a => a.href);
    return {
        organisation: inside.some(h => h === "https://github.com/AlgoJudge"),
        project: inside.some(h => h === "https://algojudge.pl/"
            || h === "https://algojudge.pl"),
        blank: [...${HERO}.querySelectorAll("a")]
            .every(a => a.target !== "_blank" || a.rel.includes("noopener")),
    };
`);
check(links.organisation, "the badge leads to the organisation on GitHub");
check(links.project, "and the link leads to the project's own site");
check(links.blank, "and every window it opens is opened with rel=noopener");

// **One way in, not two.** The page carried a `Sign in` button of its own
// before the introduction had one, and leaving both draws two identical
// buttons going to the same screen — which reads as a question about which
// of them is the real one.
// Counted by test id rather than by address: the installation's own front
// page links to `/login` too, and that link is the operator's text rather than
// this page's furniture. Two anchors to one screen is only a defect when the
// product drew both of them.
const SIGN_IN_BELOW = `document.querySelectorAll("[data-testid=sign-in]").length`;
const waysIn = await evaluate(`return ${SIGN_IN_BELOW};`);
check(waysIn === 1,
    `and exactly one of them, not the page's own button beside the hero's (${JSON.stringify(waysIn)})`);

// ── Who sees it ──────────────────────────────────────────────────────────────

await go(`${APP}/?fakeHero=off`, `document.documentElement.dataset.instance === "loaded"`);
await wait(1000);
check(!await hero(), "an installation that switched it off shows its own page alone");
const waysInAlone = await evaluate(`return ${SIGN_IN_BELOW};`);
check(waysInAlone === 1,
    `and the page's own way in comes back, so switching it off strands nobody (${JSON.stringify(waysInAlone)})`);

await evaluate(`sessionStorage.clear(); return true;`);
await go(`${APP}/activities?fakeUser=amy`, `document.body.innerText.length > 0`);
await go(`${APP}/`, `document.body.innerText.length > 0`);
await wait(1200);
check(!await hero(), "somebody signed in gets their activities, not an introduction");
await evaluate(`sessionStorage.clear(); return true;`);

// ── The changed assumption ───────────────────────────────────────────────────

const REGISTER = `[...document.querySelectorAll("a")]
    .filter(a => /\\/register$/.test(a.getAttribute("href") ?? "")).length`;

await go(`${APP}/?fakeRegistration=off&fakeRegisterRedirect=off`,
    `document.documentElement.dataset.instance === "loaded"`);
await wait(1000);
check(await evaluate(`return ${REGISTER};`) === 0,
    "an installation with no way in at all offers no way in");

// The case the change exists for: sign-ups are closed locally and a provider
// takes them. Reading `localRegistrationEnabled` alone hides the only door.
await go(`${APP}/?fakeRegistration=off&fakeRegisterRedirect=university`,
    `document.documentElement.dataset.instance === "loaded"`);
await wait(1000);
const offered = await evaluate(`return ${REGISTER};`);
check(offered > 0,
    `a provider is a way in, so the invitation is drawn (${offered} link(s))`);
check(await evaluate(`
    const bar = document.querySelector("header");
    return [...bar.querySelectorAll("a")]
        .some(a => /\\/register$/.test(a.getAttribute("href") ?? ""));
`), "and the bar offers it too, not only the introduction");
await shot("hero-registration-by-provider");

// ── The bar marks where the reader is ────────────────────────────────────────

const marked = label => evaluate(`
    const bar = document.querySelector("header");
    const entry = [...bar.querySelectorAll("a")]
        .find(a => a.textContent.trim() === ${JSON.stringify(label)});
    return entry ? entry.className.split(/\\s+/).includes("active") : null;
`);

await go(`${APP}/`, `document.documentElement.dataset.instance === "loaded"`);
await wait(800);
check(await marked("Strona główna") === true, "the front page is marked in the bar");
check(await marked("Logowanie") === false, "and the entry the reader is not on is not");

// **The entry the reader is not on stays unmarked**, which is the half a
// `NavLink` can get wrong by matching too widely. It does not here: React
// Router requires a segment boundary, so `to="/"` matches `/` and nothing
// under it — `end` beside it states the intent and, measured, changes nothing
// on this route table.
await go(`${APP}/login`, `document.querySelector("input[type=password]") !== null`);
await wait(800);
check(await marked("Strona główna") === false,
    "and the front page is not marked from the sign-in screen");
check(await marked("Logowanie") === true, "which is marked instead");
await shot("hero-active-nav");

// ── The typeface ─────────────────────────────────────────────────────────────

// **`document.fonts.check()` cannot answer this, and a sabotage is what said
// so.** It returns `true` for a family nothing defines — measured:
// `check("1em Nonexistent-Face-XYZ")` is `true` — because the question it
// answers is "can this text be painted", and a system fallback always can. The
// first draft of this check asked it and would have passed with the faces
// deleted. The font *set* is the thing that knows.
const faces = await evaluate(`
    await document.fonts.ready;
    return {
        body: getComputedStyle(document.body).fontFamily,
        lato: [...document.fonts]
            .filter(f => f.family.replace(/"/g, "") === "Lato" && f.status === "loaded")
            .map(f => f.weight).sort(),
    };
`);
check(/^Lato/.test(faces.body), `the product's own face is asked for — got ${faces.body}`);
// **Four, not two, and a sabotage is what said so.** There are two weights and
// two subsets, so four files — and counting weights alone passed with the two
// `latin` files pointed at nothing, because the `latin-ext` pair still answered
// for the same two weights. Without `latin-ext` every Polish diacritic falls
// back mid-word; without `latin` everything else does. The screens are Polish,
// so both are in use here and both must have arrived.
check(faces.lato.length === 4 && faces.lato.join() === "400,400,700,700",
    `and all four faces loaded from this origin — got [${faces.lato}]`);

// An installation that states a face still wins: the product's is a default,
// merged before the instance's rather than after it.
await go(`${APP}/?fakeTheme=on`, `document.documentElement.dataset.instance === "loaded"`);
await wait(1200);
const themed = await evaluate(`return getComputedStyle(document.body).fontFamily;`);
check(/^"?serif"?/.test(themed),
    `an installation's own face still beats the product's — got ${themed}`);

// ── It fits, at the widths people actually read it at ───────────────────────
//
// **A horizontal scrollbar is the failure this shape invites.** Two columns, a
// wide picture and an unbreakable heading each want more room than a telephone
// has, and the way it goes wrong is a page that scrolls sideways rather than
// one that looks obviously broken. Measured on the document, so it catches a
// child that overflows its container as well as one that overflows the screen.
for (const scheme of ["light", "dark"]) {
    await evaluate(
        `localStorage.setItem("mantine-color-scheme-value", ${JSON.stringify(scheme)}); return true;`);
    for (const width of [390, 768, 1280]) {
        await send("Page.setDeviceMetricsOverride",
            { width, height: 900, deviceScaleFactor: 1, mobile: width < 500 });
        await go(`${APP}/`, `document.documentElement.dataset.instance === "loaded"`);
        await wait(900);
        const fit = await evaluate(`
            const root = document.documentElement;
            return {
                scheme: root.getAttribute("data-mantine-color-scheme"),
                overflow: root.scrollWidth - root.clientWidth,
                hero: document.querySelector("[data-testid=home-hero]") !== null,
            };
        `);
        check(fit.hero && fit.scheme === scheme && fit.overflow <= 1,
            `${scheme} at ${width}px: drawn, in the right scheme, and no sideways scroll `
            + `(${fit.scheme}, overflow ${fit.overflow}px)`);
        await shot(`hero-${scheme}-${width}`);
    }
}

report();
close();
