// Printing source: the delegation, the module switch, and the paper.
//
// **The one check that drives a person who holds a single permission.** Every
// other browser script signs in as somebody with a template; `pdrukarz` holds
// `printout:manage` on the contest and nothing anywhere else, which is the whole
// reason the key exists and the only way to see it working.
//
// What it cannot cover: who may read a printout's **bytes**. The fake has no
// `FileReference` model, so the read rule in `FileService` is answerable only in
// the Server's own suite.
import { open, results } from "./harness.mjs";

const APP = process.env.APP ?? "http://localhost:5180";
const { send, evaluate, until, wait, shot, go, visit, click, pages, close } = await open();
const { check, report } = results();

// **Two activities this reader is actually enrolled in**, one with the module on
// and one with it off. Enrolment matters: an entry is absent for somebody who is
// not in the activity whatever the module says, so an activity they are not in
// would make the "off" case prove nothing — measured, after a sabotage passed
// against exactly that.
const ON = "PROG-1-LA";
const OFF = "AMMPZ-2018";

const body = () => evaluate(`return document.body.innerText;`);

// ── 1. One key, one surface ─────────────────────────────────────────────────

await go(`${APP}/manager?fakeUser=pdrukarz`,
    `document.querySelectorAll("[data-testid=app-main] a[href^='/manager/']").length > 0`);

const offered = await evaluate(`
    return [...document.querySelectorAll("[data-testid=app-main] a[href^='/manager/']")]
        .map(a => a.getAttribute("href")).sort();
`);
check(offered.includes("/manager/printouts"), `the printer operator is offered Printouts (${offered.join(" ")})`);
check(offered.length === 1,
    `and nothing else — one key opens one screen (${offered.length} offered)`);
await shot("printouts-operator-panel");

// ── 2. The queue, narrowed to where the grant is ────────────────────────────

await visit("/manager/printouts", `document.querySelector("[data-testid=printout-queue]") !== null`);
const queue = await body();
check(/Jan Kowalski/.test(queue), "the queue carries the contest's requests");
// **Against an activity that also has a queue.** The course seeds printouts too
// and this operator's grant does not reach it, so this is what narrowing means.
// Naming an activity with no rows at all would pass whether or not the fake
// narrows anything.
check(!/Programowanie 1/.test(queue),
    "and nothing from a course this operator does not print for");

// The stamped group, which is on the row rather than resolved at read time.
check(/Zespół Alfa/.test(queue), "a row names the group the request was sent under");

// The filter's options come from the printing key. `/manager/activities` would
// answer an empty list to this account, with no error to notice.
// **From the printing key, not from `/manager/activities`.** That one narrows on
// `activity:update`, so this account would be handed an empty list with no error
// to notice — which is why the filter has an endpoint of its own.
await click(`document.querySelector("input[data-testid=printout-activity]")`);
await wait(600);
const options = await evaluate(`
    return [...document.querySelectorAll("[role=option]")]
        .filter(o => o.offsetParent !== null)
        .map(o => o.textContent.trim());
`);
check(options.length > 0, `the activity filter is fed from the printing key (${options.join(", ")})`);

// ── 3. The module switch, from the participant's side ───────────────────────

await go(`${APP}/activities/${ON}/problems?fakeUser=amy`,
    `document.body.innerText.includes("Zadania")`);
const withModule = await evaluate(`
    return [...document.querySelectorAll("nav a")].map(a => a.getAttribute("href"));
`);
check(withModule.some(href => href?.endsWith(`/activities/${ON}/printouts`)),
    "an activity that takes print requests offers the entry");

await go(`${APP}/activities/${OFF}/problems?fakeUser=amy`,
    `document.body.innerText.length > 0`);
const withoutModule = await evaluate(`
    return [...document.querySelectorAll("nav a")].map(a => a.getAttribute("href"));
`);
check(!withoutModule.some(href => href?.endsWith(`/activities/${OFF}/printouts`)),
    "and one that does not takes the entry away");

// ── 4. Asking for a page ────────────────────────────────────────────────────

await visit(`/activities/${ON}/printouts`,
    `document.querySelector("[data-testid=app-main] .monaco-editor") !== null`);

// **Through the editor, as the submit form is driven.** Monaco owns its buffer
// and ignores a value written to its hidden textarea, so this goes in as real
// input — the idiom `verify-editor` records.
await click(`document.querySelector("[data-testid=app-main] .monaco-editor .view-lines")`);
await wait(500);
await send("Input.insertText", { text: "print('na papierze')" });
await wait(800);

