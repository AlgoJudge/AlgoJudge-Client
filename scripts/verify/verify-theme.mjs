// The colour-scheme preference: still applied, still remembered, no longer
// re-applied on every render of the header — and, at the foot of this file,
// legible once it is dark.
import { open, results } from "./harness.mjs";

const APP = process.env.APP ?? "http://localhost:5180";
const { send, evaluate, wait, go, shot } = await open();
const { check, report } = results();

await send("Page.setDeviceMetricsOverride", { width: 1400, height: 1000, deviceScaleFactor: 1, mobile: false });

await go(`${APP}/`, `document.body !== null`);
await evaluate(`localStorage.clear(); sessionStorage.clear(); return true;`);
await go(`${APP}/`, `document.body.innerText.includes("AlgoJudge")`);

const scheme = () => evaluate(`return document.documentElement.getAttribute("data-mantine-color-scheme");`);
check(await scheme() === "light", "the page starts in the light scheme");

// The footer's own theme menu, which is what a reader would use.
await evaluate(`
    const menu = [...document.querySelectorAll("a, button")].find(e => e.textContent.trim() === "Theme");
    menu.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    await new Promise(r => setTimeout(r, 700));
    [...document.querySelectorAll("[role=menuitem]")].find(i => i.textContent.trim() === "Dark").click();
    return true;
`);
await wait(1500);
check(await scheme() === "dark", "choosing Dark switches the scheme");
// Mantine's own key. There is no second store of ours beside it any more.
check(await evaluate(`return localStorage.getItem("mantine-color-scheme-value");`) === "dark",
    "and the choice is stored where Mantine keeps it");
check(await evaluate(`return localStorage.getItem("theme");`) === null,
    "with nothing written to a store of our own");

// Re-render the header without changing anything. The burger's own state is the
// cheapest way to force one, and it is in the document at every width.
const churn = await evaluate(`
    window.__writes = 0;
    window.__styles = 0;
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
        if (key.includes("mantine-color-scheme")) window.__writes++;
        return setItem.call(this, key, value);
    };
    new MutationObserver(records => {
        for (const record of records) {
            for (const node of record.addedNodes) {
                if (node.nodeName === "STYLE" && node.hasAttribute?.("data-mantine-disable-transition")) {
                    window.__styles++;
                }
            }
        }
    }).observe(document.head, { childList: true });

    const burger = document.querySelector("button[data-testid=burger]");
    for (let i = 0; i < 6; i++) {
        burger.click();
        await new Promise(r => setTimeout(r, 120));
    }
    await new Promise(r => setTimeout(r, 600));
    return { writes: window.__writes, styles: window.__styles, scheme: document.documentElement.getAttribute("data-mantine-color-scheme") };
`);
check(churn.writes === 0, `re-rendering the header stores nothing again (${churn.writes} writes)`);
check(churn.styles === 0, `and suppresses no transitions (${churn.styles} stylesheets)`);
check(churn.scheme === "dark", "the scheme is untouched by all of it");

// The preference outlives a reload, which is the whole point of storing it.
await go(`${APP}/`, `document.body.innerText.includes("AlgoJudge")`);
await wait(1200);
check(await scheme() === "dark", "the stored preference is applied again after a reload");

// A page with almost nothing on it: the footer belongs at the bottom of the
// window, not halfway up it with white space underneath.
await go(`${APP}/login`, `document.querySelector("input") !== null`);
const short = await evaluate(`
    const element = [...document.querySelectorAll("div")].find(d =>
        d.className && String(d.className).includes("footer"));
    const box = element.getBoundingClientRect();
    return {
        bottom: Math.round(box.bottom + window.scrollY),
        page: document.documentElement.scrollHeight,
        viewport: window.innerHeight,
        contentEnds: Math.round(element.getBoundingClientRect().top + window.scrollY),
    };
`);
check(short.page <= short.viewport + 2, `the short page does not scroll (${short.page} of ${short.viewport})`);
check(Math.abs(short.bottom - short.viewport) < 4,
    `and its footer ends at the bottom of the window (${short.bottom} of ${short.viewport})`);

