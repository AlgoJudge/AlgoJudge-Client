// The shell follows the session: the same page, two chromes, and no flash of
// the wrong one on the way in. Plus the operator's documents, reachable from
// inside the application at last.
import { open, results } from "./harness.mjs";


const APP = process.env.APP ?? "http://localhost:5180";
const { send, evaluate, wait, shot, go, click } = await open();
const { check, report } = results();

const navbar = () => evaluate(`return document.querySelector("[class*=AppShell-navbar]") !== null;`);
const publicFooter = () => evaluate(`return [...document.querySelectorAll("div")].some(d =>
    d.className && String(d.className).includes("footer"));`);

await send("Page.setDeviceMetricsOverride", { width: 1400, height: 1200, deviceScaleFactor: 1, mobile: false });

// Counts the public shell being painted at any moment of a page's life, not
// only once it settles: a shell chosen before the session is known would show
// up here and nowhere else. Reset by every navigation, since each new document
// runs this again.
await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `
        window.__publicShell = 0;
        new MutationObserver(records => {
            for (const record of records) {
                for (const node of record.addedNodes) {
                    if (node.nodeType !== 1) continue;
                    const hit = node.matches?.('div[class*="footer"]') || node.querySelector?.('div[class*="footer"]');
                    if (hit) window.__publicShell++;
                }
            }
        }).observe(document, { childList: true, subtree: true });
    `,
});

await go(`${APP}/`, `document.body !== null`);
await evaluate(`localStorage.clear(); sessionStorage.clear(); return true;`);

// 1 — a visitor keeps the visitor's shell.
await go(`${APP}/`, `document.body.innerText.includes("Skąd wziąć konto")`);
check(!await navbar(), "a visitor gets no application navigation on the front page");
check(await publicFooter(), "and does get the public footer");

await go(`${APP}/privacy`, `document.body.innerText.length > 200`);
check(!await navbar(), "nor on a document they may read before having an account");
check(await publicFooter(), "which still carries the links to the others");

// 2 — signed in, the same two addresses are inside the application.
await go(`${APP}/?fakeUser=amy`, `document.querySelector("[class*=AppShell-navbar]") !== null`);
check(true, "signing in puts the front page inside the application shell");
check(!await publicFooter(), "with no second footer under it");
check(await evaluate(`return window.__publicShell;`) === 0,
    "and the visitor's shell was never painted on the way in");
await shot("s-home-signed-in");

await go(`${APP}/privacy`, `document.querySelector("[class*=AppShell-navbar]") !== null`);
check(await evaluate(`return window.__publicShell;`) === 0,
    "a document opened directly does not flash the visitor's shell either");

// 3 — the documents, quiet, at the foot of the navigation.
const legal = await evaluate(`
    const navbar = document.querySelector("[class*=AppShell-navbar]");
    const links = [...navbar.querySelectorAll("a")].filter(a =>
        ["/terms", "/privacy", "/cookies", "/accessibility"].includes(a.getAttribute("href")));
    if (links.length === 0) return null;
    const main = [...navbar.querySelectorAll("a")].find(a => a.getAttribute("href") === "/activities");
    const style = getComputedStyle(links[0]);
    const mainStyle = getComputedStyle(main);
    const navBox = navbar.getBoundingClientRect();
    return {
        count: links.length,
        labels: links.map(a => a.textContent.trim()),
        size: parseFloat(style.fontSize),
        mainSize: parseFloat(mainStyle.fontSize),
        weight: Number(style.fontWeight),
        mainWeight: Number(mainStyle.fontWeight),
        colour: style.color,
        mainColour: mainStyle.color,
        icons: links.reduce((n, a) => n + a.querySelectorAll("svg").length, 0),
        // How far down the navigation the block starts, as a fraction.
        top: (links[0].getBoundingClientRect().top - navBox.top) / navBox.height,
    };
`);
check(legal !== null, "the documents are in the navigation");
check(legal.count === 4, `all of them (${legal.labels.join(", ")})`);
check(legal.top > 0.6, `at the foot of it (${Math.round(legal.top * 100)}% down)`);
check(legal.icons === 0, "with no icons");
check(legal.weight < legal.mainWeight, `lighter than the entries above (${legal.weight} against ${legal.mainWeight})`);

// 3b — the entry you are standing on is marked, and nothing else is. Untested
// until 2026-08-29, when the class carrying it stopped being applied and only
// an assertion about a neighbouring font weight noticed.
await go(`${APP}/activities?fakeUser=amy`, `document.querySelector("[class*=AppShell-navbar]") !== null`);
const marked = await evaluate(`
    const navbar = document.querySelector("[class*=AppShell-navbar]");
    const links = [...navbar.querySelectorAll("a")].filter(a => /_link_/.test(a.className));
    const here = links.find(a => a.getAttribute("href") === "/activities");
    const other = links.find(a => a.getAttribute("href") !== "/activities");
    if (!here || !other) return null;
    return {
        active: here.className.split(" ").includes("active"),
        hereBackground: getComputedStyle(here).backgroundColor,
        otherBackground: getComputedStyle(other).backgroundColor,
        hereColour: getComputedStyle(here).color,
        otherColour: getComputedStyle(other).color,
    };
`);
check(marked !== null, "the navigation has entries to compare");
check(marked.active, "the entry for the page you are on is marked active");
check(marked.hereBackground !== marked.otherBackground,
    `and is drawn differently from the others (${marked.hereBackground} against ${marked.otherBackground})`);
check(marked.hereColour !== marked.otherColour, "in its own colour too");
check(legal.size < legal.mainSize, `and smaller (${legal.size}px against ${legal.mainSize}px)`);
check(legal.colour !== legal.mainColour, `in a quieter colour (${legal.colour} against ${legal.mainColour})`);
await shot("s-navbar-legal");

// 4 — and they work.
await click(`[...document.querySelectorAll("a")].find(a => a.getAttribute("href") === "/cookies")`);
await wait(1500);
check(await evaluate(`return location.pathname;`) === "/cookies", "following one opens the document");
check(await navbar(), "without leaving the application shell");

// 5 — collapsed, where there is no room for words and no icon to fall back on.
await click(`[...document.querySelectorAll("a")].find(a => (a.innerText ?? "").trim().startsWith("Zwiń")
    || (a.innerText ?? "").trim().startsWith("Collapse"))`);
await wait(1200);
check(await evaluate(`
    const navbar = document.querySelector("[class*=AppShell-navbar]");
    return [...navbar.querySelectorAll("a")].every(a => a.getAttribute("href") !== "/terms");
`), "a collapsed navigation drops them rather than showing four blanks");
await shot("s-navbar-collapsed");

// 6 — the sign-in screen. Signed in it is not a screen at all: it sends the
//     reader on, which is why this has to be asked with the session gone.
// Waits for the decision, not for its outcome: either the redirect has happened
// or the form is on screen. `document.body !== null` was true before the session
// had resolved, so this read the address mid-flight and failed about one run in
// four.
await go(`${APP}/login`,
    `location.pathname !== "/login" || document.querySelector("input[type=password]") !== null`);
check(await evaluate(`return location.pathname;`) !== "/login",
    "somebody already signed in is sent away from the sign-in screen");

await evaluate(`localStorage.clear(); sessionStorage.clear(); return true;`);
await go(`${APP}/login`, `document.querySelector("input[type=password]") !== null`);
check(!await navbar(), "and a visitor gets it in the visitor's shell");
check(await publicFooter(), "with the public footer under it");

report();
