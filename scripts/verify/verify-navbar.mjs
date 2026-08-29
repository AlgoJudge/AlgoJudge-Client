// A navigation with more entries than window: the middle scrolls, the mark and
// the foot links stay where they are, and the project is reachable from inside.
import { open, results } from "./harness.mjs";


const APP = process.env.APP ?? "http://localhost:5180";
const { send, evaluate, wait, shot, go } = await open();
const { check, report } = results();

// Deliberately short: this is the window the entries used to run off the bottom of.
await send("Page.setDeviceMetricsOverride", { width: 1400, height: 620, deviceScaleFactor: 1, mobile: false });

await go(`${APP}/manager?fakeUser=amy`, `document.querySelector("[data-testid=app-navbar]") !== null`);
await wait(1500);

const measure = `
    const navbar = document.querySelector("[data-testid=app-navbar]");
    const viewport = navbar.querySelector("[data-testid=scroll-viewport]");
    const mark = navbar.querySelector("img");
    const foot = [...navbar.querySelectorAll("a")].find(a => a.getAttribute("href") === "/terms");
    const inside = element => {
        if (!element) return false;
        const box = element.getBoundingClientRect();
        const bounds = navbar.getBoundingClientRect();
        return box.height > 0 && box.top >= bounds.top - 1 && box.bottom <= bounds.bottom + 1;
    };
    return {
        overflowing: viewport ? viewport.scrollHeight - viewport.clientHeight : 0,
        scrollTop: viewport?.scrollTop ?? -1,
        markVisible: inside(mark),
        footVisible: inside(foot),
        markTop: mark?.getBoundingClientRect().top ?? -1,
        footTop: foot?.getBoundingClientRect().top ?? -1,
        entries: [...navbar.querySelectorAll("a")].length,
    };
`;

const before = await evaluate(`return (() => { ${measure} })();`);
check(before.entries > 12, `the manager panel fills the navigation (${before.entries} links)`);
check(before.overflowing > 0, `and overflows it (${before.overflowing}px past the bottom)`);
check(before.markVisible, "the mark is visible without scrolling");
check(before.footVisible, "and so are the documents at the foot");
await shot("nb-top");

await evaluate(`
    document.querySelector("[data-testid=app-navbar] [data-testid=scroll-viewport]").scrollTop = 10000;
    return true;
`);
await wait(800);
const after = await evaluate(`return (() => { ${measure} })();`);
check(after.scrollTop > 0, `the middle scrolls (${Math.round(after.scrollTop)}px)`);
check(Math.abs(after.markTop - before.markTop) < 2, "the mark does not move with it");
check(Math.abs(after.footTop - before.footTop) < 2, "nor do the documents");
check(await evaluate(`
    const navbar = document.querySelector("[data-testid=app-navbar]");
    const last = [...navbar.querySelectorAll("[data-testid=scroll-viewport] a")].pop();
    const box = last.getBoundingClientRect();
    const bounds = navbar.getBoundingClientRect();
    return box.top >= bounds.top && box.bottom <= bounds.bottom + 1;
`), "and the last entry can be reached");
await shot("nb-scrolled");

// The project, beside the operator's documents.
const about = await evaluate(`
    const navbar = document.querySelector("[data-testid=app-navbar]");
    const link = [...navbar.querySelectorAll("a")].find(a => (a.getAttribute("href") ?? "").startsWith("http"));
    if (!link) return null;
    const documents = [...navbar.querySelectorAll("a")].filter(a => a.getAttribute("href") === "/terms");
    return {
        href: link.getAttribute("href"),
        target: link.getAttribute("target"),
        rel: link.getAttribute("rel"),
        label: link.textContent.trim(),
        sameStyle: documents.length === 1
            && getComputedStyle(link).fontSize === getComputedStyle(documents[0]).fontSize
            && getComputedStyle(link).color === getComputedStyle(documents[0]).color,
        first: link.compareDocumentPosition(documents[0]) & Node.DOCUMENT_POSITION_FOLLOWING ? true : false,
    };
`);
check(about !== null, "the project is linked from the navigation");
check(about.href === "https://algojudge.pl", `to the product's own site (${about.href})`);
check(about.target === "_blank" && about.rel === "noreferrer",
    "in a new tab, and without handing over the address it was opened from");
check(about.sameStyle, `drawn like the documents beside it (${about.label})`);
check(about.first, "and offered before them, as in the public footer");

report();
