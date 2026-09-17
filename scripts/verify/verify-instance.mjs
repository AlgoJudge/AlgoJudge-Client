// Stage 9: an operator writes what the instance says about itself, and the
// screens follow — including the state where it says nothing at all.
import { open, results } from "./harness.mjs";

const APP = process.env.APP ?? "http://localhost:5180";
// Not the harness's `tab`: that one matches by prefix, because some tabs carry
// a count. This screen's tabs do not, and the exact match below is what keeps
// two similarly named ones apart.
const { send, evaluate, until, wait, shot, go, click, setTextarea } = await open();
const { check, report } = results();

const button = (label) => `[...document.querySelectorAll("button")].find(b => b.textContent.trim() === ${JSON.stringify(label)})`;
const tab = (label) => `[...document.querySelectorAll("[role=tab]")].find(t => t.textContent.trim() === ${JSON.stringify(label)})`;
/**
 * Moves inside the application rather than reloading it.
 *
 * A full page load rebuilds the fake — a new file store and a new instance —
 * so anything published in this tab would be gone before it could be read. The
 * router listens to `popstate`, which is what a real click through the shell
 * does to it.
 */
const navigate = async (path) => {
    await evaluate(`
        history.pushState({}, "", ${JSON.stringify(path)});
        window.dispatchEvent(new PopStateEvent("popstate"));
        return true;
    `);
    await wait(2500);
};

// Permissions arrive in a request of their own, after the session settles, and
// until they do `hasAny` answers no to everything — so a screen looks exactly
// like one this person may not open and an assertion about an absence proves
// nothing. Every navigation below waits for the answer, not just for the page.
const READY = `document.documentElement.dataset.permissions === "ready"`;
await send("Page.setDeviceMetricsOverride", { width: 1500, height: 1200, deviceScaleFactor: 1, mobile: false });

// 1 — a manager who does not administer the installation is refused it.
await go(`${APP}/manager?fakeUser=amy`, `document.body.innerText.includes("Zarządzanie") && ${READY}`);
check(!await evaluate(`return document.body.innerText.includes("Instancja");`),
    "a manager is not offered the instance screen");
await go(`${APP}/manager/instance`, `document.body.innerText.length > 100 && ${READY}`);
check(await evaluate(`return /instance:update/.test(document.body.innerText);`),
    "and asking for it names the permission they lack");

// 2 — an administrator gets it.
await go(`${APP}/manager/instance?fakeUser=john`, `document.body.innerText.includes("Ustawienia") && ${READY}`);
check(true, "an administrator opens it");
await shot("in-settings");

// 3 — publishing a replacement for a template.
await click(tab("Dokumenty"));
check(await evaluate(`return /szablon/i.test(document.body.innerText);`),
    "the documents that ship are shown as templates");
await click(`[...document.querySelectorAll("tbody tr")]
    .find(r => r.innerText.includes("Polityka prywatno"))
    ?.querySelector("button")`);
await wait(2500);
check(await evaluate(`return document.querySelector("textarea") !== null;`),
    "one opens in the same editor a statement is written in");

// **Beside it, what a reader would get.** The preview is the reader's renderer,
// which validates on its own — so a document the published page would refuse
// shows that refusal here, rather than an empty box that reads as a broken
// screen.
const preview = `document.querySelector("[data-testid=document-preview]")`;
await setTextarea("---\nversion: 2\n---\n\n# Zepsuty\n");
check(await until(`(${preview})?.innerText.includes("Nieobsługiwana wersja") === true`, 20),
    "the preview shows the refusal a reader would get, not an empty box");

const TEXT = "---\\nversion: 1\\n---\\n\\n# Polityka prywatnosci\\n\\n![Znak](logo.svg)\\n\\nTa instancja przetwarza dane tak, jak opisano ponizej.\\n";
await evaluate(`
    const area = document.querySelector("textarea");
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(area, "${TEXT}");
    area.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
`);
await wait(1200);
check(await until(`(${preview})?.querySelector("h1")?.textContent.includes("Polityka prywatnosci") === true`, 20),
    "and draws the document as it is typed");
