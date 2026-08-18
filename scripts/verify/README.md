# Browser checks

Scripts that drive a real browser against the application running on the fake
API. They exist because the gate — lint, `lint:deps`, typecheck, build and the
`check:` scripts — cannot see a screen. Nothing it runs has ever caught a
rendering or a wiring defect; everything here has.

**They moved onto Playwright on 2026-08-18.** They were written against the
DevTools protocol directly, with `cdp.mjs` as the shared harness and fifteen of
the scripts carrying their own copy of it. `harness.mjs` is that harness now,
Playwright underneath and the same eleven functions on top, so what changed in a
script is the line that opens the tab. Nothing about what they assert changed,
and the traps below are the reason it was done that way.

## In CI, and not a gate

**CI runs them now**, in a job of its own, and **`continue-on-error`** — the
result is reported on every run and blocks no merge. Two of the three reasons
they were kept out are gone:

- ~~they need a dev server **and** a browser, which CI has no orchestration
  for~~ — `playwright.ui.config.mjs` starts the application with `webServer`,
  and the browser comes with the dependency;
- ~~a full run is minutes~~ — it still is, and that is now somebody else's
  twenty minutes rather than yours.

**The third reason stands, and it is why this does not gate:** they match on
Polish interface text and on Mantine's generated class names, so a translation
or a component upgrade reddens them for no product reason. Blocking a merge on
that would teach everybody to ignore a red mark, which costs more than the
signal is worth.

**What would make it a gate**: assertions addressed through test ids rather than
through the words on the screen. Until somebody does that, this is the same
bargain as `check:api` — worth having in every run, not worth blocking on.

## Running them

    npm run check:ui

That is all of it. The dev server is started for you, with
`VITE_APP_USE_FAKE_API` set — **which is not optional**: without it the Client
serves the real HTTP client, every call 404s, the application sits on the login
screen, and every script times out saying only that it waited for something that
never appeared. One you already have on `5180` is reused rather than fought
with.

    npm run check:ui -- boards     only the scripts whose name contains "boards"
    npm run check:ui -- --headed   watch it happen
    APP=http://localhost:4173 npm run check:ui       against a preview build

Screenshots go to `out/`, which is not committed. A script writes one at each
point worth looking at; when something fails, the picture usually says why faster
than the assertion does — and a failure now also leaves a **trace**, which
`npx playwright show-trace test-results/<name>/trace.zip` replays step by step.

**Running one with `node` directly does not work any more.** A script has no tab
of its own: `ui.spec.mjs` makes a test of each and hands it one. `npm run
check:ui -- <name>` is the way to run a single script, and the harness says so
when something tries the old way.

## Browsers are closed by pid, never by name

    npm run browsers -- list          what we started, and what is still alive
    npm run browsers -- stop --all    close all of it

**Never `taskkill /IM chrome.exe`, `Stop-Process -Name chrome` or `pkill
chrome`.** They close the browser somebody is reading in — the real cost of that
has been paid here — and there is no version of them that does not. Every browser
started by anything in this directory goes through `browser.mjs`, which writes
its pid to a registry under the system temporary directory, outside every
repository, so it survives the death of whatever started it. Nothing is closed
without a pid **and** a live process whose command line still carries our own
profile path; `npm run check:browsers` drives that against browsers deliberately
not ours and ends by asserting every other browser on the machine is still
running.

The profiles live beside the registry rather than in `out/`, which is what makes
the one-substring test possible. Two things measured on Windows on 2026-08-16,
both worth knowing before changing any of it:

- a browser started the ordinary way **dies with the process that started it**,
  even with the shell still alive — good, and the reason a leak has to be staged
  deliberately to be tested at all;
- `child.kill()` **terminates** rather than signalling, so no handler in the
  child runs and a script cannot stage a Ctrl+C. A Ctrl+C typed at a real console
  does reach the process group, which is a different thing and the one that
  matters — it is just not something a check here can drive, so the runner's
  teardown is verified through a clean exit and **Ctrl+C stays `Unable to
  verify`**. The registry covers it either way.

## What they cover

| Script | What it holds to |
|---|---|
| `verify-activity` | an activity's own page, self-enrolment, statements by reference |
| `verify-activity-manager` | the manager's activity screens |
| `verify-boards` | the ranking window per round, the combined board's columns, the clock |
| `verify-closed` | what a paused or finished round refuses, from every way in |
| `verify-notifications` | what is announced, where it sits, where clicking it goes |
| `verify-results` | the results feed: disclosure, the freeze, the asterisk, `extra` |
| `verify-series` | shifting a round, stopping it, starting it again |
| `verify-seven`, `verify-six` | two batches of accepted changes, kept as regressions |
| `verify-submit-modal` | sending from the submissions panel |
| `verify-sync` | the two halves of the fake agreeing about the same activity |
| `verify-uva` | a problem judged elsewhere: its statement is a copy served from here, and no participant screen reaches another host |
| `verify-external-judging` | the instance switch that lets work leave the building: off to begin with, and its saved value survives leaving the screen |
| `verify-external-content` | the hosts the Server may fetch from: added and removed entries survive leaving the screen, and the switch being off is said plainly |
| `verify-systemic` | systemic users: not counted, not ranked, still able to submit |

## A single failure is worth re-running

