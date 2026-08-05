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
| `npm run lint:deps` | the same rules with `useApiEffect` treated as an effect hook |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | `tsc && vite build` |
| `npm run check:package` | round-trips a Runner package through the real builder |
| `npm run check:content` | parses and validates every `content.md` fixture |

There is no test runner. Lint, typecheck and build are the gate and all three
must exit 0 before anything is merged; the two `check:` scripts cover the two
formats the Client owns and are run when either changes. Lint reports two
warnings that do not gate the build, both `react-hooks/exhaustive-deps` and both
on the same `useEffect` in `provider/apiContext.ts`, where a comment says why
they stay. It was nine until 2026-08-05. Treat two as the baseline: it may
shrink, not grow.

`lint:deps` is a probe, not a gate. Because `useApiEffect` hands its dependency
list to `useEffect`, the rule stops at the wrapper and none of its call sites are
checked; this reports them. It is noisy by construction — the rule wants a
synchronous effect callback and ours is async — so read its findings, do not
count them.

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
