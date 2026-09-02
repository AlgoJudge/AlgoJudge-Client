# AlgoJudge-Client

## Scope

This repository contains the web Client for AlgoJudge, and it is the only
frontend. The code was migrated here with its full history, which is why the log
reaches back to December 2023 although the repository was created in March 2025.
A duplicate copy lingered inside AlgoJudge-Server until 2026-08-02, when it was
verified as outdated and removed there.

## Expected stack

- React
- TypeScript
- Vite
- Mantine
- React Router
- i18next
- Tabler Icons

## Node

**`.nvmrc` decides the version, and CI reads it** — `node-version-file`, never a
literal `node-version` beside it, because a literal silently wins and the file
stops meaning anything. `package.json` repeats the floor as `engines.node` so
`npm ci` objects rather than failing later in a way nobody attributes to Node.

The number is written twice on purpose: a Dockerfile `FROM` cannot read a file,
so the base image names its own. Two copies, both on the same major — it was
**four** until 2026-08-29, and they had drifted, the README saying 20.9 while the
Dockerfile and both CI jobs ran 22.

**Node 24, moved off 22 on 2026-08-29.** 22 went into maintenance in October
2025; 24 is the active LTS until 2026-10-20 and supported to 2028-04-30. The pin
floats on the major, as the Server's `postgres:18` and `aspnet:10.0` do, so
security patches arrive without a commit. Nothing in the dependency tree sets a
ceiling — every `engines.node` range in the lockfile is open-ended.

## Dependencies, swept 2026-08-29

Everything on its latest stable, with four exceptions and each is a decision.

**TypeScript is 6, not 7.** `@typescript-eslint`'s stable line declares
`typescript <6.1.0`, and only its alphas support 7 — which the no-prerelease
rule excludes on a tool that gates the merge. Three things 6 stopped tolerating:
`baseUrl` is deprecated, so `paths` is spelled from the tsconfig; naming files
beside a `tsconfig.json` is an error, so the six `check:` scripts that compile a
subset pass `--ignoreConfig`; and strict checking is on by default without a
config, which is why `check:content` names the `markdown-it-footnote`
declaration explicitly.

**`@mantine/code-highlight` ships no highlighter.** Without an adapter it falls
back to `plainTextAdapter` and renders source as plain text, silently — no
error, no warning, just no colour. `shikiAdapter.ts` wires Shiki, and
`verify-first` asserts a token count so the fallback cannot come back unnoticed.
**Name every grammar there.** Asking Shiki's bundled entry for languages on
demand reaches all ~300 and puts them in the build: 18 MB of `dist` against 8.5.

**And declare them in `optimizeDeps.include`, for the reason the Monaco block
above them already gives.** The adapter imports Shiki lazily and fetches a
grammar the first time a source preview opens, so on a **cold** cache Vite
re-optimised mid-run and the reload took the session with it. That failed six
`check:ui` tests in CI across two runs — a different set each time, all reading
as lost state — while the same suite passed warm four times locally. **`main`'s
own runs were the evidence**: six consecutive greens against two reds here. The
job carried `continue-on-error` until 2026-08-30, so in anything written before
that date the run says *success* either way and the **job** has to be read
rather than the run.

**Mantine's Tooltip merges its child's `className` with `clsx`, which cannot
carry a function.** A React Router `NavLink` under a `Tooltip` must take a
string, or its `({ isActive }) => …` is dropped and the element renders with no
class at all. That happened to the whole main navigation and only an assertion
about a neighbouring font weight noticed.

**Four `react-hooks` rules are off** — `set-state-in-effect`, `refs`, `purity`,
`immutability`. Plugin 7 folds in the React Compiler rules and they report 22
places; turning them on is a render change with its own verification, so it is
its own piece of work and the config says so.

`overrides` pins `dompurify` and `flatted`, both reached through packages that
are already current and have nothing newer to move to. `npm audit` is **zero**,
from nineteen.

## Commands