// ── Legible in both schemes ─────────────────────────────────────────────────
//
// **Everything above this line passed while the two screens below were
// unreadable.** The suite proved the switch flips, the choice is stored and the
// header does not churn, and never read a colour — so `.problem` sat at 1.4:1
// for as long as it existed and nothing went red.
//
// Colours are read *computed*, from the browser, because that is the only thing
// that catches the shape of the fault that was here: `.active` asked for
// `var(--mantine-text-color)`, which Mantine does not define, so the declaration
// was dropped and the colour inherited. Nothing in the source says "wrong".

/**
 * Every card in the page's main region, with its contrast against the first
 * ancestor that actually paints a background — a Card's own is often
 * `transparent`, and comparing text against `transparent` measures nothing.
 *
 * No regular expression anywhere in here on purpose: this string travels
 * through a template literal into the page, and an escape that collapses on the
 * way turns a real reading into a silent zero.
 */
const CARD_CONTRAST = `
    const parse = (value) => {
        const open = value.indexOf("(");
        if (open < 0) return null;
        const parts = value.slice(open + 1, value.lastIndexOf(")"))
            .split("/").join(",").split(",").map(p => p.trim());
        const alpha = parts.length > 3
            ? (parts[3].endsWith("%") ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]))
            : 1;
        return { rgb: parts.slice(0, 3).map(parseFloat), alpha };
    };
    const luminance = (rgb) => {
        const v = rgb.map(c => c / 255).map(c => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
        return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
    };
    const ratio = (a, b) => {
        const x = luminance(a), y = luminance(b);
        return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
    };
    const hex = (rgb) => "#" + rgb.map(c => Math.round(c).toString(16).padStart(2, "0")).join("");
    const backgroundOf = (element) => {
        for (let node = element; node; node = node.parentElement) {
            const parsed = parse(getComputedStyle(node).backgroundColor);
            if (parsed && parsed.alpha > 0.5) return parsed.rgb;
        }
        return [255, 255, 255];
    };

    const main = document.querySelector("[data-testid=app-main]") ?? document.body;
    return [...main.querySelectorAll("[data-testid=card]")].map(card => {
        const foreground = parse(getComputedStyle(card).color).rgb;
        const background = backgroundOf(card);
        return {
            text: card.innerText.split("\\n")[0].slice(0, 40),
            fg: hex(foreground),
            bg: hex(background),
            ratio: Number(ratio(foreground, background).toFixed(2)),
        };
    });
`;

/**
 * **4.5**, and one number for every case rather than a table of exceptions.
 *
 * It is WCAG AA for body text, and the screens clear it with room: the weakest
 * pair on either page is 5.65:1. For scale, Mantine's own `c="dimmed"` on the
 * page background is 3.32:1 in light and 4.04:1 in dark — so this floor is
 * above "as quiet as the framework goes", which is what a card carrying a name
 * and a score should be.
 */
const FLOOR = 4.5;

// `amy` because these two screens are a participant's, and the least of what
// they need is somewhere to be. The minimum counts are the guard that matters:
// a selector that finds nothing has no worst case, and would otherwise pass.
const SCREENS = [
    ["activities", `${APP}/activities?fakeUser=amy`, `document.body.innerText.includes("Aktywno")`, 4],
    ["problems", `${APP}/activities/AMMPZ-2019/problems?fakeUser=amy`, `document.body.innerText.includes("Runda")`, 8],
];

for (const scheme of ["light", "dark"]) {
    // Written to Mantine's own key and picked up on load — the store the checks
    // above proved is the only one.
    await evaluate(`localStorage.setItem("mantine-color-scheme-value", ${JSON.stringify(scheme)}); return true;`);

    for (const [name, url, ready, atLeast] of SCREENS) {
        await go(url, ready);
        await wait(1500);
        await shot(`theme-${name}-${scheme}`);

        const cards = await evaluate(CARD_CONTRAST);
        check(cards.length >= atLeast,
            `${name} in ${scheme}: ${cards.length} cards to look at, at least ${atLeast} expected`);

        const worst = cards.reduce((a, b) => (a.ratio <= b.ratio ? a : b), { ratio: Infinity, fg: "-", bg: "-", text: "" });
        check(worst.ratio >= FLOOR,
            `${name} in ${scheme}: every card clears ${FLOOR}:1 — worst is ${worst.ratio}:1, ` +
            `${worst.fg} on ${worst.bg} (${JSON.stringify(worst.text)})`);
    }
}

