// One setting, one store: what the application shell switches must still hold
// on a public page, and the other way round.
import { open, results } from "./harness.mjs";

const APP = process.env.APP ?? "http://localhost:5180";
const { send, evaluate, wait, go, click } = await open();
const { check, report } = results();

const scheme = () => evaluate(`return document.documentElement.getAttribute("data-mantine-color-scheme");`);
const text = () => evaluate(`return document.body.innerText;`);

await send("Page.setDeviceMetricsOverride", { width: 1400, height: 1000, deviceScaleFactor: 1, mobile: false });

await go(`${APP}/`, `document.body !== null`);
await evaluate(`localStorage.clear(); sessionStorage.clear(); return true;`);

// 1 — a visitor chooses, in the footer, which is the only switch they have.
await go(`${APP}/`, `document.body.innerText.includes("AlgoJudge")`);
check(await scheme() === "light", "a visitor starts in the light scheme");
await evaluate(`
    for (const [label, item] of [["Theme", "Dark"], ["Lang", "English"]]) {
        const menu = [...document.querySelectorAll("a, button")].find(e => e.textContent.trim() === label);
        menu.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
        await new Promise(r => setTimeout(r, 700));
        [...document.querySelectorAll("[role=menuitem]")].find(i => i.textContent.trim() === item).click();
        await new Promise(r => setTimeout(r, 900));
    }
    return true;
`);
await wait(1200);
check(await scheme() === "dark", "the footer switches the scheme");
check((await text()).includes("Privacy policy"), "and the language");

// 2 — signing in must not lose either. This is where the second store used to
//     win, by reapplying whatever it had kept.
await go(`${APP}/activities?fakeUser=amy`, `document.querySelector("[class*=AppShell-navbar]") !== null`);
await wait(1000);
check(await scheme() === "dark", "the application shell keeps the scheme chosen before signing in");
check((await text()).includes("Activities"), "and the language too");

// 3 — and back: the shell's own switch, seen by the visitor's shell after
//     signing out. No page shows the public shell to somebody signed in any
//     more, so this is the only way round the loop.
await evaluate(`document.querySelector("[aria-label='Toggle color scheme']").click(); return true;`);
await wait(1200);
check(await scheme() === "light", "the shell switches it back");

await click(`[...document.querySelectorAll("button")].find(b => (b.innerText ?? "").includes("Horsefighter"))`);
await click(`[...document.querySelectorAll("[role=menuitem]")].find(i => ["Logout", "Wyloguj"].includes(i.textContent.trim()))`);
await wait(2000);
check(await evaluate(`return location.pathname;`) === "/login", "signing out lands on the sign-in screen");
check(await scheme() === "light", "which shows the scheme the shell was left in");

report();
