# Browser checks

Scripts that drive a real Chrome against the application running on the fake
API, over the DevTools protocol. They exist because the gate — lint, `lint:deps`,
typecheck, build and the `check:` scripts — cannot see a screen. Nothing it runs
has ever caught a rendering or a wiring defect; everything here has.

## Not a gate

CI does not run these and should not, as things stand:

- they need a dev server **and** a browser, which CI has no orchestration for;
- a few wait on the clock, because the seed opens a round forty-five seconds
  after load — a full run is minutes;
- they match on Polish interface text and on Mantine's generated class names,
  so a translation or a component upgrade reddens them for no product reason.

Run them by hand when a screen changes. `check:api` is marked the same way and
for the same kind of reason: something worth having in the repository that is not
yet something worth blocking a merge on.

## Running them

    VITE_APP_USE_FAKE_API=true npm run dev -- --port 5180 --strictPort
    npm run check:ui

**The environment variable is not optional.** `npm run dev` alone serves the real
HTTP client; every call 404s, the application redirects to the login screen, and
every script here times out against it saying only that it was waiting for
something that never appeared.

Chrome is started and stopped by the runner. Set `CHROME` if it is somewhere the
runner does not look. To use a browser you started yourself, leave one listening
on `CDP_PORT` (9333) and the runner will use it and leave it running.

    npm run check:ui -- boards     only the scripts whose name contains "boards"
    APP=http://localhost:4173 npm run check:ui       against a preview build

Screenshots and the browser profile go to `out/`, which is not committed. A
script writes one at each point worth looking at; when something fails, the
picture usually says why faster than the assertion does.

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
| `verify-systemic` | systemic users: not counted, not ranked, still able to submit |

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

Seventeen of the scripts here still carry that older inline harness. They work,
so they were not rewritten wholesale — but a new script should import `cdp.mjs`,
and one of the old ones is worth converting whenever it is being edited anyway.

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
- **Mantine's grouped `Select` wants `{ group, items }`.** A flat option carrying
  a `group` key is read as a group whose `items` are missing, and the component
  throws.

## Writing another

`cdp.mjs` is the whole harness — a tab, and the few things worth not writing
twice.

```js
import { open, results } from "./cdp.mjs";

const APP = process.env.APP ?? "http://localhost:5180";
const { evaluate, wait, shot, go, visit, click, close } = await open({ out: process.env.OUT ?? "." });
const { check, report } = results();

await go(`${APP}/activities?fakeUser=amy`, `document.body.innerText.includes("Aktywno")`);
check(await evaluate(`return location.pathname === "/activities";`), "what it should hold to");

report();
close();
```

`go(url, waitFor)` loads and waits for a condition; `visit(path, waitFor)` moves
within the application; `click(locator)` takes a JavaScript expression returning
an element and clicks where it actually is; `shot(name)` writes a screenshot.
`report()` prints the checks and sets a non-zero exit code if any failed.

**Assert against the application, not against a constant.** A check that a name
matches a string written here only proves the fixture still says what it said;
one that compares the same fact read from two screens proves they agree. That
distinction is what made `verify-sync` find anything.