// ── An installation's own colours ───────────────────────────────────────────
//
// **Read through a probe element, never off the custom property.** A custom
// property read with `getPropertyValue` comes back as whatever tokens were
// written — `var(--mantine-color-primaryLight-6)` — and comparing that to a hex
// would pass or fail on a spelling. Painting the expression onto an element and
// reading `backgroundColor` back is the browser's own answer, fully resolved,
// which is the same reason the contrast block above reads computed styles.
//
// `?fakeTheme=on` is a synthetic theme and deliberately nobody's brand: its only
// job is to prove that each token reaches the element it claims. A tasteful one
// would pass just as well while a token that went nowhere looked fine.

/** Whatever CSS expression is handed in, as the browser finally resolves it. */
const RESOLVE = `
    const hex = (value) => {
        const open = value.indexOf("(");
        if (open < 0) return value;
        const parts = value.slice(open + 1, value.lastIndexOf(")"))
            .split("/").join(",").split(",").slice(0, 3).map(p => parseFloat(p.trim()));
        return "#" + parts.map(c => Math.round(c).toString(16).padStart(2, "0")).join("");
    };
    const resolved = (expression) => {
        const probe = document.createElement("div");
        probe.style.position = "fixed";
        probe.style.opacity = "0";
        probe.style.pointerEvents = "none";
        probe.style.backgroundColor = expression;
        document.body.appendChild(probe);
        const value = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return hex(value);
    };
`;

/**
 * WCAG contrast between two `#rrggbb`, worked out here rather than in the page:
 * these two values have already been read out of the browser, and sending them
 * back in to be divided would be a round trip for arithmetic.
 */