| Command | Purpose |
|---|---|
| `npm ci` | install dependencies |
| `npm run dev` | development server |
| `npm run lint` | ESLint 9, flat config in `eslint.config.mjs` |
| `npm run lint:deps` | dependency lists at every `useApiEffect` call site |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | `tsc && vite build` |
| `npm run preview` | serve the production build |
| `npm run check:package` | round-trips a Runner package through the real builder |
| `npm run check:languages` | every toolchain the submit form offers has a file extension it accepts |
| `npm run check:content` | parses and validates every `content.md` fixture |
| `npm run check:exchange` | the exchange bundle, and that every field of the four manager shapes is carried or deliberately left |
| `npm run check:zawodyweb` | the §9 converter, against fixtures written from ZawodyWeb's documented format |
| `npm run check:access` | when a credential for the problem archive may still be sent |
| `npm run check:events` | drives the event socket against a stub `WebSocket` |
| `npm run check:i18n` | every `t("…")` a screen asks for, against every language file |
| `npm run check:api` | lists every endpoint the HTTP layer calls; checks it against an OpenAPI document when given one |
| `npm run check:ui` | drives a real browser over the screens, against the fake API |
| `npm run check:e2e` | one test against a full stack that is already up |
| `npm run check:browsers` | that closing our browsers does not close anybody else's |
| `npm run browsers` | `-- list`, `-- stop <pid>`, `-- stop --all` |

**The table above is the whole of `package.json`'s `scripts`**, checked against
it on 2026-08-30. It listed thirteen of the eighteen until then: `preview`,
`check:exchange`, `check:zawodyweb`, `check:access` and `check:e2e` were missing.

**Fourteen npm steps gate, counted from `.github/workflows/ci.yml` on
2026-09-02.** Lint, `lint:deps`, typecheck and build, then nine `check:` steps
in the `build` job — `check:content`, `check:package`, `check:languages`,
`check:exchange`, `check:zawodyweb`, `check:access`, `check:events`,
`check:i18n`, `check:api` — and `check:ui` in `browser-checks`, which is ten
`check:` steps in all. No job
carries `continue-on-error`, so every one of them must exit 0 before anything is
merged; the `docker` job, which builds the image and checks the nginx fallback,
blocks on the same terms. `check:api` is the only step that cannot go red as it
is invoked — see below.

`ci.yml` says *"Keep this list and the one in CLAUDE.md the same"*, and the
instruction had been broken. This said **four things gate** — lint, `lint:deps`,
typecheck and build — and named `check:content`, `check:package`, `check:events`
and `check:i18n` as the CI `check:` steps. Of the nine, `check:exchange`,
`check:zawodyweb` and `check:access` appeared nowhere in this file at all, and
`check:api` and `check:ui` were described further down as not gating. So a change
could break the exchange bundle, the ZawodyWeb converter or the archive
credential rule and this file would still have called the run complete.
Corrected 2026-08-30, from `ci.yml` rather than from memory.

**There is a test runner** — Playwright, since 2026-08-18, and it serves two
suites that must not be confused. `playwright.ui.config.mjs` is `check:ui`: the
browser checks, against the fake API, with a dev server it starts itself.
`playwright.config.mjs` is `check:e2e`: one test against a full stack that is
already up. **`check:ui` gates since 2026-08-30**; `check:e2e` runs nowhere
automatically, because nothing in CI has a stack to point it at.

`check:i18n` catches the one defect none of the others can. **A missing key is
not an error**: i18next falls back to the key itself, which *is* the English
text, so a Polish screen quietly renders an English sentence while lint,
typecheck and the build all stay silent. It reads the literal `t("…")` form only
— a key built at run time is invisible to it, and the answer to that is not to
write one. Keys no screen asks for are reported and never failed on: deleting a
screen should not be harder than adding one.

`check:api` is not a gate yet: it prints the endpoints the HTTP layer calls, and
only checks them when handed an OpenAPI document —
`npm run check:api -- openapi.json`. It becomes a gate the day the Server
publishes one.

**Browsers are closed by pid, never by image name.** `taskkill /IM chrome.exe`,
`Stop-Process -Name chrome` and `pkill chrome` close whatever somebody is reading
in, and that has already happened here once. `scripts/verify/browser.mjs` starts
every browser these scripts use and records its pid in a registry outside the
repository, so `npm run browsers -- stop --all` can close ours and only ours;
`check:browsers` proves it, ending on the assertion that every other browser on
the machine is still running. It also starts Firefox, for measurements the
DevTools protocol cannot reach.

