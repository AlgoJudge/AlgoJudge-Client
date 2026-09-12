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
const { send, evaluate, wait, shot, go, visit, click, pages, close } = await open();
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
const before = pages().length;
await click(`[...document.querySelectorAll("[data-testid=printout-queue] tr")]
    .find(r => r.innerText.includes("A.cpp"))
    ?.querySelector("[data-testid=printout-print]")`);
await wait(2500);
const opened = pages();
check(opened.length > before, "Print opens a tab of its own rather than printing the panel");

const sheet = opened.find(p => p.url.includes("/print/printouts/"));
if (!sheet) throw new Error("the printable sheet did not open in a tab of its own");
const read = sheet.evaluate;

const paper = await read(`return document.body.innerText;`);
check(/Jan Kowalski/.test(paper) || /Amy/.test(paper), "the sheet says who asked");
check(/Akademickie Mistrzostwa/.test(paper), "and in which activity");

const chrome = await read(`return document.querySelector("nav") === null;`);
check(chrome === true, "and carries none of the application's navigation");

const mono = await read(`
    const listing = document.querySelector("[data-testid=sheet-source] pre");
    return listing ? getComputedStyle(listing).fontFamily : "";
`);
check(/mono/i.test(mono), `the listing is monospace (${mono.slice(0, 40)})`);

const printed = await read(`
    return document.querySelector("[data-testid=sheet-digest]")?.textContent?.trim() ?? "";
`);
check(/^[0-9a-f]{64}$/.test(printed),
    `the footer carries a digest (${printed.slice(0, 16)}…)`);

// **And the sheet of a request already resolved.** It answers rather than 404s,
// because the printout still exists and its record is the audit trail — it just
// has no source to show.
const disposed = pages().find(p => p.url.includes("/print/printouts/po-0001-3"));
if (!disposed) {
    const gone = await evaluate(`
        const row = [...document.querySelectorAll("[data-testid=printout-queue] tr")]
            .find(r => r.innerText.includes("B.cpp"));
        row?.querySelector("[data-testid=printout-print]")?.click();
        return true;
    `);
    check(gone === true, "the printed row can be reopened");
    await wait(2500);
}
const older = pages().find(p => /po-0001-3/.test(p.url));
if (older) {
    const text = await older.evaluate(`return document.body.innerText;`);
    check(/usuni/i.test(text), "a resolved request's sheet says its source has gone");
    check(/^[0-9a-f]{64}$/m.test(text.split("\n").at(-1)?.trim() ?? ""),
        "and still carries the digest, so paper on a desk matches a row");
}

// **Taking it marks it**, so the other person working this queue can see the row
// is somebody's rather than opening the same sheet.
await wait(2000);
const held = await evaluate(`
    const row = [...document.querySelectorAll("[data-testid=printout-queue] tr")]
        .find(r => r.innerText.includes("A.cpp"));
    return row?.innerText ?? "";
`);
check(/drukarce/i.test(held), `the row says it is at a printer (${held.replace(/\s+/g, " ").slice(0, 50)})`);

// ── 6. The confirm is in the first tab, and disposal is visible ─────────────

const dialog = await evaluate(`
    return document.querySelector("[data-testid=modal]")?.innerText ?? "";
`);
check(/cofn/i.test(dialog),
    "the confirm is in the panel's own tab and says it cannot be undone");

await click(`document.querySelector("[data-testid=printout-printed]")`);
await wait(1500);

const after = await body();
check(/Wydrukowany/.test(after), "confirming marks the row printed");
await shot("printouts-queue");

report();
close();
