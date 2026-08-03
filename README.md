# AlgoJudge Client

The web frontend for [AlgoJudge](https://github.com/AlgoJudge), an open-source
platform for programming contests, courses and automated solution evaluation.

One application serves participants, activity managers and administrators, with
permission-aware views.

## Status

Early development. Most views are static templates: they render real layouts
against local fixtures rather than live data.

| Area | State |
|---|---|
| Activity list, task list, task view | static templates |
| Submission list, submission details, source code view | static templates |
| Ranking, questions and announcements | static templates |
| Manager panel — activities, users, runners | activities reads the API, users and runners are fixtures |
| Sign in and register | wired to the Server |
| Live status over WebSocket | not implemented |
| Renderer registry keyed by `typeId + typeVersion` | not implemented |

## Technology

React 19, TypeScript 5.8, Vite 6, Mantine 7, React Router 7, i18next 24,
Tabler Icons. Polish and English, with translations in `public/locales/`.

## Requirements

Node.js 20.9 or later, and npm.

## Commands

| Command | Description |
|---|---|
| `npm ci` | install dependencies |
| `npm run dev` | development server on port 5173 |
| `npm run lint` | ESLint 9, flat config in `eslint.config.mjs` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | type-check and build to `dist/` |
| `npm run preview` | serve the production build |

On Windows PowerShell use `npm.cmd` if the execution policy blocks `npm.ps1`.

There is no test suite and no CI, so lint, typecheck and build are the whole
gate. All three must exit 0 before anything is merged.

## Configuration

Build-time variables, read by Vite:

| Variable | Purpose |
|---|---|
| `VITE_APP_API_BASE_URL` | base URL of AlgoJudge-Server |
| `VITE_APP_USE_FAKE_API` | `true` forces the fake API implementation |
| `VITE_APP_DEBUG_AUTHENTICATION` | `true` bypasses the route guard — development only |

Every `VITE_`-prefixed value is embedded in the published bundle, so none of
them can hold a secret.

### Running without a Server

`ApiFactory` picks the implementation: the fake one when
`VITE_APP_USE_FAKE_API` is `"true"` **or** when no `VITE_APP_API_BASE_URL` is
configured, the real HTTP client otherwise. The fake serves generated data, so
the interface can be developed without a running Server.

## Docker

Builds the static bundle and serves it from nginx. There is no Node.js runtime
in the final image.

```bash
docker build -t algojudge-client .
docker run -p 8080:80 algojudge-client
```

With no `VITE_APP_API_BASE_URL` the image runs against the fake API, which is
useful for looking at the interface without a Server. To point it at one:

```bash
docker build --build-arg VITE_APP_API_BASE_URL=https://api.example.org -t algojudge-client .
```

**The configuration is baked in at build time.** Vite inlines `VITE_`-prefixed
values into the bundle, so a running container cannot be reconfigured — build a
separate image per environment. For the same reason none of those values may
hold a secret; they all end up readable in the browser.

`nginx.conf` falls back to `index.html` for anything that is not a file on disk,
which is what makes a deep link such as `/activities/PCN1/problems` survive a
refresh. Hashed assets are cached for a year, `index.html` never.

## Project structure

```text
src/
  api/          one API layer: interfaces, plus fake/ and http/ implementations
  components/   shared components - buttons, code highlighting, header, footer
  layouts/      application shell
  pages/        views, mirroring the route tree
  provider/     Api, Auth and Preferences context providers
  routers/      route guard
  utils/
public/locales/ Polish and English translations
```

Views never call `fetch` directly. They go through `useApi`, `useApiEffect` or
`useApiCall`, which supply an `AbortSignal` scoped to the component.

## Routes

| Route | View |
|---|---|
| `/`, `/login`, `/register` | public shell |
| `/activities` | activity list |
| `/activities/:activityId/problems` | task list, and `/:problemId` for one task |
| `/activities/:activityId/submit/:problemId?` | submission form |
| `/activities/:activityId/submissions` | submission list, `/:submissionId` details, `/code` source |
| `/activities/:activityId/ranking` | ranking |
| `/activities/:activityId/questions` | questions and announcements |
| `/activities/:activityId/rules` | rules |
| `/manager` | manager panel, with `/activities`, `/users` and `/runners` |

## Contributing

`main` is the integration and default branch; changes arrive through pull
requests. Run lint, typecheck and build before opening one.

Architecture rules that apply here: the Client renders, it never evaluates.
Untrusted JavaScript from a task package must never be executed, an unknown
activity or task type must fail into a controlled message rather than break the
application, and anything delivered over WebSocket must also be reproducible
through REST.

## Related repositories

- [AlgoJudge-Server](https://github.com/AlgoJudge/AlgoJudge-Server) — API, persistent state, authorization
- [AlgoJudge-Runner](https://github.com/AlgoJudge/AlgoJudge-Runner) — isolated execution and evaluation

## License

See [LICENSE](LICENSE). Contributors are listed in [AUTHORS.txt](AUTHORS.txt).