`check:ui` **runs in CI since 2026-08-18 and gates since 2026-08-30.** It moved
onto Playwright the first day: `npm run check:ui` starts the dev server itself,
with the fake, and brings its own browser — the two things that had kept it out
of CI.

What kept it from gating was that it could go red without a defect, in two ways,
and both are closed. It matched Mantine's **generated** class names in 208
places; one remains, `[class*=Pill-root]`, which cannot be given a test id from
the theme. And three scripts waited for words that were true before the element
they then read existed — `maintenance`, `exchange`, `notifications` — each fixed
at the cause rather than by waiting longer.

**`retries` stays 0.** A red mark a retry can erase is one nobody fixes.

It is what catches the defects the gate structurally cannot see — a rule applied
by a screen instead of by the API, a control that stopped reaching the keyboard,
two halves of the fake disagreeing. Run it when a screen changes;
`scripts/verify/README.md` carries the traps the scripts encode, and those are
the most valuable text in that directory.

**A verification script cannot be run with `node` any more.** They have no tab of
their own: `scripts/verify/ui.spec.mjs` makes a test of each and hands it one.
One script is `npm run check:ui -- <name>`.

**The dev server does not serve the fake by default.** `npm run dev` uses the
real HTTP client, so every call 404s and the application sits on the login
screen. For anything driven against the fake:

```
VITE_APP_USE_FAKE_API=true npm run dev -- --port 5180 --strictPort
```

**Lint is silent.** Not "nine known warnings", not two — nothing. It reported
nine until 2026-08-05 and two until 2026-08-06. A warning in the output means
something to fix or a decision to record, not something to recognise.

The one deliberate silencing is the `useEffect` inside `useApiEffect`
(`provider/apiContext.ts`), where the rule cannot see the dependency list because
it is a parameter, and what it asks for instead would loop. The comment there
says so. Silencing it is safe only because `reportUnusedDisableDirectives` is on,
so ESLint reports the directive the day it stops being needed — do not turn that
option off.

What that silencing gives up, `lint:deps` takes back: it runs the same rule with
`useApiEffect` declared as an effect hook, so the dependency list every screen
declares is checked. Plain `eslint` cannot do this itself — with the wrapper
declared it also demands a synchronous effect callback, and all of ours are async
by design — so that single message is filtered out by `scripts/lint-deps.mjs` and
anything else fails the run. **The async complaint arrives *beside* the
dependency analysis, not instead of it**, which is what makes the filter safe.

**Proved by sabotage on 2026-08-29, after this paragraph had been replaced with
the opposite claim and had to be put back.** Removing `activityId` from the list
in `components/activity/ActivitySubmissions.tsx` — where the callback genuinely
reads it — fails the run naming that dependency, on
`eslint-plugin-react-hooks` 7.1.1 with ESLint 10.

**The sabotage that produced the false claim is the lesson.** It emptied
`[session?.userId]` in `AccountPage`, where the callback body never mentions
`session`: a redundant dependency, so removing it creates no defect and the rule
correctly said nothing. **Pick the target by what the callback body reads, not
by what the dependency array contains** — otherwise a silent run reads as a dead
gate.

## Rules

- One Client supports users, managers, and administrators.
- New activity and problem types use renderer registries.
- Renderers are selected by the type discriminator, one string formatted
  `name@version` — not two fields. See `src/renderers/TypeRegistry.ts`.
- Never execute untrusted code supplied by a problem package.
- An unknown type must not break the application.
- WebSocket accelerates updates; REST remains the reproducible source of state.
- Do not move code-execution logic into the Client.

## Test ids (2026-08-30)

**Find by `data-testid`, judge by the words.** The containers get theirs from
`src/theme.ts` — one file, through Mantine's `attributes`, so a modal, card,
paper, switch or accordion item is addressable without matching a generated
class name. A control the browser checks drive gets an id where it is written:
`save`, `back`, `create`, `copy`, `publish`, `pause`, `resume`, `enrol`.

An id is for **finding**. Text is for **judging** — a check that a wrong password
is reported as a wrong password is about the words, and stays a regex.

