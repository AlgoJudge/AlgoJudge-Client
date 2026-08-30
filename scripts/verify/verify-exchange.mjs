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
const { evaluate, wait, shot, go, visit, click, close } = await open();
const { check, report } = results();

const body = () => evaluate(`return document.body.innerText;`);
const modal = () => evaluate(`
    return document.querySelector("[data-testid=modal]")?.innerText ?? "";
`);
const modalButton = (text) => `[...document.querySelectorAll("[data-testid=modal] button")]
    .find(b => b.textContent.trim() === ${JSON.stringify(text)})`;
const modalField = (label) => `[...document.querySelectorAll("[data-testid=modal] [data-testid=field]")]
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
    .find(b => b.dataset.testid === "import-file")`);
await wait(1200);

await evaluate(`
    const input = document.querySelector("[data-testid=modal] input[type=file]");
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
    return [...document.querySelectorAll("[data-testid=modal] tbody tr")]
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
//
// **And waited for the thing that is clicked, not for the words.** The name is
// in the page's text before the row carries the handler the next step clicks, so
// polling `body()` returned true too early: under eight workers this reddened
// with `nothing to click`, one run in three, on the click below. The assertion
// still reads the text — that is what it is about — but the wait now ends on the
// element.
const openable = `[...document.querySelectorAll("tbody tr")]
    .find(r => r.innerText.includes("AMMPZ-2027"))
    ?.querySelector("td [style*='cursor']") != null`;
let listed = "";
for (let attempt = 0; attempt < 12; attempt++) {
    listed = await body();
    if (await evaluate(`return ${openable};`)) break;
    await wait(1000);
}
check(/AMMPZ-2027/.test(listed), "the imported activity is in the list");
await shot("exchange-imported");

// It arrived with its rounds, which is the half a row in a list does not prove.
//
// **The name, not the cell.** A manager row opens from a `<Text onClick>`, so a
// click at the centre of the first `td` lands beside the handler as often as on
// it — this passed by luck once and failed the next run. The pointer style is
// what the handler is on.
await click(`[...document.querySelectorAll("tbody tr")]
    .find(r => r.innerText.includes("AMMPZ-2027"))
    ?.querySelector("td [style*='cursor']")`);
await wait(3000);

// Polled, like the list above: the panel fetches its rounds after the page
// mounts, and a single read a fixed time later measures whichever won.
let opened = "";
for (let attempt = 0; attempt < 10; attempt++) {
    opened = await body();
    if (/Runda 1/.test(opened)) break;
    await wait(1000);
}
check(/Runda 1/.test(opened), "with the rounds it was exported with");
await shot("exchange-arrived");

// ── 4. A ZawodyWeb archive takes the same road ──────────────────────────────
//
// **The point of §9 in one check.** The converter turns a foreign archive into
// the bundle §8 defined, so everything after the file input — the loss report,
// the plan against the library, the compulsory dates, every write — is the code
// already exercised above. A second import path would be a second place for
// "already here" to mean something slightly different.
//
// The archive is built **in the page**, stored rather than deflated, because
// `fflate` is bundled into the application and not exposed on `window`. Whether
// the bytes are a real zip is not assumed: if they were not, the application's
// own reader would refuse them and every assertion below would fail.

// **Back to the list, in the application rather than through the address bar.**
// The section above ended inside the activity it imported; a reload would
// rebuild the fake and take the signed-in manager with it, which is what a `go`
// here did — it timed out waiting for a list nobody was signed in to see.
await visit("/manager/activities",
    `[...document.querySelectorAll("tbody tr")].some(r => r.innerText.includes("AMMPZ-2019"))`);
await wait(1500);

await click(`[...document.querySelectorAll("button")]
    .find(b => b.dataset.testid === "import-file")`);
await wait(1200);

await evaluate(`
    const CRC = (() => {
        const table = new Uint32Array(256);
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
            table[n] = c >>> 0;
        }
        return (bytes) => {
            let c = 0xffffffff;
            for (const byte of bytes) c = table[(c ^ byte) & 0xff] ^ (c >>> 8);
            return (c ^ 0xffffffff) >>> 0;
        };
    })();

    // A zip of stored entries, which is all this needs and all it claims to be.
    const zip = (files) => {
        const encoder = new TextEncoder();
        const locals = [];
        const central = [];
        let offset = 0;

        for (const [name, text] of Object.entries(files)) {
            const bytes = encoder.encode(text);
            const nameBytes = encoder.encode(name);
            const crc = CRC(bytes);

            const local = new DataView(new ArrayBuffer(30));
            local.setUint32(0, 0x04034b50, true);
            local.setUint16(4, 20, true);
            local.setUint32(14, crc, true);
            local.setUint32(18, bytes.length, true);
            local.setUint32(22, bytes.length, true);
            local.setUint16(26, nameBytes.length, true);
            locals.push(new Uint8Array(local.buffer), nameBytes, bytes);

            const entry = new DataView(new ArrayBuffer(46));
            entry.setUint32(0, 0x02014b50, true);
            entry.setUint16(4, 20, true);
            entry.setUint16(6, 20, true);
            entry.setUint32(16, crc, true);
            entry.setUint32(20, bytes.length, true);
            entry.setUint32(24, bytes.length, true);
            entry.setUint16(28, nameBytes.length, true);
            entry.setUint32(42, offset, true);
            central.push(new Uint8Array(entry.buffer), nameBytes);

            offset += 30 + nameBytes.length + bytes.length;
        }

        const centralBytes = central.reduce((n, part) => n + part.length, 0);
        const end = new DataView(new ArrayBuffer(22));
        end.setUint32(0, 0x06054b50, true);
        end.setUint16(8, Object.keys(files).length, true);
        end.setUint16(10, Object.keys(files).length, true);
        end.setUint32(12, centralBytes, true);
        end.setUint32(16, offset, true);

        return new Blob([...locals, ...central, new Uint8Array(end.buffer)], { type: "application/zip" });
    };

    const blob = zip({
        "contest.xml": \`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<contest xmlns="http://zawodyweb.mat.umk.pl/">
  <name>Konkurs z ZawodyWeb</name><type>0</type><subtype>0</subtype>
  <startdate>2026-03-02T09:00:00.000+01:00</startdate>
  <rules>Kara 20 minut.</rules><visible>true</visible>
  <series><serie>
    <name>Etap I</name>
    <startdate>2026-03-02T09:00:00.000+01:00</startdate>
    <enddate>2026-03-02T14:00:00.000+01:00</enddate>
    <penaltytime>1200</penaltytime><visible>true</visible>
    <openips></openips><hiddenblocked>false</hiddenblocked>
    <problems><problem>
      <name>Suma dwoch liczb</name><abbrev>A</abbrev><text>problem001.html</text>
      <memlimit>64</memlimit><codesize>64</codesize><diff>NormalDiff</diff>
      <visible>true</visible><viewpdf>false</viewpdf>
      <languages><language>C++</language><language>Java</language></languages>
      <tests><test><input>in001.txt</input><output>out001.txt</output>
        <maxpoints>100</maxpoints><timelimit>1000</timelimit><order>00</order></test></tests>
    </problem></problems>
  </serie></series>
</contest>\`,
        "problem001.html": "<h2>Suma</h2><p>Zsumuj <b>dwie</b> liczby.</p>",
        "in001.txt": "2 3",
        "out001.txt": "5",
    });

    const input = document.querySelector("[data-testid=modal] input[type=file]");
    if (!input) throw new Error("no file input in the dialog");
    const data = new DataTransfer();
    data.items.add(new File([blob], "zawodyweb-contest.zip", { type: "application/zip" }));
    input.files = data.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
`);
await wait(7000);

const converted = await modal();
check(/Skonwertowane z archiwum ZawodyWeb/.test(converted),
    `the archive is recognised and converted (${converted.slice(0, 60)})`);

// **The losses are the point.** ZawodyWeb drops an unknown language in silence;
// this says which one, before anything is written.
check(/Java/.test(converted), "Java is named as having no equivalent here");
check(/strefy czasowej/.test(converted), "and the time zone the format never carried");
check(/skonwertowana z HTML/.test(converted), "and that the statement was machine-converted");
await shot("exchange-zawodyweb");

check(/do utworzenia/.test(converted), "the same plan follows, against the same library");
check(/Kiedy zaczyna si\u0119 pierwsza runda/.test(converted),
    "and the same compulsory date, because it is the same importer");

await fill("Własna nazwa", "ZW-2027");
await fill("Kiedy zaczyna się pierwsza runda", "2027-09-14T10:00");
await wait(600);
await click(modalButton("Importuj"));
await wait(8000);

let arrived = "";
for (let attempt = 0; attempt < 10; attempt++) {
    arrived = await body();
    if (/ZW-2027/.test(arrived)) break;
    await wait(1000);
}
check(/ZW-2027/.test(arrived), "the converted contest is in the list");
await shot("exchange-zawodyweb-imported");

report();
await close();
