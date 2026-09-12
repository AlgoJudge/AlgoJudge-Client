// Every screen, at a phone's width, measured rather than looked at.
//
// **A tool, not a gate.** `ui.spec.mjs` collects `verify-*.mjs`; this is named
// otherwise on purpose, and `playwright.mobile.config.mjs` runs it through
// `sweep.spec.mjs`. `check:ui` already takes six or seven minutes and blocks a
// merge; forty routes at two widths do not belong in it.
//
//     npm run check:mobile              every route
//     npm run check:mobile -- 360       one width
//
// **What it can and cannot see.** `harness.mjs` maps
// `Page.setDeviceMetricsOverride` onto `setViewportSize` alone and discards
// `mobile` and `deviceScaleFactor`, so this is a narrow window and not a phone:
// no touch, no coarse pointer, no device pixel ratio. Every rule this work adds
// therefore keys on **width**, because a `@media (pointer: coarse)` rule would be
// one nothing here could check.
//
// The three probes are the repository's own, borrowed from where they already
// work: the width loop and `scrollWidth - clientWidth` from `verify-hero`, the
// clipped-label arithmetic from `verify-sessions`, and `elementFromPoint` at a
// control's own centre from `verify-mobile` — which asks *would a finger reach
// this*, where intersecting boxes only asks whether two rectangles touch.
import { open, results } from "./harness.mjs";

const APP = process.env.APP ?? "http://localhost:5180";
const { send, evaluate, wait, shot, go, close } = await open();
const { check, report } = results();

/** 360 is the narrowest width that really occurs; 768 is where the shell switches. */
const WIDTHS = (process.env.WIDTHS ?? "360,768").split(",").map(Number);

const AMY = "fakeUser=amy";
const JOHN = "fakeUser=john";

/**
 * Every route the fake can reach, with an address that shows something.
 *
 * `go` and not `visit`: the `fake*` parameters are read once, while the fake is
 * built, so a route reached by `pushState` carries no session.
 */
const ROUTES = [
    ["/", "?" + AMY],
    ["/login", ""],
    ["/register", "?fakeRegistration=on"],
    ["/terms", ""],
    ["/account", "?" + AMY],
    ["/activities", "?" + AMY],
    ["/activities/AMMPZ-2019", "?" + AMY],
    ["/activities/AMMPZ-2019/problems", "?" + AMY],
    ["/activities/AMMPZ-2019/problems/A", "?" + AMY],
    ["/activities/AMMPZ-2019/submit/D", "?" + AMY],
    ["/activities/AMMPZ-2019/submissions", "?" + AMY],
    ["/activities/AMMPZ-2019/ranking", "?" + AMY],
    ["/activities/PROG-1-LA/ranking", "?" + AMY],
    ["/activities/AMMPZ-2019/questions", "?" + AMY],
    ["/activities/AMMPZ-2019/rules", "?" + AMY],
    ["/activities/PROG-1-LA/submissions/sub-series-w2-student-me-uva100-8700", "?" + AMY],
    ["/activities/PROG-1-LA/submissions/sub-series-w2-student-me-uva100-8700/code", "?" + AMY],
    ["/manager", "?" + AMY],
    ["/manager/activities", "?" + AMY],
    ["/manager/activities/AMMPZ-2019", "?" + JOHN],
    ["/manager/problems", "?" + AMY],
    ["/manager/problems/prob-graf", "?" + AMY],
    ["/manager/submissions", "?" + AMY],
    ["/manager/questions", "?" + AMY],
    ["/manager/users", "?" + AMY],
    ["/manager/grants", "?" + AMY],
    ["/manager/permission-templates", "?" + AMY],
    ["/manager/runners", "?" + AMY],
    ["/manager/instance", "?" + JOHN],
    ["/manager/external-content", "?" + JOHN],
    ["/manager/oidc", "?" + JOHN],
    ["/manager/lti", "?" + JOHN],
    ["/lti/launched", "?ticket=demo&" + AMY],
    ["/lti/failed", "?reason=activity.unpublished"],
    ["/lti/sign-in", "?returnTo=%2Flti%2Flaunched"],
    ["/lti/choose", "?code=demo&" + AMY],
];

/**
 * What is wrong with this page at this width, measured in the page.
 *
 * **Only the outermost offender is reported.** An element that crosses the right
 * edge drags every child across it too, so listing them all buries the one that
 * caused it: an element counts only when its parent stays inside.
 */
