// How an instant becomes text: the offset, the locale and the zones a browser
// check can never reach.
//
// **Its own check because `check:ui` cannot get to any of this.** The activity
// form offers three zones and every fixture is Europe/Warsaw, so a half-hour
// offset, a negative half-hour offset, a quarter-hour one, the wording at zero
// and an identifier the runtime rejects are all unreachable from a browser —
// and all pure functions. This drives them in Node with no browser and no
// Server, on the pattern `check-access.mjs` set.
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const OUT = ".time-check";

execFileSync("npx", ["tsc",
    "src/components/time/zones.ts",
    "--outDir", OUT, "--rootDir", "src",
    "--module", "esnext", "--target", "es2022", "--moduleResolution", "bundler", "--skipLibCheck",
    "--ignoreConfig",
], { stdio: "inherit", shell: process.platform === "win32" });

const { formatInZone, offsetLabel, zonedLine, resolveZone, sameDayInZone } =
    await import(`../${OUT}/components/time/zones.js`);

const fail = (message) => { console.error("FAIL:", message); process.exitCode = 1; };
const ok = (message) => console.log("  ok  ", message);
const check = (condition, message) => condition ? ok(message) : fail(message);

// A fixed instant, because an offset is a function of the date: Warsaw is +2 in
// October and +1 in January, and a check reading the wall clock would assert a
// different thing every March.
const SUMMER = "2026-10-20T22:00:00.000Z";
const WINTER = "2026-01-20T22:00:00.000Z";

// ── 1. The word is UTC, and the sign is a minus sign ────────────────────────

check(offsetLabel(SUMMER, "Europe/Warsaw") === "UTC+2",
    `Warsaw in October is UTC+2 (${offsetLabel(SUMMER, "Europe/Warsaw")})`);
check(offsetLabel(SUMMER, "America/New_York") === "UTC−4",
    `New York is UTC−4, with U+2212 (${JSON.stringify(offsetLabel(SUMMER, "America/New_York"))})`);
check(!offsetLabel(SUMMER, "America/New_York").includes("-"),
    "and not an ASCII hyphen, which is what every Intl answer would have given");

for (const zone of ["Europe/Warsaw", "America/New_York", "Asia/Kolkata", "UTC", "Europe/London"]) {
    check(!/GMT/.test(offsetLabel(SUMMER, zone) + zonedLine(SUMMER, zone)),
        `${zone} says nothing about GMT`);
}

// ── 2. Offsets that are not a whole number of hours ─────────────────────────
//
// Unreachable from the interface, which offers three European zones — and
// exactly the shape a naive `hours` computation gets wrong.

check(offsetLabel(SUMMER, "Asia/Kolkata") === "UTC+5:30",
    `India is UTC+5:30 (${offsetLabel(SUMMER, "Asia/Kolkata")})`);
check(offsetLabel(WINTER, "America/St_Johns") === "UTC−3:30",
    `Newfoundland is UTC−3:30 in January (${offsetLabel(WINTER, "America/St_Johns")})`);
check(offsetLabel(SUMMER, "Pacific/Chatham") === "UTC+13:45",
    `Chatham is UTC+13:45 (${offsetLabel(SUMMER, "Pacific/Chatham")})`);

// ── 3. Zero is written UTC, not UTC+0 ───────────────────────────────────────

check(offsetLabel(SUMMER, "UTC") === "UTC", `UTC is UTC (${offsetLabel(SUMMER, "UTC")})`);
check(offsetLabel(WINTER, "Europe/London") === "UTC",
    `and so is London in January (${offsetLabel(WINTER, "Europe/London")})`);
check(offsetLabel(SUMMER, "Europe/London") === "UTC+1",
    `while London in October is UTC+1 (${offsetLabel(SUMMER, "Europe/London")})`);

// ── 4. Daylight saving is followed, not assumed ─────────────────────────────

check(offsetLabel(WINTER, "Europe/Warsaw") === "UTC+1",
    "Warsaw is UTC+1 in January, so the offset is read at the instant");
check(offsetLabel(WINTER, "America/New_York") === "UTC−5",
    "and New York is UTC−5");

// ── 5. An identifier the runtime rejects does not take the page down ────────
//
// A zone reaches the Client from the Server and, through the exchange bundle
// and the ZawodyWeb converter, from a file somebody wrote. `Intl` throws a
// RangeError on an unknown one, and a throw during render unmounts the React
// root: a white page, no message, no route, on every screen with a date.