// The name comes from the language, because a typed fragment has none of its
// own — there is no field for it, exactly as the submit form has it.
await click(`document.querySelector("input[data-testid=printout-language]")`);
await wait(600);
await click(`[...document.querySelectorAll("[role=option]")].find(o => /Python/i.test(o.textContent))`);
await wait(500);

// **Asked before it is sent.** Paper is somebody else's time and a printer
// somebody else's queue, so a mis-click costs more than a keystroke.
await click(`document.querySelector("[data-testid=printout-send]")`);
await wait(700);
const asked = await evaluate(`return document.querySelector("[data-testid=modal]")?.innerText ?? "";`);
check(/\.py/.test(asked), `the confirmation names the file it will print`);

await click(`document.querySelector("[data-testid=printout-confirm]")`);
await wait(1800);

const mine = await body();
check(/main\.py/.test(mine), "and only then does it appear in the asker's own list");
await shot("printouts-participant");

// **And a file picked from disk, which is a different path through the form.**
// Its bytes must arrive as they are: a browser rewrites every newline in a
// multipart *text* field to CRLF, so source hashed as it sits on disk and sent
// as text never matches — a 422 on a file nothing is wrong with. The name has a
// space and brackets for the same reason a real one does.
await visit(`/activities/${ON}/printouts`,
    `document.querySelector("input[type=file]") !== null`);

const attached = await evaluate(`
    const input = document.querySelector("input[type=file]");
    if (!input) throw new Error("no file input on the form");
    // **Unix endings on purpose.** Measured against a live Server: the same
    // bytes as a text field answer 422 and as a file part 201, because the
    // browser rewrites LF to CRLF on its way into a field and leaves a file
    // alone. A CRLF fixture would pass either way and prove nothing.
    const bytes = "int main() {\\n    return 0;\\n}\\n";
    const file = new File([bytes], "program (1).cpp", { type: "text/plain" });
    const data = new DataTransfer();
    data.items.add(file);
    input.files = data.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
`);
check(attached === true, "a file can be picked");
await wait(900);

await click(`document.querySelector("[data-testid=printout-send]")`);
await wait(700);
await click(`document.querySelector("[data-testid=printout-confirm]")`);
await wait(2000);

const withFile = await body();
check(/program \(1\)\.cpp/.test(withFile),
    "and arrives under its own name, checksum and all");

// ── 5. It reaches the queue, and the sheet is a tab of its own ──────────────

// **Back as the operator, and on a seeded row rather than the one just sent.**
// The fake's world is in memory and changing account is a full page load, so a
// request made a moment ago does not survive the reload. What §4 proved is that
// asking works; what follows is the operator's half, on a row the fixture put
// there. The two halves meeting is the Server's own test.
await go(`${APP}/manager/printouts?fakeUser=pdrukarz`,
    `document.querySelector("[data-testid=printout-queue]") !== null`);

// The digest the row shows, so the sheet can be checked against it rather than
// against "sixty-four hex characters", which any digest satisfies.
const expected = await evaluate(`
    const row = [...document.querySelectorAll("[data-testid=printout-queue] tr")]
        .find(r => r.innerText.includes("A.cpp"));
    return row?.getAttribute("data-printout") ?? null;
`);
check(typeof expected === "string", `the row carries its id (${expected})`);

// **The waiting row, named** — not the first one. The queue is oldest first, and
// the oldest here is already printed: its source is gone, which is a different
// page and is asserted below on purpose.
// **The tab is not observable, and that is the feature working.** The sheet
// prints itself and closes on `afterprint`; a headless browser answers `print()`
// at once, so the tab is gone before `pages()` is asked. What the click is held
// to is its other half: the row becomes somebody's, and the confirm opens here.
await click(`[...document.querySelectorAll("[data-testid=printout-queue] tr")]
    .find(r => r.innerText.includes("A.cpp"))
    ?.querySelector("[data-testid=printout-print]")`);
await wait(2500);

// The confirm is in the panel's own tab, not on the paper.
const dialog = await evaluate(`
    return document.querySelector("[data-testid=modal]")?.innerText ?? "";
`);
check(/cofn/i.test(dialog),
    "the confirm is in the panel's own tab and says it cannot be undone");

