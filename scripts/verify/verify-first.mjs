// A brand new problem: statement, attachment and package prepared before any
// version exists, then published together as version 1.
import { open, results } from "./harness.mjs";

const APP = process.env.APP ?? "http://localhost:5180";
// Not the harness's `click`: this one is by button label and calls the element,
// where the harness's takes an expression and clicks the point. The local one
// is what this script's steps are written against.
const { send, evaluate, wait, shot, tab } = await open();
const { check, report } = results();

const until = async (expression, what, tries = 40) => {
    for (let i = 0; i < tries; i++) {
        if (await evaluate(`return ${expression};`)) return;
        await wait(500);
    }
    throw new Error(`timed out waiting for ${what}`);
};
const click = (label) => evaluate(`
    const button = [...document.querySelectorAll("button")].find(b => b.textContent.trim() === "${label}");
    if (!button) throw new Error("no button " + ${JSON.stringify(label)});
    button.click();
    return true;
`);

await send("Page.setDeviceMetricsOverride", { width: 1500, height: 1400, deviceScaleFactor: 1, mobile: false });

// 1 — create a problem, which starts with no version at all.
await send("Page.navigate", { url: `${APP}/manager/problems?fakeUser=amy` });
await wait(3000);
await until(`document.body.innerText.includes("Nowe zadanie")`, "the problem list");
await click("Nowe zadanie");
await wait(1200);
await evaluate(`
    const modal = document.querySelector(".mantine-Modal-content");
    const inputs = [...modal.querySelectorAll("input")];
    const set = (element, value) => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(element, value);
        element.dispatchEvent(new Event("input", { bubbles: true }));
    };
    set(inputs[0], "Nowe zadanie testowe");
    set(inputs[1], "nowe-zadanie-testowe");
    return true;
`);

// The type is picked from what the Client can draw, not typed from memory.
const typeField = await evaluate(`
    const modal = document.querySelector(".mantine-Modal-content");
    const input = [...modal.querySelectorAll("input")][2];
    input.click();
    await new Promise(r => setTimeout(r, 600));
    const options = [...document.querySelectorAll("[role=option]")].map(o => o.textContent.trim());
    return { value: input.value, readOnly: input.readOnly, options };
`);
check(typeField.options.length > 0 && typeField.options.every(o => o.includes("@")),
    "the type is a list of what the Client can draw (" + typeField.options.join(", ") + ")");
check(typeField.value.includes("standard-io@1"), "it opens on a type that has renderers (" + typeField.value + ")");
await shot("f-create");
await evaluate(`
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    const modal = document.querySelector(".mantine-Modal-content");
    [...modal.querySelectorAll("input")][0].focus();
    return true;
`);
await wait(500);
await evaluate(`
    const modal = document.querySelector(".mantine-Modal-content");
    const button = [...modal.querySelectorAll("button")].find(b => /Utwórz|Zapisz|Dodaj/.test(b.textContent));
    button.click();
    return true;
`);
await wait(3000);
await until(`/\\/manager\\/problems\\/[^/]+$/.test(location.pathname) || document.body.innerText.includes("Wersje (0)")`,
    "the new problem's editor");
check(await evaluate(`return document.body.innerText.includes("Wersje (0)");`), "a new problem starts with no version");

// 2 — the attachments tab works before any version exists.
await evaluate(`
    [...document.querySelectorAll("[role=tab]")].find(t => t.textContent.includes("Załączniki")).click();
    return true;
`);
await wait(800);
check(!(await evaluate(`return document.body.innerText.includes("Najpierw opublikuj wersję");`)),
    "the attachments tab does not refuse to work");
await evaluate(`
    const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="), c => c.charCodeAt(0));
    const input = [...document.querySelectorAll("input[type=file]")].find(i => !i.accept);
    const data = new DataTransfer();
    data.items.add(new File([png], "graf.png", { type: "image/png" }));
    input.files = data.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
`);
await until(`document.body.innerText.includes("graf.png")`, "the staged figure");
check(true, "a figure can be staged with no version to attach it to");

// 3 — the package tab builds the first package.
await evaluate(`
    [...document.querySelectorAll("[role=tab]")].find(t => t.textContent.includes("Paczka")).click();
    return true;
`);
await until(`document.body.innerText.includes("Limity domyślne")`, "the builder");
// The badge is upper-cased by Mantine, so the text is matched case-insensitively.
check(await evaluate(`return /brak paczki/i.test(document.body.innerText);`), "the builder opens with no package");
await evaluate(`
    const files = [
        new File(["4 3\\n1 2"], "1a.in", { type: "text/plain" }),
        new File(["TAK"], "1a.out", { type: "text/plain" }),
    ];
    const input = [...document.querySelectorAll("input[type=file]")].find(i => i.multiple);
    const data = new DataTransfer();
    for (const file of files) data.items.add(file);
    input.files = data.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
`);
await until(`document.body.innerText.includes("Testy (1)")`, "the first test");
// The points are left at zero: that is a warning, not an error, and this run is
// about whether a first version can be prepared at all.
await wait(600);
await shot("f-package");

