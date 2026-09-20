// What an external directory's groups are worth here, and what the screen
// refuses to let them be worth.
//
// **The screen had no browser check at all** until 2026-09-19, which is the day
// its whole vocabulary changed: a rule named a role by name and granted one, and
// it now names roles by id and grants a set of them. A rename used to move a
// mapping onto whatever role was called that afterwards.
import { open, results } from "./harness.mjs";

const APP = process.env.APP ?? "http://localhost:5180";
const { send, evaluate, wait, shot, go, click } = await open();
const { check, report } = results();

const modal = () => evaluate(`
    const element = document.querySelector("[data-testid=modal]")
        ?? document.querySelector(".mantine-Modal-body");
    return element ? element.innerText.replace(/\\s+/g, " ") : null;
`);

await send("Page.setDeviceMetricsOverride", { width: 1600, height: 1200, deviceScaleFactor: 1, mobile: false });

await go(`${APP}/manager/oidc?fakeUser=john`,
    `document.body.innerText.includes("realm_access.roles")`);

// 1 — a rule reads as the roles it grants, not as one. Lowercased before
//     matching, because a badge draws its text in capitals and the assertion is
//     about what the rule says rather than about how it is set.
const listed = (await evaluate(`return document.body.innerText.replace(/\\s+/g, " ");`)).toLowerCase();
check(/students\s*→\s*participant/.test(listed), "a rule is shown with what it grants");
check(/lecturers\s*→\s*manager,\s*jury/.test(listed),
    "and a value worth two roles shows both, which one link could not express");
await shot("providers-list");

// 2 — the editor picks roles rather than typing a name.
await click(`[...document.querySelectorAll("button")].find(b => /Edytuj|Edit/.test(b.textContent))`);
await wait(900);
const editor = await modal();
check(editor !== null, "the editor opens");
check(/Mapowanie|Mapping/i.test(editor ?? ""), "and it holds the mapping");
await shot("providers-editor");

// 3 — the roles offered are the installation's. An activity's role is somebody
//     else's course's, and a mapping is the installation's: offering one here is
//     how a course's set could be handed out installation-wide.
//
//     The rule's own picker, keyed on the placeholder the rules editor sets, so
//     the behaviour select above it cannot make this pass for the wrong reason.
const opened = await evaluate(`
    const inputs = [...document.querySelectorAll(".mantine-Modal-body input")];
    const picker = inputs.find(i => /^(Role|Roles)$/i.test(i.placeholder ?? ""));
    if (!picker) return false;
    picker.focus();
    picker.click();
    return true;
`);
check(opened, "a rule names its roles with a picker");

if (opened) {
    await wait(700);
    const options = await evaluate(`
        return [...document.querySelectorAll("[role=option]")].map(o => o.textContent.trim());
    `);
    check(options.length > 0, `the picker offers the installation's roles (${options.join(", ")})`);
    check(!options.some(name => /jury-amp/i.test(name)),
        "and offers no role belonging to an activity");
}

report();
