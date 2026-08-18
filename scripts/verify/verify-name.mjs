// The instance names itself: beside the mark in both shells, and in the tab.
import { open, results } from "./harness.mjs";

import { writeFileSync } from "node:fs";

const APP = process.env.APP ?? "http://localhost:5180";
const { send, evaluate, wait, shot, go, tab } = await open();
const { check, report } = results();

const NAME = "Wydział Informatyki";

await send("Page.setDeviceMetricsOverride", { width: 1500, height: 1000, deviceScaleFactor: 1, mobile: false });

// 1 — the visitor's shell.
await go(`${APP}/`, `document.body !== null`);
await evaluate(`localStorage.clear(); sessionStorage.clear(); return true;`);
await go(`${APP}/`, `document.body.innerText.includes("AlgoJudge")`);
check(await evaluate(`
    const header = document.querySelector("header");
    return header ? header.innerText.includes(${JSON.stringify(NAME)}) : false;
`), "a visitor sees the instance name beside the mark");
check(await evaluate(`return document.title;`) === `AlgoJudge | ${NAME}`,
    `and the tab carries the product first (${await evaluate(`return document.title;`)})`);
await shot("nm-public");

// 2 — the application shell.
await go(`${APP}/activities?fakeUser=amy`, `document.querySelector("[class*=AppShell-navbar]") !== null`);
check(await evaluate(`
    const header = document.querySelector("[class*=AppShell-header]");
    return header ? header.innerText.includes(${JSON.stringify(NAME)}) : false;
`), "so does somebody signed in");
check(await evaluate(`
    const header = document.querySelector("[class*=AppShell-header]");
    const name = [...header.querySelectorAll("p")].find(p => p.textContent.trim() === ${JSON.stringify(NAME)});
    const box = name.getBoundingClientRect();
    return box.right < header.getBoundingClientRect().right;
`), "and it does not push the clock and the account menu off the header");
await shot("nm-shell");

// 3 — an installation nobody has named says only what software it is.
await go(`${APP}/?fakeName=off`, `document.body.innerText.includes("AlgoJudge")`);
await wait(1200);
check(await evaluate(`return document.title;`) === "AlgoJudge",
    `an unnamed installation is just the product (${await evaluate(`return document.title;`)})`);
check(!await evaluate(`
    const header = document.querySelector("header");
    return header ? header.innerText.includes(${JSON.stringify(NAME)}) : false;
`), "and the header shows nothing beside the mark");
await shot("nm-unnamed");

report();