**A field's id comes from `wrapperProps`, never from `attributes`.** A compound
input **forwards whatever `attributes` it resolves to the parts it renders**, and
each part applies them by its *own* styles names — so a `root` key means "the
input's root" to the wrapper and "the pill's root" to a `TagsInput`'s pills, and
lands on both. An `attributes` entry also **replaces** an inherited one wholesale
rather than merging key by key. `wrapperProps` reaches the wrapper alone.

One generated class is left in the whole suite, `[class*=Pill-root]`, because a
pill cannot be given an id from the theme at all. It says so where it is used.

## Colours (2026-08-29)

Both schemes are supported and both are shipped, so **a surface colour is never
a bare palette shade**: write `light-dark(a, b)`, or name a semantic variable
(`--mantine-color-body`, `--mantine-color-text`, `--mantine-color-dimmed`,
`--mantine-color-default-border`, `--mantine-color-default-hover`). A fixed
`gray-2` is a pale slab under near-white text in the dark scheme, and the light
scheme gives no hint of it. Deliberate exceptions exist — the blue navigation,
and the light box the instance mark sits in — and each says why in a comment.

Two traps, both paid for:

- **`light-dark()` outranks a plain value.** postcss expands it into a second
  rule under `[data-mantine-color-scheme="dark"]`, which is specificity (0,2,0)
  against a class's (0,1,0). Where two classes sit on one element and set the
  same property, **either both use `light-dark()` or neither does** — otherwise
  the first class wins in the dark scheme whatever the source order says.
- **The variable is `--mantine-color-text`.** `--mantine-text-color` does not
  exist; an unknown custom property with no fallback makes the declaration
  invalid, so it is dropped and the value inherits — which looks correct in
  light and fails only in dark.

`verify-theme.mjs` asserts a 4.5:1 floor per card on the activity list and the
problem list, in both schemes. It reads **computed** styles, because the fault
above is not visible in the source.

## Branding an installation (2026-08-30)

An installation sets **its own colours and typeface**. `docs/specs/INSTANCE_BRANDING.md`
in the workspace owns the rule; **seven** things reach this repository.

**`MantineProvider` is no longer the outermost provider.** It sits below
`ApiProvider` and `InstanceProvider`, which is the whole of what makes branding
possible: it used to be handed a theme four levels above the fetch that says what
installation this is. Neither of those two renders a Mantine component. It also
puts the maintenance page **inside** the branded provider, so a Server that has
withdrawn shows the operator's page rather than ours.

**Absent means untouched, and nothing here writes a default.** A key the
installation did not set emits no variable, and the CSS carries the old value as
`var(--aj-…, <what it always was>)`. That is why an unthemed installation is byte
for byte what it was — not a table of values that match Mantine today and drift
from it tomorrow. **Never use an `--aj-*` variable without its fallback.**

**`surface` is `--mantine-color-body`, not `--mantine-color-default`.** Read in
Mantine's stylesheet: `Paper` — and so every `Card` and `Modal` panel — draws its
background from `--mantine-color-body`, which is also what the `body` element
uses. They are one variable there, so a page ground that differs from the panels
needs a second: `--aj-page-bg`, applied in `index.css`.

**A theme that reaches the shell and not the list rows is half a theme.** The
activity list and the problem list draw their rows from our own CSS on fixed
palette shades, so the first photographs of a branded installation had a blue
shell around grey rows — the two screens a participant meets first. They take
`--aj-surface` and its two blended steps now, and the blend goes **towards the
theme's own `text`** rather than towards black: stepping a white panel towards
black turns it plain grey.

**The blend is computed in TypeScript, and every emitted value is a plain hex.**
`color-mix()` was tried; a background set from one computes to `color(srgb …)`
rather than `rgb(…)` in Chrome, and the contrast probe read `NaN` off it.

**`InstanceProvider` marks the root `data-instance="loaded"`**, as
`MaintenanceProvider` marks maintenance. The defaults are drawn while the answer
is in flight, so *the screen loaded* and *the screen was told what installation
this is* are two different moments — a check that waits for text reads the
unbranded colours, and waiting longer is a slower version of the same race.

