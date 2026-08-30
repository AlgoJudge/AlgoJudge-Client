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

## In CI, and it gates

**Since 2026-08-30 a red run blocks a merge.** It ran in CI from 2026-08-18 in a
job of its own with `continue-on-error`, because it could go red without a
defect. Both ways it could are closed:

- **Selectors.** It matched Mantine's *generated* class names in 208 places, so a
  component upgrade reddened it for nothing. One is left,
  `[class*=Pill-root]` — a pill cannot be given a test id from the theme — and it
  says so where it is used. Controls are found by `data-testid`; text is what
  assertions **judge**, which is the split worth keeping.
- **Races.** Three scripts waited for words that were true before the element
  they then read existed, and each was fixed at the cause: `maintenance`,
  `exchange`, `notifications`.

**`retries` is 0 and stays 0.** A red mark a retry can erase is a red mark nobody
fixes.

**Anything written before 2026-08-30 that says this does not gate is out of
date** — and note that while it did not, the run said *success* either way, so
older evidence about it has to be read off the **job**, never the run.

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
    npm run check:ui -- --workers=1   one at a time, when a race is suspected
    APP=http://localhost:4173 npm run check:ui       against a preview build

**Four run at once**, which is what makes a full run about four and a half
minutes rather than seventeen. Nothing is shared between them — each test gets
its own browser context — but they do share one dev server, and that contention
is enough to expose a race a script has been carrying quietly. That is the
script's bug rather than the setting's, and `--workers=1` is how to tell the two
apart before believing either.

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

**All 47 of them**, counted with `ls scripts/verify/verify-*.mjs | wc -l` on
2026-08-30 and grouped by area, because a flat list of 47 is a list nobody reads
to the end. `ui.spec.mjs` enumerates the directory, so this table is a
description of the suite and never its definition — a script that is here runs
whether or not it is named below.

*This section listed fourteen rows and did not say it was a selection*, so a gap
in the suite and a gap in the table looked the same. Completed 2026-08-30.

**Activities and rounds**

| Script | What it holds to |
|---|---|
| `verify-activity` | an activity's own page, self-enrolment, and the documents behind both |
| `verify-activity-manager` | what a manager does to an activity: publishes its documents, sets how people join, makes accounts for a class that has none |
| `verify-activity-type` | the activity type is chosen from what this Client can present, in the create form and the settings form |
| `verify-series` | moving a round, stopping it, and being told about it |
| `verify-settings` | when the standings may be read, and whether a finished round keeps its problems |
| `verify-closed` | what a paused or finished round shows and still accepts, from every way in |
| `verify-copy` | copying a round, and being told that a copy is a shape and not a history |
| `verify-lockdown` | a running round puts the rest out of reach, scoped to its own activity |
| `verify-points` | what a problem is worth in its round, and what it may be written in |
| `verify-groups` | several people competing as one, on the manager's screen |

**Problems, statements and submitting**

| Script | What it holds to |
|---|---|
| `verify-first` | a brand new problem: statement, attachment and package, published together as version 1 |
| `verify-menus` | an image menu that offers only images, and a link menu for the rest |
| `verify-limits` | the limits a participant reads, on the two axes a package states them |
| `verify-submit-modal` | sending from the submissions panel, and the bar's two controls |
| `verify-attachments` | what a submission carries, and who may read each part of it |
| `verify-submission-origin` | the address, browser and session on one submission's detail — and on no list |

**Results and boards**

| Script | What it holds to |
|---|---|
| `verify-results` | the results feed: disclosure, the freeze, the asterisk, `extra` |
| `verify-boards` | the ranking window per round, the combined board's columns, the clock, the panel |
| `verify-excluded` | a manager rules a submission out of the ranking, and the screens follow |
| `verify-systemic` | systemic users: not counted, not ranked, still able to submit |

**The shell, navigation and what an installation looks like**

| Script | What it holds to |
|---|---|
| `verify-shell` | the shell follows the session — one page, two chromes, no flash of the wrong one |
| `verify-nav` | the front pages, the instance mark, and navigation obeying permissions |
| `verify-navbar` | more entries than window: the middle scrolls, the mark and the foot links do not |
| `verify-clicks` | the name opens the thing it names, on the four screens where it did not |
| `verify-notifications` | what is announced, where it sits, where clicking it goes |
| `verify-theme` | the colour scheme applied, remembered, and legible once it is dark |
| `verify-prefs` | one setting, one store, across the application shell and a public page |
| `verify-name` | the instance names itself: beside the mark in both shells, and in the tab |
| `verify-instance` | an operator writes what the instance says about itself, including saying nothing |
| `verify-maintenance` | what a person sees while the Server is away, and that it covers the login form too |