These drive a real browser, so they race. The pattern found on 2026-08-07, in
three different scripts over four full runs: a `go(url, …)` whose condition is
satisfied **before the page has decided anything** — `document.body !== null` is
true while the session is still resolving, and `innerText.length > 0` is true
while `RequirePermission` is still drawing its spinner. The assertion then reads
a page mid-flight and fails on something that is right.

Each was fixed by waiting for the **decision** rather than for its outcome: for
the spinner to go, or for either branch to be on screen — then asserting which.
That is not the same as waiting for what is asserted, which would be a check that
can never fail.

Some residue remains. One red script in an otherwise green run is more likely a
race than a regression: re-run it on its own —
`npm run check:ui -- <name>` — before believing it. Two failures in a row, or the
same assertion twice, is a defect.

## What they do not cover

Left out on purpose when the suite was collected on 2026-08-07, so the gaps are
visible rather than forgotten:

- **`apiBase.ts`** — that the Client asks `/api/v1` and nothing else. Its check
  needs the **real** HTTP client, which is the opposite of the configuration
  every script here runs under, and there is no orchestration for two servers.
- **The censoring of an external link in a statement**, and **the instance
  mark**. Both had a script; both were failing, and both carry their own copy of
  the harness from before `cdp.mjs` existed. Port them onto it when somebody next
  touches those screens rather than leaving something red in the suite.

**None of them carries an inline harness any more.** Fifteen did until
2026-08-18, each a copy of `cdp.mjs`'s internals at whatever revision it was
pasted at; the move onto Playwright deleted all fifteen, which is where most of
that change's eleven hundred removed lines came from. A new script imports
`harness.mjs`, and there is no longer an older way for one to be written in.

## Traps these encode

Each of these cost an hour to find. They are the reason the scripts are worth
keeping rather than rewriting.

- **Mantine keeps every tab panel mounted and laid out.** `offsetParent` does not
  tell the visible panel from the hidden ones. Scope by something in the panel's
  own content.
- **`Badge` uppercases its text, and `innerText` reflects it.** Match case
  insensitively or the assertion fails against text that is on the screen.
- **The sidebar repeats words the main area uses** — "Wyślij zgłoszenie" is a
  navigation entry as well as a button. Scope page-level lookups to
  `[class*=AppShell-main]`, or to the card or modal being tested.
- **A contest has four rounds, each with the same controls.** `find(b =>
  b.textContent === "Wstrzymaj")` reaches the round that ended yesterday. Address
  a control through the `[class*=Accordion-item]` whose text starts with the
  round's name.
- **`visit()` is a `pushState`**, so `?fakeUser=` in the path does not change who
  is signed in; only `go()` does, and it rebuilds the fake, losing anything saved
  in the tab. Reading back a manager's change as another user is not possible in
  one run.
- **Monaco ignores a `value` set on its hidden textarea.** Click `.view-lines`
  and send `Input.insertText`. Read it back from `.view-lines`, with ` `
  normalised to a space.
- **`performance.getEntriesByType("resource")` does not see an `<object>` load.**
  Sabotaged by pointing a statement's `<object>` at another host, the resource
  sweep stayed green and only an explicit check of the element's address went
  red. Anything embedded has to be checked by its address; the sweep is a net,
  not the guard.
- **Mantine's grouped `Select` wants `{ group, items }`.** A flat option carrying
  a `group` key is read as a group whose `items` are missing, and the component
  throws.
- **A browser's children repeat its whole command line.** Chrome's renderers
  carry `--user-data-dir` and Firefox's content processes carry `--profile`, so
  anything matching on those sees one browser as nine. The parent is the process
  with no `--type=` and no `-contentproc`.
- **Firefox has had no DevTools protocol since 129**, which is why the old
  harness could not drive it; `browser.mjs` starts one and hands back a
  WebDriver BiDi endpoint, and writing a client for it was left to whoever
  needed one. Its `browser.close` wants a session first — without one it answers
  *"WebDriver session does not exist"* and the browser stays up, which reads
  exactly like a close that worked. **Playwright removes the reason this was a
  problem** — it drives Firefox and WebKit itself, so a suite that wanted more
  than Chromium would add a `projects` entry rather than a protocol client. The
  note stays because `browser.mjs` still starts Firefox for measurements, and
  the close is still a trap there.

## Writing another

`harness.mjs` is the whole harness — a tab, and the few things worth not writing
twice. Drop the file in beside the others as `verify-<something>.mjs` and
`ui.spec.mjs` picks it up; there is nothing to register.

```js
import { open, results } from "./harness.mjs";

const APP = process.env.APP ?? "http://localhost:5180";
const { evaluate, wait, shot, go, visit, click } = await open();
const { check, report } = results();

await go(`${APP}/activities?fakeUser=amy`, `document.body.innerText.includes("Aktywno")`);
check(await evaluate(`return location.pathname === "/activities";`), "what it should hold to");

report();
```

`go(url, waitFor)` loads and waits for a condition; `visit(path, waitFor)` moves
within the application; `click(locator)` takes a JavaScript expression returning
an element and clicks where it actually is; `shot(name)` writes a screenshot.
`report()` prints the checks that passed — **it no longer decides anything**:
`check` is a soft assertion, so the runner fails the test on its own and would
do so even if a script ended without calling `report`.

**Assert against the application, not against a constant.** A check that a name
matches a string written here only proves the fixture still says what it said;
one that compares the same fact read from two screens proves they agree. That
distinction is what made `verify-sync` find anything.