// **Resolved as the published page resolves it.** The editor offered the mark
// by name all along; the preview has to draw it, or it promises the operator a
// page that is not the one readers get.
const drawnMark = await evaluate(`
    const box = ${preview};
    return {
        src: box?.querySelector("img[alt=Znak]")?.getAttribute("src") ?? null,
        missing: /Brakujący załącznik/.test(box?.innerText ?? ""),
    };
`);
check(drawnMark.src !== null && !drawnMark.missing,
    `with the instance's mark in it (${drawnMark.src ?? "no image"}${drawnMark.missing ? ", reported missing" : ""})`);
await shot("in-document-preview");
await click(button("Opublikuj"));
await wait(2500);
// Mantine uppercases badge text, so these are matched case-insensitively.
check(await evaluate(`
    const row = [...document.querySelectorAll("tbody tr")].find(r => r.innerText.includes("Polityka prywatno"));
    return row ? /publikowany/i.test(row.innerText) && !/szablon/i.test(row.innerText) : false;
`), "publishing replaces the template");
await shot("in-documents");

// 4 — the reader sees it, in the shell, with no template warning.
await navigate("/privacy");
check(await evaluate(`return document.body.innerText.includes("przetwarza dane");`),
    "and a reader gets the operator's own text");
check(!await evaluate(`return /szablon dostarczony/i.test(document.body.innerText);`),
    "with no warning that it is a template");
// **The legal pages resolved nothing until 2026-09-17**, so a policy that showed
// the mark showed its readers a missing-attachment notice while the preview —
// and the front page — drew it. `alt` tells the document's image from the
// navigation's.
const readMark = await evaluate(`
    return {
        src: document.querySelector("img[alt=Znak]")?.getAttribute("src") ?? null,
        missing: /Brakujący załącznik/.test(document.body.innerText),
    };
`);
check(readMark.src !== null && !readMark.missing,
    `and the mark it shows is drawn for them too (${readMark.src ?? "no image"}${readMark.missing ? ", reported missing" : ""})`);

// 5 — withdrawing it takes its links with it. Still without a reload: what was
//     published lives in this tab.
await navigate("/manager/instance");
await click(tab("Dokumenty"));
await click(`[...document.querySelectorAll("tbody tr")]
    .find(r => r.innerText.includes("Polityka prywatno"))
    ?.querySelector("button")`);
await wait(2000);
await click(button("Cofnij publikację"));
await wait(2000);
check(await evaluate(`
    const navbar = document.querySelector("[data-testid=app-navbar]");
    return [...navbar.querySelectorAll("a")].every(a => a.getAttribute("href") !== "/privacy");
`), "withdrawing it removes it from the navigation at once");
check(await evaluate(`
    const row = [...document.querySelectorAll("tbody tr")].find(r => r.innerText.includes("Polityka prywatno"));
    return row ? /niepublikowany/i.test(row.innerText) : false;
`), "and the screen says it is no longer published");
check(await evaluate(`return /Wcze[śs]niejsze wersje/.test(document.body.innerText);`),
    "while the revisions already published stay in the history");

await navigate("/privacy");
check(await evaluate(`return /Nie ma tu takiej strony|no such page/i.test(document.body.innerText);`),
    "and its address says there is no such page");
await shot("in-withdrawn");

// 6 — somebody else saved these settings first.
//
//     `Instance` is one row with two writers since 2026-08-28 — this screen, and
//     the pre-configuration the Server reads from disk — so a save can be
//     refused instead of silently putting every field back. The Server decides
//     that from a row version the API never carries, so the fake cannot derive
//     it: `?fakeConflict=instance` asks for it.
//
//     Checked because a refusal nobody has looked at is a refusal that reaches
//     an operator as a blank screen.
await go(`${APP}/manager/instance?fakeUser=john&fakeConflict=instance`,
    `document.body.innerText.includes("Ustawienia") && ${READY}`);
await click(button("Zapisz"));
await wait(2000);
check(await evaluate(`return /tym samym momencie|same moment/i.test(document.body.innerText);`),
    "a save that lost the race says so, in the Server's own words");
await shot("in-conflict");

report();
