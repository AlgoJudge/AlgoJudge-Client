// The sessions tab: what is connected, what only signed in, and what the
// screen says when there is nothing to show.
import { open, results } from "./harness.mjs";


const APP = process.env.APP ?? "http://localhost:5180";
const { send, evaluate, wait, shot, go, click, tab } = await open();
const { check, report } = results();

/** Opens the account whose row contains this text, then its Sessions tab. */
const openSessions = async (rowText) => {
    await click(`[...document.querySelectorAll("tbody tr")]
        .find(r => r.innerText.includes(${JSON.stringify(rowText)}))
        ?.querySelector("button")`);
    await click(`[...document.querySelectorAll("[role=tab]")].find(t => ["Sesje", "Sessions"].includes(t.textContent.trim()))`);
    await wait(1600);
};
const panel = () => evaluate(`
    const modal = document.querySelector("[class*=Modal-content]");
    const rows = [...modal.querySelectorAll("tbody tr")].map(r => r.innerText.replace(/\\s+/g, " "));
    return { text: modal.innerText.replace(/\\s+/g, " "), rows };
`);

await send("Page.setDeviceMetricsOverride", { width: 1500, height: 1100, deviceScaleFactor: 1, mobile: false });

await go(`${APP}/manager/users?fakeUser=amy&includeBlocked=1`, `document.querySelectorAll("tbody tr").length > 0`);

// 1 — the signed-in manager's own account: connected, and marked as this one.
await openSessions("Horsefighter");
const mine = await panel();
check(mine.rows.length > 0, `Amy's own account lists sessions (${mine.rows.length})`);
// Mantine uppercases badge text, so these are matched case-insensitively.
check(/Aktywna|Active/i.test(mine.text), "one of them is marked active");
check(/ta sesja|this one/i.test(mine.text), "and the one doing the asking says so");
check(/×2/.test(mine.text), "two open connections are counted, not flattened to a flag");
check(/Bez połączenia|Not connected/i.test(mine.text),
    "a second session with nothing open is marked as such");
check(/\/api\/v1\//.test(mine.text), "the last request is shown as a path");
check(/Odczytano|Read at/.test(mine.text), "and the list says when it was read");
// A badge clips its own text, so "readable" has to be measured, not assumed.
const clipped = await evaluate(`
    const modal = document.querySelector("[class*=Modal-content]");
    return [...modal.querySelectorAll("[class*=Badge-label]")]
        .filter(b => b.scrollWidth > b.clientWidth + 1)
        .map(b => b.textContent.trim());
`);
check(clipped.length === 0, `no state is cut off${clipped.length ? ` (${clipped.join(", ")})` : ""}`);
await shot("ss-mine");

await click(`[...document.querySelectorAll("[class*=Modal-close]")][0]`);

// 2 — a blocked account: no sessions, and a reason rather than an empty table.
//     Blocked accounts are out of the list until the switch is turned on.
await click(`[...document.querySelectorAll("label, [class*=Switch-root]")]
    .find(e => /zablokow|blocked/i.test(e.textContent ?? ""))`);
await wait(2000);
await openSessions("Lis");
const blocked = await panel();
check(blocked.rows.length === 0, "a blocked account lists no sessions");
check(/Zablokowane konto|A blocked account/.test(blocked.text),
    "and the screen says why rather than showing an empty table");
await shot("ss-blocked");

report();
