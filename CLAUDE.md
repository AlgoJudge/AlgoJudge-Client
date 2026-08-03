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
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | `tsc && vite build` |

There are no tests, so lint, typecheck and build are the whole gate. All three
must exit 0 before anything is merged. Lint reports ten warnings that do not gate
the build — five `react-hooks/exhaustive-deps` and five
`react-refresh/only-export-components`, all in `provider/`, `components/header/`
and `problems/`. Treat that as the baseline: it may shrink, not grow.

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
