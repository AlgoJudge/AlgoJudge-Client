// When a credential for the problem archive may still be sent, and what is said
// when the exchange refuses.
//
// **Its own check because nothing else can reach this rule.** The picker is a
// live iframe on somebody else's host, so `check:ui` has never driven it and
// must not start: a browser suite that loads a third party is a suite that goes
// red when that third party has a bad morning. What is left is a pure module,
// and this drives it in Node with no browser and no Server, on the pattern
// `check-package.mjs` set.
import { execFileSync } from "node:child_process";

const OUT = ".access-check";

execFileSync("npx", ["tsc",
    "src/pages/manager/external/access.ts",
    "--outDir", OUT, "--rootDir", "src",
    "--module", "esnext", "--target", "es2022", "--moduleResolution", "bundler", "--skipLibCheck",
], { stdio: "inherit", shell: process.platform === "win32" });

const { usable, refusal } = await import(`../${OUT}/pages/manager/external/access.js`);

const fail = (message) => { console.error("FAIL:", message); process.exitCode = 1; };
const ok = (message) => console.log("  ok  ", message);
const check = (condition, message) => condition ? ok(message) : fail(message);

// A fixed instant, so "in ten minutes" means the same thing on every machine and
// at every hour. A check that reads the wall clock is a check that fails at
// midnight — this suite has had one.
const NOW = Date.parse("2026-08-26T12:00:00.000Z");
const inSeconds = (seconds) => new Date(NOW + seconds * 1000).toISOString();

// ── 1. Nothing to send ──────────────────────────────────────────────────────

check(usable(undefined, NOW) === false,
    "nothing has been asked for yet, so there is nothing to send");

// **Anonymous is asked again every time.** An administrator may have set the key
// since, and this screen cannot hear about it; caching the answer would strand a
// manager on the public archive until they reloaded.
check(usable("anonymous", NOW) === false,
    "anonymous is asked again rather than kept");

// ── 2. A credential with no death ───────────────────────────────────────────
//
// What a key that is not minted answers with. It has no `expiresAt` at all, and
// treating that as expired would ask the Server for a new one on every open.

check(usable({ value: "stored-as-is" }, NOW) === true,
    "a credential with no expiry does not expire");

// ── 3. The margin ───────────────────────────────────────────────────────────
//
// The credential is spent when the iframe loads, which is after this decision.
// One that dies in between fails on the far side, and what a manager sees is an
// archive with nothing in it and nothing to explain why.

check(usable({ value: "t", expiresAt: inSeconds(3600) }, NOW) === true,
    "an hour of life is worth sending");
check(usable({ value: "t", expiresAt: inSeconds(600) }, NOW) === true,
    "ten minutes is worth sending");
check(usable({ value: "t", expiresAt: inSeconds(30) }, NOW) === false,
    "thirty seconds is not: it would be spent after this decision, not before");
check(usable({ value: "t", expiresAt: inSeconds(-1) }, NOW) === false,
    "and one already dead certainly is not");

// The boundary itself, stated so a margin changed by accident is a changed
// number here rather than a silent change in behaviour.
check(usable({ value: "t", expiresAt: inSeconds(61) }, NOW) === true,
    "the margin is one minute — 61 seconds is usable");
check(usable({ value: "t", expiresAt: inSeconds(60) }, NOW) === false,
    "and exactly 60 is not");

// ── 4. An expiry nobody can read ────────────────────────────────────────────
//
// Counts as spent. Asking again costs one call; trusting a date nobody could
// parse costs a picker quietly showing the public archive while a private key
// sits configured.
//
// **These two assert behaviour, and they do not stand behind the
// `Number.isNaN` guard in `access.ts`** — measured 2026-08-26 by removing it,
// which these did not notice. `Date.parse` answers `NaN`, and every comparison
// against `NaN` is false, so the margin test already refuses an unreadable date.
// What the guard is for is a rewrite to `dies < now`, which reads as the same
// rule and would call an unreadable expiry usable. Nothing here can tell that
// apart; the comment there is what carries it.

check(usable({ value: "t", expiresAt: "not a date" }, NOW) === false,
    "an unreadable expiry counts as spent");
check(usable({ value: "t", expiresAt: "" }, NOW) === false,
    "and so does an empty one");

// ── 5. The refusals each keep their own sentence ────────────────────────────
//
// The Server sends a code and this side writes the words. What matters is that
// the four do not collapse into one: they have different people who can act on
// them, and "something went wrong" tells none of them anything.

const said = (code) => refusal(key => key, code);

const codes = ["accessKey.rejected", "accessKey.originRefused", "accessKey.tokenLimit"];
const sentences = codes.map(said);

check(new Set(sentences).size === codes.length,
    `the three named refusals say three different things (${sentences.length})`);
check(!sentences.includes(said(undefined)),
    "and none of them says what an unknown refusal says");
check(said("accessKey.somethingNew") === said(undefined),
    "a code this side has not heard of falls back rather than showing the code");

for (const [code, sentence] of codes.map((code, i) => [code, sentences[i]])) {
    check(typeof sentence === "string" && sentence.length > 0 && !sentence.includes(code),
        `${code} is a sentence rather than the code itself`);
}

if (process.exitCode) console.error("\naccess check failed");
else console.log("\naccess check passed");
