// Closing the Runner panel must take the Runner out of the address too.
import { open, results } from "./harness.mjs";

const APP = process.env.APP ?? "http://localhost:5180";
const { send, evaluate, go, click } = await open();
const { check, report } = results();

/** A real click where the element actually is; a synthetic one misses rows. */
const address = () => evaluate(`return location.search;`);
const panelOpen = () => evaluate(`return document.querySelector("[class*=Modal-content]") !== null;`);

await send("Page.setDeviceMetricsOverride", { width: 1400, height: 1000, deviceScaleFactor: 1, mobile: false });

await go(`${APP}/manager/runners?fakeUser=amy`, `document.querySelectorAll("tbody tr").length > 0`);
check(true, "the Runner list opens");

await click(`document.querySelector("tbody tr td")`);
check(/runner=/.test(await address()), `opening one puts it in the address (${await address()})`);
check(await panelOpen(), "and opens the panel");

// An attachment tab, which is the only thing here that reads stored bytes.
//
// **This was missing until 2026-08-12**, and its absence mattered: the panel
// stopped fetching through a dedicated endpoint and started reading
// `GET /files/{id}` like every other stored file, so the fake had to seed those
// bytes into the shared store instead of a private map of its own. Every check
// above passed throughout, because none of them ever opened a file. Two halves
// of the fake disagreeing is exactly what this suite is for.
await click(`[...document.querySelectorAll("[role=tab]")].find(t => /lscpu/.test(t.textContent))`);

check(/file=/.test(await address()), `the tab is in the address too (${await address()})`);

// **The visible one.** Mantine keeps every panel mounted, so the first `code`
// in the modal is the public key on the General tab — which is how the first
// version of this check passed while looking at entirely the wrong element.
const shown = await evaluate(`
    const blocks = [...document.querySelectorAll("[class*=Modal-content] code, [class*=Modal-content] pre")]
        .filter(element => element.offsetParent !== null);
    return blocks.length ? blocks[blocks.length - 1].textContent.trim() : "";
`);
check(shown.length > 0, "opening an attachment tab shows its contents");
check(/Architecture|CPU/.test(shown), `and they are the file's own bytes (${shown.slice(0, 40).replace(/\n/g, " ")}…)`);

await click(`[...document.querySelectorAll("button")].find(b => ["Back", "Wróć", "Powrót"].includes(b.textContent.trim()))`);
check(!await panelOpen(), "Back closes the panel");
check(!/runner=/.test(await address()), `and takes it out of the address (${await address() || "empty"})`);

report();
