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

## Commands

| Command | Purpose |
|---|---|
| `npm ci` | install dependencies |
| `npm run dev` | development server |
| `npm run lint` | ESLint 9, flat config in `eslint.config.mjs` |
| `npm run lint:deps` | dependency lists at every `useApiEffect` call site |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | `tsc && vite build` |
| `npm run check:package` | round-trips a Runner package through the real builder |
| `npm run check:content` | parses and validates every `content.md` fixture |
| `npm run check:events` | drives the event socket against a stub `WebSocket` |
| `npm run check:i18n` | every `t("…")` a screen asks for, against every language file |
| `npm run check:api` | lists every endpoint the HTTP layer calls; checks it against an OpenAPI document when given one |
| `npm run check:ui` | drives a real browser over the screens, against the fake API |
| `npm run check:browsers` | that closing our browsers does not close anybody else's |
| `npm run browsers` | `-- list`, `-- stop <pid>`, `-- stop --all` |

Lint, `lint:deps`, typecheck and build are the gate and all four must exit 0
before anything is merged; the `check:` scripts cover what the Client owns and
are run when it changes — the two formats (`check:content`, `check:package`),
the event transport (`check:events`) and the translations (`check:i18n`). All
four are CI steps.

**There is a test runner now** — Playwright, since 2026-08-18, and it serves two
suites that must not be confused. `playwright.ui.config.mjs` is `check:ui`: the
browser checks, against the fake API, with a dev server it starts itself.
`playwright.config.mjs` is `check:e2e`: one test against a full stack that is
already up. Neither gates a merge; only the first runs in CI.

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

`check:ui` **runs in CI since 2026-08-18, and still does not gate.** It moved
onto Playwright the same day: `npm run check:ui` now starts the dev server
itself, with the fake, and brings its own browser — the two things that had kept
it out of CI. What kept it from being a gate is untouched: it matches on Polish
interface text and on Mantine's generated class names, so a translation or a
component upgrade reddens it for no product reason, and a red mark everybody
learns to ignore is worth less than no mark. The CI job is
`continue-on-error`, like `check:api`. Test ids instead of screen text are what
would promote it.

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
anything else fails the run.

## Rules

- One Client supports users, managers, and administrators.
- New activity and task types use renderer registries.
- Renderers are selected by the type discriminator, one string formatted
  `name@version` — not two fields. See `renderers/TypeRegistry.ts`.
- Never execute untrusted code supplied by a task package.
- An unknown type must not break the application.
- WebSocket accelerates updates; REST remains the reproducible source of state.
- Do not move code-execution logic into the Client.

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
`check:api`, and what the Server serves today. Nothing in it has been applied:
they are proposals. Read it before changing anything under `src/api/http/`.

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
