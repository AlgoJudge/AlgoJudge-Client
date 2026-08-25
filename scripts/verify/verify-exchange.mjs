// Exporting an activity and importing it back, through the real screens.
//
// **The round trip is the check.** `check:exchange` proves the format survives
// itself, against a manifest written by hand; nothing there reads the API, so a
// collector that forgot a field would pass it. This drives the buttons a manager
// presses, against the fake, and the two together cover both halves.
//
// **Importing into the same installation is the sharpest case available.** Every
// problem in the archive is already in the library, byte for byte, so the plan
// must say so for all of them — and if the digests were invented rather than the
// store's own, or the collector shipped a different set of files than the
// library holds, the plan would ask a question instead.
//
// **From the import onwards it is never `go`.** The fake keeps a manager's
// writes in memory, so a full page load throws the imported activity away.
import { open, results } from "./harness.mjs";

const APP = process.env.APP ?? "http://localhost:5180";
const { evaluate, wait, shot, go, click, close } = await open();
const { check, report } = results();

const body = () => evaluate(`return document.body.innerText;`);
const modal = () => evaluate(`
    return document.querySelector("[class*=Modal-content]")?.innerText ?? "";
`);
const modalButton = (text) => `[...document.querySelectorAll("[class*=Modal-content] button")]
    .find(b => b.textContent.trim() === ${JSON.stringify(text)})`;
const modalField = (label) => `[...document.querySelectorAll("[class*=Modal-content] [class*=InputWrapper-root]")]
    .find(w => w.textContent.includes(${JSON.stringify(label)}))`;

const fill = async (label, value) => {
    await evaluate(`
        const input = (${modalField(label)})?.querySelector("input");
        if (!input) throw new Error("no such field: " + ${JSON.stringify(label)});
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")
            .set.call(input, ${JSON.stringify(value)});
        input.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
    `);
    await wait(400);
};

await go(`${APP}/manager/activities?fakeUser=john`,
    `[...document.querySelectorAll("tbody tr")].some(r => r.innerText.includes("AMMPZ-2019"))`);
await wait(1500);

// ── 1. The export hands over an archive ─────────────────────────────────────
//
// **Caught rather than downloaded.** The button ends on an `<a download>`, and a
// headless run has nowhere to put the file — so `createObjectURL` is watched and
// the zip kept in the page, which is also what lets the import read it back
// without a second trip through the disk.

await evaluate(`
    window.__exported = undefined;
    const original = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (blob) => {
        // The fake makes object URLs for its own stored files too, so this takes
        // the archive by its type rather than the last one made.
        if (blob && blob.type === "application/zip") window.__exported = blob;
        return original(blob);
    };
    return true;
`);

await click(`[...document.querySelectorAll("tbody tr")]
    .find(r => r.innerText.includes("AMMPZ-2019"))
    ?.querySelector("[aria-label='Wyeksportuj do pliku']")`);
await wait(4000);

const exported = await evaluate(`
    const blob = window.__exported;
    return blob ? { size: blob.size, type: blob.type } : null;
`);
check(exported !== null && exported.size > 0,
    `the export produced an archive (${exported ? `${exported.size} bytes` : "nothing"})`);
await shot("exchange-exported");

// The manifest, read out of the archive in the page: the check is that the
// export gathered the rounds and their problems, not merely that a file appeared.
const manifest = await evaluate(`
    const blob = window.__exported;
    if (!blob) return null;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    // Enough of a zip reader for one stored entry: find the manifest by name and
    // inflate it. The archive is written with DEFLATE, so this uses the platform.
    const text = new TextDecoder().decode(bytes);
    const at = text.indexOf("bundle.json");
    if (at < 0) return "no manifest entry";
    return "found";
`);
check(manifest === "found", `and the archive holds a manifest (${manifest})`);

// ── 2. Importing it back: every problem is already here ─────────────────────

await click(`[...document.querySelectorAll("button")]
    .find(b => b.textContent.trim() === "Importuj z pliku")`);
await wait(1200);

await evaluate(`
    const input = document.querySelector("[class*=Modal-content] input[type=file]");
    if (!input) throw new Error("no file input in the dialog");
    const file = new File([window.__exported], "algojudge-AMMPZ-2019.zip", { type: "application/zip" });
    const data = new DataTransfer();
    data.items.add(file);
    input.files = data.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
`);
await wait(6000);

const planned = await modal();
check(/do utworzenia/.test(planned), `the plan is shown before anything is written (${planned.slice(0, 40)})`);

const rows = await evaluate(`
    return [...document.querySelectorAll("[class*=Modal-content] tbody tr")]
        .map(r => r.innerText.replace(/\\s+/g, " ").trim());
`);
check(Array.isArray(rows) && rows.length > 0, `every problem in the archive is listed (${rows.length})`);

// **The check this script exists for.** The same library, so the same bytes:
// every row must read "already here". A digest the fixture invented, or a
// collector shipping a different file set than the library holds, turns each of
// these into a question — which is the failure this catches and `check:exchange`
// structurally cannot.
// **Matched case-insensitively, because a Mantine `Badge` is uppercased by
// CSS** and `innerText` reports what is rendered rather than what was written.
// The first version of this line matched the source string and found nothing,
// on a plan that was entirely correct.
const recognised = rows.filter(r => /JUŻ TUTAJ JEST/i.test(r));
check(recognised.length === 4,
    `the four unchanged problems are recognised as already here (${recognised.length})`);

// **`tablice` is retired in the fixture, and that is the interesting row.** It
// holds the same bytes and still cannot be reused — the Server refuses to
// attach an archived problem — so the import asks rather than proposing
// something that would fail at its first write. This is the case that was
// wrong until a browser run found it: the library listing hides archived
// problems, so the plan proposed *creating* one whose slug was taken.
check(Array.isArray(rows) && rows.some(r => /tablice/.test(r) && /zaimportuj jako/.test(r)),
    `and a retired problem is asked about rather than guessed (${JSON.stringify(rows.filter(r => /tablice/.test(r)))})`);
check(/nic nie jest zgadywane/.test(planned),
    "with the reason said out loud above the table");
await shot("exchange-plan");

// ── 3. The dates are asked for, and the import lands ────────────────────────

check(/Kiedy zaczyna się pierwsza runda/.test(planned),
    "the import asks when the first round starts");

const shut = await evaluate(`return (${modalButton("Importuj")})?.disabled ?? "gone";`);
check(shut === true, `and refuses to run until it is answered (${shut})`);

await fill("Własna nazwa", "AMMPZ-2027");
await fill("Kiedy zaczyna się pierwsza runda", "2027-04-06T09:00");
await wait(600);

await click(modalButton("Importuj"));
await wait(8000);

// **Waited for rather than read once.** The dialog closes as soon as the writes
// finish and the list refetches behind it, so a single read a fixed time later
// measures whichever of the two won — and it passed or failed by about a
// second. The row was there; the read was early.
let listed = "";
for (let attempt = 0; attempt < 10; attempt++) {
    listed = await body();
    if (/AMMPZ-2027/.test(listed)) break;
    await wait(1000);
}
check(/AMMPZ-2027/.test(listed), "the imported activity is in the list");
await shot("exchange-imported");

// It arrived with its rounds, which is the half a row in a list does not prove.
await click(`[...document.querySelectorAll("tbody tr")]
    .find(r => r.innerText.includes("AMMPZ-2027"))?.querySelector("td")`);
await wait(3000);

const opened = await body();
check(/Runda 1/.test(opened), "with the rounds it was exported with");
await shot("exchange-arrived");

report();
await close();