for (const bad of ["Mars/Olympus", "", "Europe/Warszawa"]) {
    let threw = false;
    try {
        formatInZone(SUMMER, bad);
        offsetLabel(SUMMER, bad);
        zonedLine(SUMMER, bad);
    } catch { threw = true; }
    check(!threw, `${JSON.stringify(bad)} falls back instead of throwing`);
}
check(resolveZone("Mars/Olympus") !== "Mars/Olympus",
    "and the line names the zone it actually used, not the one it was given");

// ── 6. The date follows the interface's language ────────────────────────────
//
// Nothing else in the suite renders English: all four Playwright configs pin
// `locale: "pl-PL"`. So the `en` path is untested by construction unless it is
// tested here — and it is the path where `en-US` would have brought back both a
// 12-hour clock and the word GMT.

const speaking = async (language, what) => {
    const i18n = (await import("i18next")).default;
    i18n.language = language;
    i18n.resolvedLanguage = undefined;
    return what();
};

check(await speaking("pl", () => formatInZone(SUMMER, "Europe/Warsaw")) === "21.10.2026 00:00",
    "Polish reads 21.10.2026 00:00");
check(await speaking("en", () => formatInZone(SUMMER, "Europe/Warsaw")) === "21/10/2026 00:00",
    "English reads 21/10/2026 00:00");
check(await speaking("en-US", () => formatInZone(SUMMER, "Europe/Warsaw")) === "21/10/2026 00:00",
    "and a browser saying en-US still gets a 24-hour clock and a day-first date");
check(await speaking("pl-PL", () => formatInZone(SUMMER, "Europe/Warsaw")) === "21.10.2026 00:00",
    "as does one saying pl-PL");

// ── 7. The whole line, as it appears in a tooltip ───────────────────────────

check(zonedLine(SUMMER, "Europe/Warsaw") === "21.10.2026 00:00 UTC+2 (Europe/Warsaw)",
    `the activity's line (${zonedLine(SUMMER, "Europe/Warsaw")})`);
check(zonedLine(SUMMER, "America/New_York") === "20.10.2026 18:00 UTC−4 (America/New_York)",
    `and the reader's (${zonedLine(SUMMER, "America/New_York")})`);

// ── 8. "Today" is decided in the zone the row is drawn in ───────────────────
//
// The defect of 2026-08-30, and the shape it would come back in. A browser
// check can only reach this by sitting on midnight in one zone and not the
// other, so it is asserted here instead: the same pair of instants, and the
// answer follows the zone it is asked about.
//
// 20 October, 21:00 in New York, is already the 21st in Warsaw. So a submission
// made four hours earlier is "today" to a New York reader and yesterday to a
// Warsaw one — which is exactly the disagreement that printed a date where an
// hour belonged.
const NOW = "2026-10-21T01:00:00.000Z";      // NY 20th 21:00 · Warsaw 21st 03:00
const EARLIER = "2026-10-20T21:00:00.000Z";  // NY 20th 17:00 · Warsaw 20th 23:00

check(sameDayInZone(EARLIER, NOW, "America/New_York") === true,
    "to a New York reader that submission is today, so the row shows the hour");
check(sameDayInZone(EARLIER, NOW, "Europe/Warsaw") === false,
    "to a Warsaw one it is yesterday — the two disagree, which is the whole case");

// And the call site has to ask in the zone it renders in. A string literal or a
// stray `activity.timeZone` here typechecks forever.
const panel = readFileSync("src/components/activity/ActivitySubmissions.tsx", "utf8");
check(/sameDayInZone\([\s\S]{0,150}?viewerZone\(\)\s*\)/.test(panel),
    "and ActivitySubmissions asks in the reader's zone, which is the one it draws in");

// ── 9. No call site invents a zone ──────────────────────────────────────────
//
// Seventeen `<ActivityTime>` used to pass a literal `timeZone="Europe/Warsaw"`
// for instants belonging to no activity, which was wrong for every reader
// outside Poland. Making the prop optional does not stop a new one from appearing —
// a string literal typechecks forever — so this is what keeps it from rotting
// back.

const sources = [];
const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (entry.name.endsWith(".tsx")) sources.push(path);
    }
};
walk("src");

const literals = sources.filter(path =>
    /<ActivityTime[^>]*timeZone="[^"]+"/s.test(readFileSync(path, "utf8")));
check(literals.length === 0,
    `no <ActivityTime> names a zone as a string literal (${literals.join(", ") || "none"})`);

console.log("");
console.log(process.exitCode ? "time check failed" : "time check passed");