**The status colours stay ours** — `red`, `orange`, `teal`, `green`, `yellow`,
`grape`, and the twenty-nine `color="blue"` places, which are information alerts
and states. A green *wrong answer* is a defect rather than a preference, and no
validation could catch it because every hex is formally valid.

## API layer

`src/api/` holds one API layer, not two. `ApiFactory` picks the implementation:
the fake when `VITE_APP_USE_FAKE_API` is `"true"` or when no
`VITE_APP_API_BASE_URL` is set, the real HTTP client otherwise. Views call
through `useApi`, `useApiEffect` or `useApiCall` and never talk to `fetch`
directly.

**The API is at `/api/v1` on every installation** (2026-08-06), whatever host
serves it, so `VITE_APP_API_BASE_URL` names an origin and `src/api/http/apiBase.ts`
appends the path. `/` means the origin the application itself came from, which is
the case the rule exists for: one domain serving both. Do not make the path
configurable again.

**There is a Server now, and it does not agree with this repository everywhere.**
`SERVER_CONTRACT.md` records the places where the two cannot both be right —
three manager reads whose paths carry two different response shapes, a bug in
`check:api`, and what the Server serves today. Read it before changing anything
under `src/api/http/`.

**It is a snapshot of 2026-08-08, and the entries it ruled against the Client
were applied.** This paragraph said *"Nothing in it has been applied: they are
proposals"* until 2026-08-30. Verified today: entry 2's four manager reads sit
under `/manager/` in `src/api/http/ManagerApiHttp.ts` —
`/manager/activities/summary`, `/manager/activities`,
`/manager/activities/{idOrSlug}` and `/manager/activities/{activityId}/series` —
and entry 4's `src/api/fake/refuse.ts` exists with `Utils.throwError` deleted,
`src/api/fake/Utils.ts` saying where it went. What is still open is §12, the
twelve questions no document settles, one of them since closed; read that
section rather than the whole file as the open list.

### The fake's fixtures (2026-08-07)

`src/api/fake/fixtures/world.ts` states **every activity once** — its rounds,
its problem assignments, who competes in it, and every attempt they made.
Everything else is projected from it: `fixtures/activities.ts` for the manager,
`fixtures/index.ts` for the participant, `fixtures/submissions.ts` for the
submissions list, and `fixtures/results.ts` for the results feed.

Do not state on one side what the other side also has. Two hand-written sets
disagreed about the same contest — its name, four rounds against two, which
problems were in them — and every "the manager changed it and the participant
never saw it" defect came from that. Anything one side derives is derived:
a problem's status and best score, `submissionCount`, `attachedCount`, and every
board.

### Values the Server never reads (2026-08-07, corrected 2026-08-22)

**This said "seven" and then named five**, two of which had left the set the same
day it was written: `detail` on an attempt and on a submission became attachments
on 2026-08-07, because a per-test table is a hundred and twenty bytes a row times
two thousand tests times every attempt.

There are **eight**, and one name covers them:

| Value | Written by | Read by |
|---|---|---|
| `Activity.props` | manager | everyone |
| `ProblemVersion.props` | manager | the Runner — which problem this is, e.g. `uva@1`'s archive number |
| `SeriesProblem.config` | manager | the Runner, and shown to the participant |
| `SeriesProblem.spec` | manager | this Client, to draw the submit form |
| `SeriesProblem.props` | manager | everyone who may see the problem |
| `Submission.props` | **the participant** | the Runner, the manager |
| `Result.props` | the Runner | the one participant it belongs to |
| `Result.extra` | the Runner | **everyone** who may see the board |

Each exists so that adding a problem or ranking type needs no Server release.
The assignment's three are separated by what breaking each costs: a wrong
`config` is a wrong result, a wrong `spec` is a broken form, wrong `props` is an
untidy screen. **Where `config` and `spec` disagree about languages, `config` is
what happens** — the Runner refuses whatever the assignment excluded, whatever
this form offered.

One rule for all of them: **optional, and absent means none** — never `{}` beside
`undefined`, which is two ways of saying the same nothing. An object or absent,
never a scalar or an array, so the `isRecord` guard every reader writes matches
what can arrive. `docs/specs/OPAQUE_DOCUMENTS.md` carries the rule and the two
ceilings the Server holds them to; the Client enforces neither and authors none.