// **Taking it marks it**, so the other person working this queue sees the row is
// somebody's rather than opening the same sheet.
const held = await evaluate(`
    const row = [...document.querySelectorAll("[data-testid=printout-queue] tr")]
        .find(r => r.innerText.includes("A.cpp"));
    return row?.innerText ?? "";
`);
check(/drukarce/i.test(held), "the row says it is at a printer");

// The sheet's own address, because the tab closed itself. A page somebody
// navigated to stays: the close is guarded on having an opener.
const sheetUrl = await evaluate(`
    const row = [...document.querySelectorAll("[data-testid=printout-queue] tr")]
        .find(r => r.innerText.includes("A.cpp"));
    return row ? "/print/printouts/" + row.getAttribute("data-printout") : null;
`);
check(typeof sheetUrl === "string", "the queue names the sheet: " + sheetUrl);

await visit(sheetUrl, `document.querySelector("[data-testid=printout-sheet]") !== null`);

const paper = await evaluate(`return document.body.innerText;`);
check(/Jan Kowalski/.test(paper), "the sheet says who asked");
check(/Akademickie Mistrzostwa/.test(paper), "and in which activity");
check(await evaluate(`return document.querySelector("nav") === null;`),
    "and carries none of the application's navigation");

// ── The listing: a number beside every line, wrapped ones included ─────────
//
// **Read as painted lines, not as markup.** The numbering and the source were
// two text flows in two grid columns — a gutter that never wraps beside a
// `<pre>` that does — so every long line made the source column one visual row
// taller than the numbering, and the numbers ran out before the listing ended.
// What is asserted is where the ink is, which says the same thing about the
// shape this replaced and about the one that replaced it.
const listing = await evaluate(`
    const sheet = document.querySelector("[data-testid=sheet-source]");
    // One rect per painted line, told apart by whether it can be selected: the
    // numbering is user-select:none and the source is not. Zero-width rects go,
    // a trailing newline being one and not a line anybody can read.
    const painted = (unselectable) => {
        const walk = document.createTreeWalker(sheet, NodeFilter.SHOW_TEXT);
        const out = [];
        for (let node = walk.nextNode(); node; node = walk.nextNode()) {
            const none = getComputedStyle(node.parentElement).userSelect === "none";
            if (none !== unselectable) continue;
            const range = document.createRange();
            range.selectNodeContents(node);
            out.push(...[...range.getClientRects()].filter(r => r.width >= 1));
        }
        return out;
    };
    const numbers = painted(true);
    const source = painted(false);
    const rows = [...sheet.querySelectorAll("pre[data-line]")];
    const last = rows.length;
    const line = parseFloat(getComputedStyle(sheet).lineHeight);
    const lastNum = sheet.querySelector('div[data-line="' + last + '"]');
    const lastCode = sheet.querySelector('pre[data-line="' + last + '"]');
    return {
        numbers: numbers.length,
        painted: source.length,
        foot: numbers.length && source.length
            ? Math.round(source[source.length - 1].bottom - numbers[numbers.length - 1].bottom)
            : null,
        rows: last,
        lastNumber: lastNum ? lastNum.textContent.trim() : null,
        lastGap: lastNum && lastCode
            ? Math.round(lastCode.getBoundingClientRect().top - lastNum.getBoundingClientRect().top)
            : null,
        shortest: last ? Math.round(Math.min(...rows.map(r => r.getBoundingClientRect().height))) : null,
        wrapped: rows.filter(r => r.getBoundingClientRect().height > line + 1).length,
        terminated: rows.filter(r => r.textContent.endsWith("\\n")).length,
        line: Math.round(line),
        unselectable: lastNum ? getComputedStyle(lastNum).userSelect : null,
        block: lastCode ? getComputedStyle(lastCode).display : null,
        family: lastCode ? getComputedStyle(lastCode).fontFamily : "",
        listingFamily: getComputedStyle(sheet).fontFamily,
    };
`);

// The guard. Without a line that actually wraps, everything under it is true of
// a listing nothing was ever wrong with.
check(listing.painted - listing.numbers >= 2 && listing.wrapped >= 1,
    `the fixture has a line long enough to wrap (${listing.wrapped} of ${listing.numbers} lines do, `
    + `${listing.painted} painted rows in all)`);

// **The regression.** Two flows drifted apart by a painted row for every line
// that wrapped; one row per line cannot.
check(listing.foot !== null && Math.abs(listing.foot) <= 2,
    `the numbering ends level with the last line of source (${listing.foot}px apart)`);
check(listing.rows === listing.numbers,
    `one row per source line (${listing.rows} rows, ${listing.numbers} numbers)`);