const audit = () => evaluate(`
    const W = window.innerWidth;
    const H = window.innerHeight;

    const shown = (el) => {
        const s = getComputedStyle(el);
        if (s.display === "none" || s.visibility === "hidden" || s.opacity === "0") return false;
        const b = el.getBoundingClientRect();
        return b.width > 0 && b.height > 0;
    };

    const name = (el) => {
        const id = el.getAttribute("data-testid");
        const text = (el.innerText || el.value || "").replace(/\\s+/g, " ").trim().slice(0, 32);
        return (id ? "@" + id + " " : "") + el.tagName.toLowerCase() + (text ? " " + JSON.stringify(text) : "");
    };

    /*
     * Two subtrees this cannot judge, and neither of them is ours to lay out.
     *
     * Monaco sizes its own scrollable world in a 16777216px box and parks the
     * hidden textarea it reads keystrokes from underneath it, so both the
     * "past the edge" and the "covered" report describe the editor working
     * rather than a defect. KaTeX renders every formula twice: the visible
     * katex-html, and a katex-mathml copy for a screen reader that is clipped
     * rather than hidden — it measures its full width while showing nothing.
     * The visible half is still measured.
     *
     * No backticks in here: this comment is inside a template literal, and one
     * ends it.
     */
    const ignored = (el) => el.closest(".monaco-editor, .katex-mathml") !== null;

    /*
     * Whether something is reachable by dragging a box sideways rather than by
     * dragging the page.
     *
     * The two are different defects and the first is sometimes the design: the
     * framed LTI bar scrolls its own links on purpose, and a table above the
     * card breakpoint is meant to. Reporting both as "past the edge" made the
     * deliberate ones indistinguishable from a layout nobody can reach the end
     * of.
     */
    const scroller = (el) => {
        for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
            const x = getComputedStyle(a).overflowX;
            if (x === "auto" || x === "scroll") return a;
        }
        return null;
    };

    const root = document.documentElement;
    const sideways = root.scrollWidth - root.clientWidth;

    // Past the right edge, and the first one that is.
    const over = [];
    const within = [];
    for (const el of document.querySelectorAll("body *")) {
        if (!shown(el) || ignored(el)) continue;
        const box = el.getBoundingClientRect();
        if (box.right <= W + 1) continue;
        const parent = el.parentElement;
        if (parent && parent !== document.body) {
            const outer = parent.getBoundingClientRect();
            if (outer.right > W + 1) continue;
        }
        if (scroller(el)) within.push(name(el) + " to " + Math.round(box.right));
        else over.push(name(el) + " to " + Math.round(box.right));
    }

    // A control something else is drawn on top of, asked where a finger lands.
    const controls = document.querySelectorAll(
        "button, a[href], input, select, textarea, [role=tab], [role=menuitem], [role=switch]");
    const covered = [];
    const small = [];
    for (const el of controls) {
        if (!shown(el) || ignored(el)) continue;
        const box = el.getBoundingClientRect();
        if (box.bottom < 0 || box.top > H || box.right < 0 || box.left > W) continue;
        if (box.height < 32 || box.width < 32) small.push(name(el) + " " + Math.round(box.width) + "x" + Math.round(box.height));
        const x = Math.round(box.left + box.width / 2);
        const y = Math.round(box.top + box.height / 2);
        if (x < 0 || x > W || y < 0 || y > H) continue;
        // Inside a box that scrolls sideways, the point a control's own centre
        // names may hold whatever is scrolled over it — an answer about the
        // scroll position, not about the layout.
        if (scroller(el)) continue;
        const hit = document.elementFromPoint(x, y);
        if (hit && hit !== el && !el.contains(hit) && !hit.contains(el)) {
            covered.push(name(el) + " under " + name(hit));
        }
    }

    // A label cut rather than wrapped: it overflows its own box, and its box hides it.
    const clipped = [];
    for (const el of document.querySelectorAll("body *")) {
        if (!shown(el) || ignored(el)) continue;
        if (el.children.length > 0) continue;
        const s = getComputedStyle(el);
        if (s.overflowX !== "hidden" && s.textOverflow !== "ellipsis") continue;
        if (el.scrollWidth > el.clientWidth + 1) clipped.push(name(el));
    }

    return JSON.stringify({ sideways, over, within, covered, small, clipped });
`);

const trim = (list, keep = 4) =>
    list.length <= keep ? list : [...list.slice(0, keep), "and " + (list.length - keep) + " more"];

for (const width of WIDTHS) {
    send("Page.setDeviceMetricsOverride", { width, height: 740, deviceScaleFactor: 1, mobile: true });

    for (const [path, query] of ROUTES) {
        await go(`${APP}${path}${query}`, `document.body.innerText.length > 40`);
        await wait(1200);

        const found = JSON.parse(await audit());
        // The route on every line: `check` buffers its verdicts to the end,
        // so a detail printed bare cannot be told apart from its neighbour's.
        const here = `  ${width} ${path}`;
        const wrong = found.sideways > 1 || found.over.length > 0 || found.covered.length > 0;

        check(!wrong, `${width}  ${path}`);
        if (wrong) {
            if (found.sideways > 1) console.log(`${here}  scrolls sideways by ${found.sideways}px`);
            for (const one of trim(found.over)) console.log(`${here}  past the edge: ${one}`);
            for (const one of trim(found.covered)) console.log(`${here}  covered: ${one}`);
            await shot(`sweep-${width}-${path.replace(/[^a-zA-Z0-9]+/g, "-")}`);
        }
        // Reported but not a failure: a box that scrolls sideways is sometimes
        // the design. Worth reading, not worth a red line.
        if (found.within.length > 0) {
            for (const one of trim(found.within, 2)) console.log(`${here}  drag-to-reach: ${one}`);
        }
        if (found.clipped.length > 0 || found.small.length > 0) {
            console.log(`${here}  (${found.clipped.length} clipped, ${found.small.length} under 32px)`);
        }
    }
}

report();
close();