### One language catalogue per problem type (2026-08-22)

`components/editor/languages.ts` says what each toolchain id is **called** and
which Monaco grammar colours it. It says nothing about what may be submitted:
the select is drawn from the assignment's `spec`, and the **Runner** refuses
anything outside its `config`.

That separation is the point. A Server release per language was what the old
arrangement cost, and a Client release per language would be the same mistake one
floor up — an id this file has never seen still submits, still judges, and shows
as its own id until somebody adds a row.

**One catalogue per type, because the labels differ.** `standard-io@1` builds
eighteen toolchains here; `uva@1` forwards to onlinejudge.org and offers its six.
Three ids are shared, deliberately, so one screen resolves a label whichever type
produced a submission — but `cpp11-gcc` is GCC 14 with our flags in one and GCC
5.3.0 with UVa's in the other, and one label for both would say they were built
by the same compiler. The envelope on each opaque document names its type, which
is how a screen holding only a submission knows which catalogue to ask.

**Pasted source is named here.** The Server had a table of seven language
extensions and no longer knows the language, so only this side can name the file
— and it must, because the Runner refuses a file whose extension its toolchain
does not accept.

### A submission's parts are files (2026-08-07)

The source, the compiler log and the per-test table are **attachments**: named
within the submission or its attempt, fetched with `fileApi.getText(fileId)`.
There is no `detail` field and no `getSubmissionFile` endpoint — a file is
reached by id, as every other stored document is.

Who reads which name is the activity's `attachmentVisibility`, one row per name,
and **an unlisted name is `managersOnly`**. Filter where the data leaves, never
when a fixture is built: a manager changing the table has to change what
yesterday's submissions show.

### Rankings are computed here (2026-08-07)

The Server sends **results, not a board**: `GET /activities/{id}/results` answers
with the rounds, the contestants and one entry per submission, and
`src/renderers/ranking/scoreboard.ts` works out what they add up to. A Server
computing an ICPC penalty would encode one ranking type's semantics, which is
what "adding a type does not require a Server change" forbids.

What the Server still owns is **disclosure**: the ranking window decides whether
there is an answer, the freeze withholds outcomes, and `scoreVisibility` decides
whose results are in it. A board is assembled here, so anything sent has already
been disclosed — never add a field to the feed without asking who may read it.

**Corrected 2026-08-22.** This said there was no renderer registry and no
`typeId`/`typeVersion` selection. There are **five registries** —
`activityRenderers`, `statementRenderers`, `resultRenderers`, `submitRenderers`,
`rankingRenderers` — all `TypeRegistry`, which resolves a type in three steps:
the exact `name@version`, then `name@*`, then the fallback. The type
discriminator is one string, as decided 2026-08-02, rather than two fields — the
rule at the top of this file said `typeId + typeVersion` until the same day, and
that is a shape this repository has never had.

### A board's rows are not always people (2026-08-23)

A **group** is a contestant: it submits, it spends one submission allowance, and
it holds one ranking row while its members hold none. `Contestant` carries a
`kind` for that reason — a row's id is a user id or a group id, and guessing from
the shape would be guessing, because `User.id` is a UUID too.

Three things follow, and each is easy to undo by accident:

- **A member has no row of their own**, and `results.me` is their **group's** id.
  Highlighting on the reader's own id looks right and highlights nothing.
- **The roster is printed under the group's name**, never as rows: a row per
  member would score the same points twice in one table. `ContestantName` renders
  it once for both boards, so ICPC and points cannot drift apart.
- **The description and the roster ride on the row**, put there by
  `scoreboard.ts`, so neither board has to know where a group came from.

What a participant sees of their own group is on `Activity.group` — theirs only.
Whose roster anybody else may read is the ranking's question, and the activity's
setting answers it.

### A running round may put the rest out of reach (2026-08-24)

`docs/specs/SERIES_LOCKDOWN.md` owns the rule. Four things reach this repository:

- **Locked is shown, hidden is not there.** A locked activity keeps its card,
  says which round displaced it, and does not open — the Server refuses
  everything under it, so navigating would land somebody on a page of refusals
  instead of on the reason. A round hidden by an address rule leaves no trace.