check(listing.lastNumber === String(listing.rows),
    `and the last line carries its own number (${listing.lastNumber} of ${listing.rows})`);
check(listing.lastGap !== null && Math.abs(listing.lastGap) <= 2,
    `whose number sits at the top of its own line (${listing.lastGap}px)`);
// Nothing sets a height for a blank line: the number cell is never empty and a
// grid row is as tall as its tallest cell.
check(listing.shortest >= listing.line - 1,
    `a blank line still occupies a row (${listing.shortest}px against ${listing.line}px)`);

// **What copying depends on**, the clipboard itself not being reachable from
// here. `getSelection().toString()` would be the wrong probe — it runs a
// different serialiser from the one copy uses and has included unselectable
// text. So the two mechanisms are asserted instead.
check(listing.unselectable === "none",
    `the numbering is not part of what is copied (${listing.unselectable})`);
check(listing.block === "block",
    `and each line is a block, so a copy has newlines between them (${listing.block})`);
// **And each one ends in a newline.** A block holding nothing contributes
// nothing to the clipboard, so without this the blank line in the middle of a
// listing is simply absent from what somebody pastes — measured against the two
// flows this replaced, which kept it.
check(listing.terminated === listing.rows,
    `every line carries the newline a copy needs (${listing.terminated} of ${listing.rows})`);

// **The face, not the word.** A `<pre>` carries the browser's own generic
// family, which outranks what the listing hands down — so this passed on the
// word `monospace` while the two columns were set differently.
check(/mono/i.test(listing.family), "the listing is monospace: " + listing.family.slice(0, 30));
check(listing.family === listing.listingFamily,
    `and the numbering and the source are one face (${listing.family.slice(0, 22)} / ${listing.listingFamily.slice(0, 22)})`);

const digest = await evaluate(`
    return document.querySelector("[data-testid=sheet-digest]")?.textContent?.trim() ?? "";
`);
check(/^[0-9a-f]{64}$/.test(digest), "the footer carries a digest: " + digest.slice(0, 16));

// **A resolved request's sheet answers rather than 404s.** The printout still
// exists and its record is the audit trail; it just has no source to show.
await visit("/print/printouts/po-0001-3",
    `document.querySelector("[data-testid=printout-sheet]") !== null`);
check(/usuni/i.test(await evaluate(`return document.body.innerText;`)),
    "a resolved request's sheet says its source has gone");
check(/^[0-9a-f]{64}$/.test(await evaluate(
    `return document.querySelector("[data-testid=sheet-digest]")?.textContent?.trim() ?? "";`)),
    "and still carries the digest, so paper on a desk matches a row");

// ── 6. Confirming, back in the panel ────────────────────────────────────────

await visit("/manager/printouts", `document.querySelector("[data-testid=printout-queue]") !== null`);
await wait(1200);
await click(`[...document.querySelectorAll("[data-testid=printout-queue] tr")]
    .find(r => r.innerText.includes("A.cpp"))
    ?.querySelector("[data-testid=printout-print]")`);
await wait(2000);
await click(`document.querySelector("[data-testid=printout-printed]")`);
await wait(1800);

// **The row, and not the page.** The fixture seeds a request that is already
// printed, so `Wydrukowany` is on this screen whatever the click did — the
// assertion passed for three months while the fake answered 409 to the only
// call that could have produced it. Two things are asked instead: the row this
// flow worked on says it, and the window closed, which it does only on success.
const ROW = `([...document.querySelectorAll("[data-testid=printout-queue] tr")]
    .find(r => r.innerText.includes("A.cpp"))?.innerText ?? "")`;
// Polled, not slept on: the list refetches after the confirm, and a fixed wait
// reads either the old rows or a blank table — both of which look exactly like
// a row that never changed.
// **Case-insensitive, because the state is a Mantine `Badge`** and a badge
// shouts through CSS: `innerText` reads WYDRUKOWANY for a label written
// `Wydrukowany`. Asserting on the whole page body hid this — the word is in
// normal case in the state filter beside the table.
const marked = await until(`/wydrukowany/i.test(${ROW})`);
check(marked, `confirming marks that row printed (${(await evaluate(`return ${ROW};`)).replace(/\s+/g, " ").slice(0, 90)})`);
check(await evaluate(`return document.querySelector("[data-testid=modal]") === null;`),
    "and the window closes, which it does only when the Server accepted it");
await shot("printouts-queue");


report();
close();