**Accounts, sessions and links**

| Script | What it holds to |
|---|---|
| `verify-login` | a refused sign-in is still reported as refused, not as an unknown failure |
| `verify-merge` | carrying one account's work onto another, and the preview that guards it |
| `verify-sessions` | what is connected, what only signed in, and the empty state |
| `verify-device-id` | the name this browser gives itself: minted, kept, and surviving refused storage |
| `verify-share-field` | the link a manager copies, under each of the three policies |
| `verify-share-link` | that link opened by somebody signed out, password intact through the sign-in screen |

**Runners, and work that leaves the building**

| Script | What it holds to |
|---|---|
| `verify-runners` | closing the Runner panel takes the Runner out of the address too |
| `verify-runner-tags` | which Runners judge which work, on the two screens that decide it |
| `verify-uva` | a problem judged elsewhere: its statement is a copy served from here, and no participant screen reaches another host |
| `verify-external-judging` | the instance switch that lets work leave the building: off to begin with, and its saved value survives leaving the screen |
| `verify-external-content` | the hosts the Server may fetch from: added and removed entries survive leaving the screen, and the switch being off is said plainly |
| `verify-lti` | the launched interface: confined to one activity, and honest when it cannot open |

**Carrying an activity, and the fake agreeing with itself**

| Script | What it holds to |
|---|---|
| `verify-exchange` | exporting an activity and importing it back, through the real screens |
| `verify-sync` | the two halves of the fake agreeing about the same activity |

**Kept as regressions**

| Script | What it holds to |
|---|---|
| `verify-six`, `verify-seven` | two batches of accepted changes |
| `verify-deps` | the two dependency lists that changed shape: one refetch, and a link straight to a Runner |

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

**Running four at a time makes them likelier, and that is useful.** The first
parallel run, on 2026-08-20, reddened `verify-activity`: `go()` was waiting for
`innerText.includes("Aktywno")`, which the sidebar's own navigation satisfies
long before the list arrives, and the click then found no card. The race had
been there since the script was written; contention only made it probable. It
was fixed the way this section prescribes — wait for the cards.

Expect more of those the first time a script meets load. **A script that reddens
only when four are running is that script's bug, not the runner's setting.**

Some residue remains either way. One red script in an otherwise green run is more
likely a race than a regression: re-run it on its own —
`npm run check:ui -- <name>`, or the whole suite with `--workers=1` — before
believing it. Two failures in a row, or the same assertion twice, is a defect.

## What they do not cover

Left out on purpose when the suite was collected on 2026-08-07, so the gaps are
visible rather than forgotten:

- **`apiBase.ts`** — that the Client asks `/api/v1` and nothing else. Its check
  needs the **real** HTTP client, which is the opposite of the configuration
  every script here runs under, and there is no orchestration for two servers.
- ~~**The censoring of an external link in a statement**, and **the instance
  mark**. Both had a script; both were failing, and both carry their own copy of
  the harness from before `cdp.mjs` existed. Port them onto it when somebody next
  touches those screens rather than leaving something red in the suite.~~
  **Half closed, and the stated reason is gone — 2026-08-30.** The instance mark
  is covered: `verify-name` asserts it in both shells and in the tab, and
  `verify-nav` reads it too. The censoring is still uncovered — `ContentView.tsx`
  replaces a link to an unpermitted host with a `<span>`, and no script here
  asserts it. But neither is blocked on a harness any more: `grep -L "harness.mjs"
  scripts/verify/verify-*.mjs` returns nothing, so all 47 import the shared one.

**None of them carries an inline harness any more**, and that is measured rather
than remembered: `grep -L "harness.mjs" scripts/verify/verify-*.mjs` returned
nothing on 2026-08-30. Fifteen did until 2026-08-18, each a copy of `cdp.mjs`'s
internals at whatever revision it was pasted at; the move onto Playwright deleted
all fifteen, which is where most of that change's eleven hundred removed lines
came from. A new script imports `harness.mjs`, and there is no longer an older way
for one to be written in.

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

- **A manager row opens from a `<Text onClick>`, not from the row or the cell.**
  Clicking the middle of the first `td` lands beside the handler as often as on
  it, which reads as a screen that stopped opening. Click
  `td [style*=pointer]`.