- **The Server sends a round's name and this side writes the sentence.** A Server
  composing interface text would need a release to change a comma.
- **The importance select prints the rank beside the name**, because the ordering
  *is* what the list means — `Egzamin lub kolokwium (30)` loses to `Seria próbna
  zawodów (40)`, and a manager has to see that before choosing.
- **The names are written out, never assembled from a rank.** `check:i18n` reads
  only calls written in full, so a key built at run time is a translation nothing
  checks — and a missing one renders as English on a Polish screen with nothing
  else noticing.

`FakeLockdown` is a shared owner, as `FakeAccess` is, and `?fakeAddress=` stands
in for where a browser is: a browser cannot know its own address, and a check has
to stand inside the room and outside it. **Absent is not "anywhere"** — it is an
address the Server could not read, which admits nobody and locks nobody.

**Amended the same day.** A rank now carries a **scope**: `activity` — the
default — displaces the other rounds of its own activity and nothing else;
`installation` reaches every activity the reader is in. Three things follow here:

- **An activity scope never locks a card**, so `Series.locked` is the only signal
  there is. It was rendered by nothing until 2026-08-24 and a displaced round
  fell through to *"not started yet"* under a countdown to a start already past.
- **`Activity.locked` is drawn on the activity's own page too**, not only on the
  list card: the card refuses to open, but the address is typed and bookmarked.
- **The seed's examination activity runs two rounds.** Every seeded activity ran
  exactly one until then, which is why no screen ever drew a displaced round and
  why neither gap above was caught. A fixture that cannot express a shape is a
  check that cannot fail on it.

### An account that has been stopped ends the session (2026-08-24)

`account.blocked` and `account.expired` take the same road a 401 does: the
provider hears `sessionExpired` and the login screen appears. **Not a toast** —
an account that can make no request would collect one on every request, in the
Server's own English, over a screen that will never finish loading.

`UsersPage.stateOf` has drawn `expired` from `ExpiresAt` since long before the
Server enforced it, which is why the refusal carries its own code rather than
calling both states blocked.

### One account's work may be carried onto another (2026-08-24)

A manager moves a temporary account's submissions, points and questions onto the
participant's permanent account. `docs/specs/ACCOUNT_MERGE.md` owns the rule.
Two things reach this repository:

- **The preview is the guard, so it is a screen rather than a confirmation.** A
  merge is one person asserting that two accounts are the same person, and
  nothing can check that for them — so the dialog states whose work, how much of
  it, and onto whom, with both names and both logins, and the button is not
  offered until that statement is on screen.
- **A verification check reading `document.body` is reading the page behind the
  dialog.** Two checks here passed for the wrong reason: the word *Zgłoszenia* is
  in the dialog's own opening sentence and the target's name is in the table
  underneath, so blanking the whole preview left both green. `verify-merge.mjs`
  reads `[class*=Modal-content]` and asserts on the **numbers** rather than the
  words. An input's value is not in `innerText`, which is why the chosen target
  does not leak in through the select.

### A submission may be ruled out of every standing (2026-08-24)

A manager marks one submission as **not counted**, and it leaves the board, the
best score and the LMS grade. `docs/specs/EXCLUDED_SUBMISSIONS.md` owns the rule.
Three things reach this repository:

- **The result stays what it was.** Judged, a verdict, a score — and no points
  anywhere. That is why the participant's screen says so outright: without the
  notice, the screen and the ranking describe one submission differently and the
  person reading has no way to find out why.
- **The flag travels to the participant, the reason does not.** The reason is on
  the manager's screen, and in that person's own data export — the form says so
  under the field, because a manager has to know it before writing one.
- **`FakeExclusions` is a shared owner**, as `FakeAccess` is: the manager screen
  writes the ruling and the participant's board reads it. The seed's own excluded
  attempt is deliberately the best run there is, so `verify-points` reddens on
  200/200 if the filter ever stops working.

### Which Runners judge which work (2026-08-24)

