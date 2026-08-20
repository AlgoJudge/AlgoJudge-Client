// The two dependency lists that changed shape: the activity filters must still
// refetch once and only once, and a link straight to a Runner must still open it.
import { open, results } from "./harness.mjs";

const APP = process.env.APP ?? "http://localhost:5180";
const { send, evaluate, wait, go, click } = await open();
const { check, report } = results();

await send("Page.setDeviceMetricsOverride", { width: 1400, height: 1400, deviceScaleFactor: 1, mobile: false });

// 1 — the activity filters, now listed as the arrays themselves.
await go(`${APP}/activities?fakeUser=amy`, `document.querySelectorAll("[class*=Card-root]").length > 0`);
const before = await evaluate(`return document.querySelectorAll("[class*=Card-root]").length;`);
check(before > 0, `the activity list loads (${before} shown)`);

// Watch for a list that never settles: a dependency changing identity on every
// render would refetch for ever, and the cards would keep being replaced.
await evaluate(`
    window.__churn = 0;
    const root = document.querySelector("main") ?? document.body;
    new MutationObserver(records => { window.__churn += records.length; }).observe(root, { childList: true, subtree: true });
    return true;
`);

// The filters are chips; ticking one is a click on its label.
const chip = await evaluate(`
    const label = document.querySelector("[class*=Chip-label]");
    return label ? label.textContent.trim() : null;
`);
check(Boolean(chip), `a filter is offered (${chip ?? "none"})`);
await click(`document.querySelector("[class*=Chip-label]")`);
await wait(2500);
const after = await evaluate(`return document.querySelectorAll("[class*=Card-root]").length;`);
check(after !== before, `ticking "${chip}" refetches the list (${before} then ${after})`);

await evaluate(`window.__churn = 0; return true;`);
await wait(3000);
const churn = await evaluate(`return window.__churn;`);
check(churn < 30, `and the list then stands still (${churn} mutations in three seconds)`);

// 2 — a link straight to one Runner, which is what the ref exists for.
await go(`${APP}/manager/runners?fakeUser=amy`, `document.querySelectorAll("tbody tr").length > 0`);
await click(`document.querySelector("tbody tr td")`);
const id = (await evaluate(`return location.search;`)).match(/runner=([^&]+)/)?.[1];
check(Boolean(id), `a Runner can be opened by clicking (${id ?? "none"})`);
await click(`[...document.querySelectorAll("button")].find(b => ["Back", "Wróć", "Powrót"].includes(b.textContent.trim()))`);

await go(`${APP}/manager/runners?runner=${id}`, `document.querySelectorAll("tbody tr").length > 0`);
await wait(2000);
check(await evaluate(`return document.querySelector("[class*=Modal-content]") !== null;`),
    "and arriving with that link opens the panel by itself");
check(await evaluate(`return location.search;`).then(s => s.includes(id)),
    "with the address left as the sender wrote it");

report();
