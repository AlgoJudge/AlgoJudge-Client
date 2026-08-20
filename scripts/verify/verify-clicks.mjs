// The name opens the thing it names, on the four screens where it did not.
import { open, results } from "./harness.mjs";

const APP = process.env.APP ?? "http://localhost:5180";
const { send, evaluate, go, click } = await open();
const { check, report } = results();

const modal = () => evaluate(`
    const element = document.querySelector("[class*=Modal-content]");
    return element ? element.innerText.replace(/\\s+/g, " ").slice(0, 200) : null;
`);
/** Every clickable name must say so with the cursor, as the older screens do. */
const cursorOf = (locator) => evaluate(`
    const element = ${locator};
    return element ? getComputedStyle(element).cursor : null;
`);

await send("Page.setDeviceMetricsOverride", { width: 1600, height: 1100, deviceScaleFactor: 1, mobile: false });

// 1 — users: the displayed name opens the account.
await go(`${APP}/manager/users?fakeUser=amy`, `document.querySelectorAll("tbody tr").length > 0`);
const userName = `[...document.querySelectorAll("tbody tr p")].find(p => p.textContent.trim() === "Jan Kowalski")`;
check(await cursorOf(userName) === "pointer", "the account name shows a pointer");
await click(userName);
const account = await modal();
check(account !== null && /Kowalski/.test(account), "clicking it opens the account");

// 2 — grants: the name opens the grant, and the login is on the row.
await go(`${APP}/manager/grants?fakeUser=amy`, `document.querySelectorAll("tbody tr").length > 0`);
const rowText = await evaluate(`return document.querySelector("tbody tr").innerText.replace(/\\s+/g, " ");`);
check(/jkowalski|john|amy|twisniewski|anowak/.test(rowText), `the login is shown beside the name (${rowText.slice(0, 60)})`);
const grantName = `document.querySelector("tbody tr td p")`;
check(await cursorOf(grantName) === "pointer", "the name on a grant shows a pointer");
await click(grantName);
const grant = await modal();
check(grant !== null && /nadanie|grant/i.test(grant), "clicking it opens the grant editor");

// 3 — permission templates: the name opens the editor.
await go(`${APP}/manager/permission-templates?fakeUser=amy`, `document.body.innerText.includes("admin")`);
const templateName = `[...document.querySelectorAll("p")].find(p => p.textContent.trim() === "manager")`;
check(await cursorOf(templateName) === "pointer", "a template name shows a pointer");
await click(templateName);
const template = await modal();
check(template !== null && /szablon|template/i.test(template), "clicking it opens the template editor");

// 4 — submissions: the date opens the submission.
await go(`${APP}/manager/submissions?fakeUser=amy`, `document.querySelectorAll("tbody tr").length > 0`);
const date = `document.querySelector("tbody tr td span")`;
check(await cursorOf(date) === "pointer", "the date shows a pointer");
await click(date);
check(/^\/manager\/submissions\/.+/.test(await evaluate(`return location.pathname;`)),
    `clicking it opens the submission (${await evaluate(`return location.pathname;`)})`);

report();