A Runner carries tags and so does the work, and they are paired when the two
lists **share at least one** — unlike GitLab, whose runner must hold every tag a
job asks for. `docs/specs/RUNNER_ROUTING.md` owns the rule. Three things reach
this repository:

- **Empty means `default` on both sides, and that is the whole of the
  exclusivity.** `api/runnerTags.ts` states it once so a screen can say what a
  tag will do and the fake can answer the numbers the Server would. Tagging a
  Runner takes it out of the general pool as surely as it puts it into a
  reserved one.
- **A round has two states and a `TagsInput` can only draw one of them.**
  Inheriting and empty look identical in it, and they are the two a manager most
  needs to tell apart — so a switch decides and the field appears only once it
  has. A round wanting the general Runners while its course is pinned writes
  `default`.
- **The count is the only warning there is.** An activity tagged with a pool
  nothing carries accepts submissions, queues them, and never has them judged.
  It counts tags and **not** problem types, so zero is a promise and a larger
  number is not — and it is a warning rather than a refusal, because the tags are
  typed before the machines are approved.

The seed states the shape: `KOLOKWIUM-2` pins its examination to `lab-a` and
leaves `Ćwiczenia 4` inheriting, with one fixture Runner in that pool. Pinning
the course instead would send its homework to the laboratory too, including
whatever is sent from home at night.

### The socket is live (corrected 2026-08-09)

This section claimed there was no WebSocket and that nothing dispatched over the
network. **Both halves are wrong.** `WebSocketEvents` opens one socket per tab at
`/ws`, the Server serves it (`Program.cs`), and it feeds the three dispatchers —
`scripts/check-events.mjs` drives the real class and diffs the names against the
catalogue the Server commits, which is what caught fourteen names that reached
nobody.

### When the Server is away (2026-08-09)

Three pieces that are easy to reach for the wrong one:

- **`api.availability`**, not an event on a dispatcher. The three dispatchers
  carry what the *Server* said, and their names are diffed against its
  catalogue; a proxy refusing a connection is not something the Server
  announced, so it does not travel as one.
- **`MaintenanceProvider` sits above `AuthProvider`** and *replaces* the tree
  rather than covering it. An outage breaks the login screen too, so a gate
  below the session would bounce somebody to a form that also fails. Replacing
  is also what makes recovery work: the screens mount fresh and ask again, so
  nothing has to be told to refetch.
- **`getSession` answers `undefined` only for a refusal.** It swallowed every
  failure until 2026-08-09, which answered "who is signed in" with "nobody"
  whenever the Server was down.

`docs/specs/MAINTENANCE.md` in the workspace owns the whole of it.

## Decisions in force (2026-08-02)

- **Identity phase 2, specified 2026-08-09, accepted 2026-08-10** —
  `AlgoJudge-Design/adr/IDENTITY_PHASE_2_DECISIONS_2026-08-09.md`, indexed in the
  workspace under *Identity phase 2*. **Not yet implemented here.** Three things
  reach this repository:
  - `/manager/oidc` stops being a `soon` entry and becomes a real area behind a
    new `provider:manage` permission, including the claim-mapping editor. A
    provider secret can be **set and never read back**, and the form has to say
    so — an empty field otherwise reads as a loss rather than as something the
    API refuses to disclose.
  - The grants screen must answer **where a permission came from**: at system
    scope a set is now the union of one manual contribution and one per linked
    provider, so it is in no single row. It must also say that setting an
    activity grant's **override flag** on somebody holding system permissions
    demotes them inside that activity.
  - The login screen offers the enabled providers, and that list is read
    **before anyone signs in** — so it travels on `getInstanceInfo`, the existing
    anonymous call, not on a new authenticated one.
  `AccountPage` already reads `session.isLocal` and renders read-only for an SSO
  account; the Server has been answering a hard-coded `true` and starts telling
  the truth in phase 2.
- All identifiers are string UUIDs. The Server still uses `int` keys; the HTTP
  mapper stringifies them until it migrates.
- `Activity.type` is the type discriminator, formatted `name@version`.
- `main` is the integration and default branch. `devel` no longer exists.

## Working here

When this repository is checked out inside the AlgoJudge workspace,
`../PROJECT_CONTEXT.md` is the primary architecture context and takes precedence
over this file.
