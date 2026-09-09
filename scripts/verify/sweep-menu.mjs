// What the navigation drawer is made of, at a phone's width and at a desktop's.
//
// Five things differ between them, and every one was asked for after looking at
// a screenshot rather than at a measurement: the operator's mark, the legal
// links and the collapse control are desktop chrome, the drawer is never a rail
// below `sm`, and the legal links read as one inline list rather than a line
// each. None of it is visible to `check:mobile`, which asks whether a screen
// overflows and not what is on it.
import { open, results } from "./harness.mjs";

const APP = process.env.APP ?? "http://localhost:5180";
const { evaluate, send, go, wait, shot, close } = await open();
const { check, report } = results();

await send("Page.setDeviceMetricsOverride", { width: 360, height: 740, deviceScaleFactor: 1, mobile: true });
await go(APP + "/activities/PROG-1-LA/ranking?fakeUser=amy", `document.body.innerText.length > 40`);
await wait(1500);
await evaluate(`
    document.querySelector("[data-testid=burger]").click();
    return true;
`);
await wait(900);
await shot("menu-360-open");

const drawer = await evaluate(`
    const nav = document.querySelector("[data-testid=app-navbar]");
    const text = nav.innerText;
    return JSON.stringify({
        width: Math.round(nav.getBoundingClientRect().width),
        logo: [...nav.querySelectorAll("img")].filter(i => i.getBoundingClientRect().width > 0).length,
        foot: text.indexOf("O projekcie") >= 0,
        rail: text.indexOf("Zwi") >= 0,
    });
`);
const d = JSON.parse(drawer);
check(d.logo === 0, "the operator mark is not drawn on a phone (" + d.logo + " images)");
check(d.foot === false, "nor the legal links");
check(d.rail === false, "nor the collapse control");
check(d.width > 200, "and the drawer is the full one (" + d.width + "px)");

// The desktop, where all three belong.
await send("Page.setDeviceMetricsOverride", { width: 1500, height: 1000, deviceScaleFactor: 1, mobile: false });
await go(APP + "/activities/PROG-1-LA/ranking?fakeUser=amy", `document.body.innerText.length > 40`);
await wait(1500);
await shot("menu-1500");

const desk = await evaluate(`
    const nav = document.querySelector("[data-testid=app-navbar]");
    // The foot by its own container rather than by label: a Polish label carries
    // a non-breaking space after a one-letter word, and "O projekcie" matches
    // nothing typed with an ordinary one.
    const about = nav.querySelector("a[target=_blank]");
    const foot = about ? [...about.parentElement.querySelectorAll("a")] : [];
    const tops = new Set(foot.map(a => Math.round(a.getBoundingClientRect().top)));
    return JSON.stringify({
        logo: [...nav.querySelectorAll("img")].filter(i => i.getBoundingClientRect().width > 0).length,
        found: foot.length,
        rows: tops.size,
        where: foot.map(a => a.innerText.slice(0, 16) + " top=" + Math.round(a.getBoundingClientRect().top)),
        rail: nav.innerText.indexOf("Zwi") >= 0,
        spill: Math.round(Math.max(0, Math.max(...foot.map(a => a.getBoundingClientRect().right))
            - nav.getBoundingClientRect().right)),
    });
`);
const k = JSON.parse(desk);
console.log("        foot: " + k.where.join(" | "));
check(k.logo > 0, "the operator mark is drawn on a desktop");
check(k.rail === true, "and the collapse control");
check(k.found === 5, "and all five legal links are there (" + k.found + ")");
check(k.rows < k.found, "laid out inline rather than one to a line (" + k.found + " links on " + k.rows + " rows)");
check(k.spill === 0, "and none of them leaves the drawer (" + k.spill + "px past it)");

report();
await close();
