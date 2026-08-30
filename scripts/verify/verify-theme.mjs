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

report();