// 3b — a checker, because a checker is the only thing here that reaches
// `CodeHighlight`. The preview branches on `language`: test data has none and
// renders through `Code`, so without a source file the component that
// @mantine/code-highlight rewrote for Shiki is drawn by nothing and an upgrade
// of it cannot go red.
// **By name, not by `accept`.** Three inputs offer the same extensions — the
// checker, the interactor and the model solution — so a search by that takes
// whichever the DOM happens to hold first, and would keep passing while
// targeting the wrong control.
await evaluate(`
    const input = document.querySelector("input[data-testid=checker-file]");
    if (!input) throw new Error("no checker input");
    const data = new DataTransfer();
    data.items.add(new File(["int add(int a, int b) {\\n    return a + b;\\n}\\n"],
        "checker.cpp", { type: "text/plain" }));
    input.files = data.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
`);
await until(`document.body.innerText.includes("checker.cpp")`, "the checker");
check(await evaluate(`return /\\bcpp\\b/.test(document.body.innerText);`),
    "the checker is recognised as source, by extension");

// The button carries the word; the per-test preview is an icon with a tooltip,
// so matching on the text picks the program's.
await evaluate(`
    const button = [...document.querySelectorAll("button")]
        .find(b => b.textContent.trim() === "Podgląd");
    if (!button) throw new Error("no preview button");
    button.click();
    return true;
`);
await until(`document.querySelector("[data-testid=modal]") !== null`, "the preview");
await wait(600);
const highlighted = await evaluate(`
    const modal = document.querySelector("[data-testid=modal]");
    const pre = modal.querySelector("pre");
    return {
        text: pre ? pre.innerText.replace(/\\s+/g, " ").trim() : "",
        spans: pre ? pre.querySelectorAll("span").length : 0,
    };
`);
check(highlighted.text.includes("int add(int a, int b)"), "the checker's source is in the preview");
// Tokens rather than plain text. highlight.js and Shiki both emit one span per
// token and nothing else here does, so this survives the change of engine and
// still fails if the source arrives unhighlighted.
check(highlighted.spans > 1, `the source is syntax-highlighted (${highlighted.spans} tokens)`);
await shot("f-checker");

await evaluate(`
    const modal = document.querySelector("[data-testid=modal]");
    modal.querySelector("[data-testid=close-button]").click();
    return true;
`);
await until(`document.querySelector("[data-testid=modal]") === null`, "the preview to close");

// 4 — the statement, then publish everything as version 1.
await evaluate(`
    [...document.querySelectorAll("[role=tab]")].find(t => t.textContent.trim() === "Treść").click();
    return true;
`);
await until(`document.querySelector("textarea") !== null`, "the editor");
await evaluate(`
    const area = document.querySelector("textarea");
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(area,
        "---\\nversion: 1\\n---\\n\\nTreść pierwszej wersji.\\n\\n![graf](<graf.png>)\\n");
    area.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
`);
await wait(1200);
check(await evaluate(`return document.body.innerText.includes("Publikacja tworzy wersję 1");`),
    "publishing would create version 1");
await shot("f-statement");

await click("Opublikuj nową wersję");
await wait(4000);
await until(`document.body.innerText.includes("Wersje (1)")`, "the published version");
check(true, "the first version is published");

await evaluate(`
    [...document.querySelectorAll("[role=tab]")].find(t => t.textContent.includes("Załączniki")).click();
    return true;
`);
await wait(1000);
const rows = await evaluate(`
    return [...document.querySelectorAll("table tbody tr")].map(r => r.innerText.replace(/\\s+/g, " ").trim());
`);
check(rows.some(r => r.includes("graf.png")), "the figure is in version 1");
check(rows.some(r => r.includes("package.zip")), "the package is in version 1");
check(rows.some(r => r.includes("content.md")), "the statement is in version 1");

// 5 — the package's own files are not attachments and cannot be deleted here.
const packageRow = await evaluate(`
    const row = [...document.querySelectorAll("table tbody tr")].find(r => r.innerText.includes("package.zip"));
    const buttons = [...row.querySelectorAll("button")];
    return { total: buttons.length, enabled: buttons.filter(b => !b.disabled).length };
`);
check(packageRow.enabled === 0, `package.zip offers no enabled action in the attachments tab (${packageRow.enabled} of ${packageRow.total})`);
await shot("f-published");

report();
