// The colour-scheme preference: still applied, still remembered, and no longer
// re-applied on every render of the header.
import { open, results } from "./harness.mjs";

const APP = process.env.APP ?? "http://localhost:5180";
const { send, evaluate, wait, go } = await open();
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

    const burger = document.querySelector("button[class*=mantine-Burger-root]");
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

report();