function contrast(a, b) {
    const luminance = (colour) => {
        const channels = [1, 3, 5].map(i => parseInt(colour.slice(i, i + 2), 16) / 255)
            .map(c => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
        return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
    };
    const x = luminance(a), y = luminance(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** The values `FAKE_THEME` states, per scheme, and where each one has to land. */
const BRANDED = {
    light: {
        page: "#f3e5f5",
        surface: "#fffde7",
        main: "#fffde7",
        accent: "#ef6c00",
        secondary: "#00838f",
        text: "#311b92",
        dimmed: "#4a148c",
        border: "#ce93d8",
        link: "#2e7d32",
        primary: "#7b1fa2",
        nav: "#4a148c",
        navText: "#ffe082",
        header: "#ede7f6",
    },
    dark: {
        page: "#12081f",
        surface: "#1c1030",
        main: "#1c1030",
        accent: "#ffb74d",
        secondary: "#4dd0e1",
        text: "#ede7f6",
        dimmed: "#b39ddb",
        border: "#4527a0",
        link: "#a5d6a7",
        primary: "#ce93d8",
        nav: "#2a1a4a",
        navText: "#ffe082",
        header: "#1c1030",
    },
};

/**
 * The tokens, read where they are used rather than where they are declared.
 *
 * `primary` is the one that cannot be compared to a single variable: an operator
 * states one colour and ten shades are generated from it, so what is asserted is
 * that **the colour they asked for is one of the ten** — true whatever the
 * generator does with the other nine, and false the moment their value stops
 * reaching the ramp at all.
 */
const TOKENS = `
    ${RESOLVE}
    const shades = [];
    for (let i = 0; i < 10; i++) shades.push(resolved("var(--mantine-color-primary-" + i + ")"));

    const navbar = document.querySelector("[data-testid=app-navbar]");
    const main = document.querySelector("[data-testid=app-main]");
    const heading = document.querySelector("h1, h2, h3");
    // The navigation's own entries, by the class the module puts on them — the
    // first anchor in there is the instance mark's wrapper, which is deliberately
    // unstyled and reads as a browser default link.
    const entry = navbar && [...navbar.querySelectorAll("a")]
        .find(a => a.className && String(a.className).includes("link"));

    return {
        page: hex(getComputedStyle(document.body).backgroundColor),
        surface: resolved("var(--mantine-color-body)"),
        text: resolved("var(--mantine-color-text)"),
        dimmed: resolved("var(--mantine-color-dimmed)"),
        border: resolved("var(--mantine-color-default-border)"),
        link: resolved("var(--mantine-color-anchor)"),
        shades,
        // What an unprop-ed Button, a Badge and the pagination actually paint
        // with. The ramp existing is not the same fact as primaryColor pointing
        // at it, and only the second is what a reader sees.
        // (No backticks in here: this comment is inside a template literal, and
        // one would end it. It has cost two runs.)
        filled: resolved("var(--mantine-primary-color-filled)"),
        // The working area, which showed the page ground until 2026-08-30 and
        // put the rows on almost their own colour.
        main: main ? hex(getComputedStyle(main).backgroundColor) : "no main region",
        // A hover colour, so it is read as the variable rather than off an
        // element: CSS :hover does not answer a synthetic event, and a check
        // that dispatched one would be asserting nothing.
        accent: resolved("var(--aj-nav-accent)"),
        secondary: resolved("var(--aj-secondary)"),
        nav: navbar ? hex(getComputedStyle(navbar).backgroundColor) : "no navbar",
        navText: entry ? hex(getComputedStyle(entry).color) : "no navigation entry",
        body: getComputedStyle(document.body).fontFamily,
        headings: heading ? getComputedStyle(heading).fontFamily : "no heading",
    };
`;

for (const scheme of ["light", "dark"]) {
    await evaluate(`localStorage.setItem("mantine-color-scheme-value", ${JSON.stringify(scheme)}); return true;`);
    // **Waits for the installation to have answered, not for words on the
    // screen.** The defaults are drawn while that answer is in flight, so a
    // check that waited for text read the unbranded colours — and waiting longer
    // is a slower version of the same race rather than a fix for it.
    await go(`${APP}/activities?fakeUser=amy&fakeTheme=on`,
        `document.documentElement.dataset.instance === "loaded"`
        + ` && document.body.innerText.includes("Aktywno")`);
    await wait(400);
    await shot(`theme-branded-${scheme}`);

    const want = BRANDED[scheme];
    const got = await evaluate(TOKENS);

    for (const key of [
        "page", "surface", "text", "dimmed", "border", "link", "nav", "navText",
        "main", "accent", "secondary",
    ]) {
        check(got[key] === want[key], `${scheme}: the instance's ${key} is drawn — ${want[key]}, got ${got[key]}`);
    }

    check(got.shades.includes(want.primary),
        `${scheme}: the brand colour ${want.primary} is one of the ten shades — got ${got.shades.join(" ")}`);
    // **The colour they typed, not a neighbour of it.** A ramp is generated
    // around a value, so the one an operator states is rarely index 6 — and
    // index 6 is what a button is painted with unless the shade is pinned.
    check(got.filled === want.primary,
        `${scheme}: a button is painted the colour the instance stated — ` +
        `${want.primary}, got ${got.filled}`);

    // A family, not a file: `serif` and `monospace` are two of the four generic
    // names a theme may use without shipping a face, which is what lets this be
    // asserted without a font binary in the repository.
    check(got.body.includes("serif"), `${scheme}: the instance's body face is used — got ${got.body}`);
    check(got.headings.includes("monospace"),
        `${scheme}: and its heading face — got ${got.headings}`);

    // **The pair the theme actually decides.** The cards below carry palette
    // shades of their own, so their contrast is the same branded or not — which
    // makes them a guard rather than a measurement of this feature. Text on the
    // panel it is written on is the pair an operator changes, so it is read
    // here, from the values the browser resolved a moment ago.
    check(contrast(got.text, got.surface) >= FLOOR,
        `${scheme}: the instance's text clears ${FLOOR}:1 on its own panels — ` +
        `${contrast(got.text, got.surface).toFixed(2)}:1, ${got.text} on ${got.surface}`);
    check(contrast(got.dimmed, got.surface) >= FLOOR,
        `${scheme}: and so does its secondary text — ` +
        `${contrast(got.dimmed, got.surface).toFixed(2)}:1, ${got.dimmed} on ${got.surface}`);
    check(contrast(got.navText, got.nav) >= FLOOR,
        `${scheme}: and its navigation is legible on itself — ` +
        `${contrast(got.navText, got.nav).toFixed(2)}:1, ${got.navText} on ${got.nav}`);

    // The floor again, on the branded screen. A theme that reaches every element
    // and leaves one of them unreadable is a theme this suite has to fail.
    //
    // **And the rows themselves carry the instance's surface**, which they did
    // not until the two themes were photographed and these two screens came out
    // grey while everything around them had changed. A theme that stops at the
    // shell is half a theme, and nothing here said so.
    const cards = await evaluate(CARD_CONTRAST);
    check(cards.length >= 4, `${scheme}: ${cards.length} branded cards to look at`);
    // Two steps, not one: a finished activity sits on the surface itself and a
    // running one on the deeper step blended from it. What is asserted is that
    // no row is on a palette grey any more.
    const steps = await evaluate(`
        ${RESOLVE}
        return ["--aj-row", "--aj-row-hover", "--aj-row-active"]
            .map(name => resolved("var(" + name + ")"));
    `);
    check(cards.every(card => steps.includes(card.bg)),
        `${scheme}: every row is on one of the instance's surface steps ${steps.join(" ")} — ` +
        `got ${[...new Set(cards.map(card => card.bg))].join(" ")}`);
    const worst = cards.reduce((a, b) => (a.ratio <= b.ratio ? a : b), { ratio: Infinity, fg: "-", bg: "-" });
    check(worst.ratio >= FLOOR,
        `${scheme}: every branded card clears ${FLOOR}:1 — worst is ${worst.ratio}:1, ${worst.fg} on ${worst.bg}`);
}

// The public bar, which is on the signed-out shell rather than the application's.
//
// **The session is cleared first, and that is not tidiness.** `?fakeUser=` writes
// the account into `sessionStorage`, so `/login` with one still there redirects
// straight into the application — and the `header` element then found is
// `AppShell.Header`, whose background is the *surface* token. This check read
// `#fffde7` and called it a missing header colour until the session was cleared;
// the same mechanism cost `verify-maintenance` two red CI runs in August.
await evaluate(`
    localStorage.setItem("mantine-color-scheme-value", "light");
    sessionStorage.clear();
    return true;
`);
await go(`${APP}/login?fakeTheme=on`,
    `document.documentElement.dataset.instance === "loaded" && document.querySelector("input") !== null`);
await wait(400);
const header = await evaluate(`
    ${RESOLVE}
    // A header element, not a div: the public shell writes semantic markup.
    const bar = document.querySelector("header");
    const foot = [...document.querySelectorAll("div")].find(d =>
        d.className && String(d.className).includes("footer"));
    return {
        colour: bar ? hex(getComputedStyle(bar).backgroundColor) : "no header",
        foot: foot ? hex(getComputedStyle(foot).backgroundColor) : "no footer",
        // Says which shell this is, so the assertion below cannot pass by
        // reading the application's bar and calling it the public one.
        application: document.querySelector("[data-testid=app-navbar]") !== null,
    };
`);
check(!header.application, "the sign-in screen is the public shell, not the application's");
check(header.colour === BRANDED.light.header,
    `the public bar carries the instance's colour — ${BRANDED.light.header}, got ${header.colour}`);
check(header.foot === BRANDED.light.nav,
    `and its foot carries the navigation's — ${BRANDED.light.nav}, got ${header.foot}`);

// ── And an installation with no theme is untouched ──────────────────────────
//
// The other half of the promise, and the one that is easy to lose: absent means
// **the colour AlgoJudge ships**, not black and not empty. Nothing in this
// Client writes a default, so what is asserted is that the navigation is still
// Mantine's own blue and the page ground variable was never defined.
await go(`${APP}/activities?fakeUser=amy`,
    `document.documentElement.dataset.instance === "loaded"`
    + ` && document.body.innerText.includes("Aktywno")`);
await wait(400);
const plain = await evaluate(`
    ${RESOLVE}
    const navbar = document.querySelector("[data-testid=app-navbar]");
    return {
        nav: hex(getComputedStyle(navbar).backgroundColor),
        blue: resolved("var(--mantine-color-blue-filled)"),
        page: getComputedStyle(document.documentElement).getPropertyValue("--aj-page-bg").trim(),
    };
`);
check(plain.nav === plain.blue,
    `an unthemed installation keeps Mantine's blue navigation — ${plain.blue}, got ${plain.nav}`);
check(plain.page === "",
    `and defines no page-ground variable at all — got ${JSON.stringify(plain.page)}`);

report();