- **A mounted tab panel's buttons come first in the document.** Every round in
  the rounds tab has a `Zapisz`, so an unscoped `find(b => b.textContent ===
  "Zapisz")` on the settings tab saves a round and leaves the form untouched —
  and the check then passes or fails for a reason that has nothing to do with
  it. Scope to the `[role=tabpanel]` with an `offsetParent`.
- **A `TagsInput`'s wrapper ends at its own description.** Anything rendered
  under the field — a count, a warning — is a sibling, so
  `InputWrapper-root.textContent` finds the label and never the number. Read the
  card.
- **Its pills are not in `innerText` either**, for the same reason an input's
  value is not: read `[class*=Pill-label]`.
- **No backtick in a comment inside a page script.** The probe strings here are
  template literals, so a backtick anywhere in them — including in prose
  explaining the code — ends the literal, and the failure is a `SyntaxError`
  pointing at a line that looks fine. It has cost two runs.
- **A colour read back from `color-mix()` is not `rgb(...)`.** Chrome computes it
  to `color(srgb 0.87 0.85 0.79)`, and a parser written for `rgb()` answers
  `NaN` rather than failing. Assert on values the product emits as plain hex.
- **A branded colour has to be waited for, not slept on.** The defaults are
  drawn while `/instance` is in flight, so a script that waits for text and then
  reads a colour reads the *unbranded* one. Wait on
  `document.documentElement.dataset.instance === "loaded"`.
- **`/login` is not the public shell if a session is still in the tab.**
  `?fakeUser=` writes it to `sessionStorage` and `/login` then redirects into the
  application, so `document.querySelector("header")` finds `AppShell.Header`
  instead of the public bar. Clear the session first — and only the session, if
  the instance's own settings must survive.

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

**Find by `data-testid`; judge by the words.** Since 2026-08-30 the containers
carry stable ids — `modal`, `card`, `paper`, `app-main`, `app-navbar`,
`accordion-item`, `switch`, `segmented`, `combobox-option`, `notification`,
`badge`, `alert`, `submissions-panel`, `submission-row`, `footer`,
`maintenance` — and so do the controls the scripts drive: `save`, `back`,
`create`, `copy`, `publish`, `pause`/`resume`, `enrol`, `import`, and the rest.
The containers come from `src/theme.ts` in one place; a control's id sits where
the control is written.

That replaced 200 of 208 selectors matching Mantine's **generated** class names,
which reddened on a library upgrade with nothing broken. **Scope by an id, then
assert on the text**: a check that a wrong password is *reported as a wrong
password* is about the words and stays a regex. Four things are still matched as
text on purpose — a person's name, a round's name, `Wstrzymaj`/`Wznów` (one
control in two states, where the words say which), and the untranslated `Theme`
menu.

Two traps, both paid for and both in `src/theme.ts`:

- **A field's id comes from `wrapperProps`, not from `attributes`.** A compound
  input forwards its resolved `attributes` to the parts it renders, and each
  part applies them by its *own* styles names — a `root` key lands on the field
  **and** on a `TagsInput`'s pills. An entry also replaces an inherited one
  wholesale rather than merging. `wrapperProps` reaches the wrapper alone, so
  every field is `[data-testid=field]`.
- **One generated class is left in the suite**: `[class*=Pill-root]`, for the tag
  pills. A pill cannot be given an id from the theme — `TagsInput`'s `pill`
  styles name does not reach the element, and naming `root` instead lands on the
  field too. Its `innerText` and a hidden input were both checked; neither
  carries the value.
- **A modal's close button reads `close-button`, not `modal-close`.** Both
  classes are on the one element and `CloseButton`'s own attribute wins, so scope
  it: `[data-testid=modal] [data-testid=close-button]`.

**Time can be jumped, for a script that only needs it to pass.** `open({ clock:
true })` installs Playwright's virtual clock **before the first navigation** —
which is not optional: `fixtures/world.ts` computes `START = Date.now()` at
module load, so a clock installed later describes a different afternoon from the
fixtures. Then `clock.fastForward("50")` skips the 45 seconds the fake waits
before opening a round: `results` went from 126 s to 55 s and `boards` from 66 s
to 25 s.

`notifications` was tried and **reverted**: `fastForward` fires each due timer at
most once and fakes `requestAnimationFrame`, so a notification's slide-in never
finishes and its position is read mid-transition. **A script that asserts where
something ended up cannot share a clock with one that only needs time to pass.**

**Assert against the application, not against a constant.** A check that a name
matches a string written here only proves the fixture still says what it said;
one that compares the same fact read from two screens proves they agree. That
distinction is what made `verify-sync` find anything.
