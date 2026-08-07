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
| `npm run check:api` | lists every endpoint the HTTP layer calls; checks it against an OpenAPI document when given one |
| `npm run check:ui` | drives a real browser over the screens, against the fake API |

There is no test runner. Lint, `lint:deps`, typecheck and build are the gate and
all four must exit 0 before anything is merged; the `check:` scripts cover what
the Client owns and are run when it changes — the two formats
(`check:content`, `check:package`) and the event transport (`check:events`).

`check:api` is not a gate yet: it prints the endpoints the HTTP layer calls, and
only checks them when handed an OpenAPI document —
`npm run check:api -- openapi.json`. It becomes a gate the day the Server
publishes one.

`check:ui` is not a gate either, and CI does not run it. It drives a real Chrome
over the screens against the fake, so it needs a dev server and a browser, takes
minutes, and matches on Polish interface text. It is what catches the defects the
gate structurally cannot see — a rule applied by a screen instead of by the API,
a control that stopped reaching the keyboard, two halves of the fake disagreeing.
Run it when a screen changes. `scripts/verify/README.md` says how, and carries
the traps the scripts encode.

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
- Renderers are selected using `typeId + typeVersion`.
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

### Values the Server never reads (2026-08-07)

Seven of them: `config` on a problem version and on an assignment, `detail` on an
attempt and on a submission, `extra` on a result. Each exists so that adding a
problem or ranking type needs no Server release.

One rule for all of them: **optional, and absent means none** — never `{}` beside
`undefined`, which is two ways of saying the same nothing. An object or absent,
never a scalar or an array, so the `isRecord` guard every reader writes matches
what can arrive. `docs/specs/OPAQUE_DOCUMENTS.md` carries the rule and the two
ceilings the Server holds them to; the Client enforces neither and authors none.

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

Not implemented yet: no renderer registry and no `typeId`/`typeVersion`
selection, and no WebSocket — the event dispatchers exist and are shaped for one,
but nothing dispatches over the network.

## Decisions in force (2026-08-02)

- All identifiers are string UUIDs. The Server still uses `int` keys; the HTTP
  mapper stringifies them until it migrates.
- `Activity.type` is the type discriminator, formatted `name@version`.
- `main` is the integration and default branch. `devel` no longer exists.

## Working here

When this repository is checked out inside the AlgoJudge workspace,
`../PROJECT_CONTEXT.md` is the primary architecture context and takes precedence
over this file.
