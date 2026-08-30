# AlgoJudge Client

AlgoJudge is open-source, self-hosted software for programming contests and
courses, with automatic evaluation of submitted solutions.

This is its web frontend. One application serves participants, activity managers
and administrators, with permission-aware views.

## Status

Every screen that has something to fetch reads the API. **Measured 2026-08-30**:
35 of the 45 `.tsx` files under `src/pages/` call `useApi`, `useApiEffect` or
`useApiCall` (`grep -rl "useApi" src/pages/`). The ten that do not have nothing
to fetch — the sign-in form, the four LTI outcome pages, the two error pages, the
manager index, and two sub-components handed a `ManagedSeries` by their parent.

Which implementation answers is a configuration question, not a screen's:
`ApiFactory` serves the fake or the real HTTP client. See *Running without a
Server*.

| Area | State |
|---|---|
| Activity list, problem list, problem view | reads the API |
| Submission list, submission details, source code view | reads the API |
| Ranking, questions and announcements | reads the API |
| Manager panel — sixteen screens, from activities to the LTI platforms | reads the API, except the index, which is a menu |
| Sign in and register | wired to the Server |
| Live status over WebSocket | `src/api/ws/WebSocketEvents.ts`, mounted as `<EventsProvider>` in `src/App.tsx` |
| Renderer registry keyed by the `name@version` discriminator | `src/renderers/TypeRegistry.ts`, with the registrations in `src/renderers/index.ts` |

> **This table said something else until 2026-08-30.** It called the first three
> rows and half the fourth "static templates", and the last two "not
> implemented", which was true when it was written and had not been true for
> some time: the registry arrived on 2026-08-03 (`36af927`) and the event socket
> on 2026-08-06 (`84c6c49`).

## Technology

React 19, TypeScript 6, Vite 8, Mantine 9, React Router 7, i18next 26,
Tabler Icons. Polish and English, with translations in `public/locales/`.

## Requirements

Node.js 24 or later, and npm. Node 24 "Krypton" is the active LTS line; Node 22
went into maintenance in October 2025.

The version lives in `.nvmrc`, which is what CI reads and what `nvm use` picks
up. `package.json` states the same floor under `engines`, so `npm ci` says so
when the wrong Node is in front of it. The Dockerfile names its own base image
and is the one place that repeats the number.

Tested on Node 24.20.0 with npm 11.19.0.

## Commands

| Command | Description |
|---|---|
| `npm ci` | install dependencies |
| `npm run dev` | development server on port 5173 |
| `npm run lint` | ESLint 9, flat config in `eslint.config.mjs` |
| `npm run lint:deps` | dependency lists at every `useApiEffect` call site |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | type-check and build to `dist/` |
| `npm run preview` | serve the production build |

On Windows PowerShell use `npm.cmd` if the execution policy blocks `npm.ps1`.

Lint, `lint:deps`, typecheck and build are the gate, and so is every `check:`
script CI runs. Counted from `.github/workflows/ci.yml` on 2026-08-30: nine
`check:` steps, all of them in jobs with no `continue-on-error` —
`check:content`, `check:package`, `check:exchange`, `check:zawodyweb`,
`check:access`, `check:events`, `check:i18n` and `check:api` in the `build` job,
and `check:ui` in `browser-checks`. Only `check:api` cannot go red as it is
invoked: with no OpenAPI document it prints the endpoints and exits 0.

**`check:ui` gates since 2026-08-30.** It is a Playwright suite, in CI since
2026-08-18, and it ran with `continue-on-error` until it stopped being able to
go red without a defect — anything written before that date saying it does not
gate is out of date. `npm run check:e2e` is the other suite and runs nowhere
automatically: it wants a full stack that is already up.

## Configuration

Build-time variables, read by Vite:

| Variable | Purpose |
|---|---|
| `VITE_APP_API_BASE_URL` | **origin** of AlgoJudge-Server, not a base URL — see below |
| `VITE_APP_USE_FAKE_API` | `true` forces the fake API implementation |
| `VITE_APP_DEBUG_AUTHENTICATION` | `true` bypasses the route guard. **Development only and off by default**: a production build ignores it, so no deployment can be configured into having no authentication |

### Working against the fake

The fake API carries a few development affordances, all read from the address and
remembered for the tab. They exist only in the fake — the HTTP implementation has
nothing of the sort.

| Parameter | Effect |
|---|---|
| `?fakeUser=amy` | start signed in as `amy` (manager), `jkowalski` (participant) or `john` (administrator, SSO) |
| `?fakeRegistration=on` | let this instance accept local sign-ups |
| `?fakeRequireEmail=on` | make the address mandatory on the registration form |
| `?fakeConfirmEmail=on` | refuse sign-in until the address is confirmed |
| `?fakeName=off` | an installation nobody has named: no name beside the mark, and `AlgoJudge` alone in the title |

All three seeded accounts use the password `Test1!`.

Every `VITE_`-prefixed value is embedded in the published bundle, so none of
them can hold a secret.

### Where the API is

`/api/v1`, on whatever host serves it. This is not configurable, and the Client
appends it itself, so `VITE_APP_API_BASE_URL` names only the origin:

| Configured | The Client asks |
|---|---|
| `https://api.example.com` | `https://api.example.com/api/v1/…` |
| `/` | `/api/v1/…` — the same origin the application is served from |
| *(empty)* | nothing: the fake API is used instead |

The path is fixed because the Client and the Server may share a domain, and
there the API cannot live at the root — the root is the application. A prefix
that is only sometimes present is one every deployment has to get right on its
own, and getting it wrong is quiet: the Client asks the right host for the wrong
path and nginx answers with the application's own `index.html` instead of an
error.

A value configured in either of the older shapes — ending in `/v1` or `/api/v1`
— is accepted and normalised rather than refused. See `src/api/http/apiBase.ts`.

### Running without a Server

`ApiFactory` picks the implementation: the fake one when
`VITE_APP_USE_FAKE_API` is `"true"` **or** when no `VITE_APP_API_BASE_URL` is
configured, the real HTTP client otherwise. The fake serves generated data, so
the interface can be developed without a running Server.

## The published image

Released images are pushed to GitHub's container registry when a `v*` tag is
pushed:

```bash
docker pull ghcr.io/algojudge/algojudge-client:1.2.3
```

`1.2.3`, `1.2`, `1` and `latest` all point at the same image. **A prerelease
(`v1.2.3-rc.1`) publishes only its own tag** — nothing moving follows it, so
`latest` is never a release candidate.

## Docker

Builds the static bundle and serves it from nginx. There is no Node.js runtime
in the final image.

```bash
docker run -p 8080:80 -e API_BASE_URL=https://api.example.org \
  ghcr.io/algojudge/algojudge-client:1.2.3
```

**One image serves every installation** (decided 2026-08-03). The address is
read from the container's environment when it starts, not from the build:

| Variable | Meaning |
|---|---|
| `API_BASE_URL` | the Server's origin. `/` when a reverse proxy serves both from one domain |
| `USE_FAKE_API` | `true` runs the interface against the in-browser fake, with no Server at all |

`docker-entrypoint.sh` writes those into `index.html` before nginx starts, and
says on stdout what it wrote. **Nothing here may hold a secret**: it ends up in a
page every browser reads.

The `VITE_APP_*` build arguments still exist and are left empty on purpose. Vite
inlines them into the bundle, so setting one binds the image to a single
installation — which is the thing the entrypoint exists to avoid. Build with one
only if you deliberately want an image that cannot be reconfigured.

Building it yourself is the same as what CI does:

```bash
docker build -t algojudge-client .
```

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

Forty of them, enumerated from `src/App.tsx` on 2026-08-30. The shell a route
draws is part of the route tree, so they are grouped by it.

| Shell | Routes |
|---|---|
| None — drawn inside a course page, where the platform supplies the chrome | `/lti/launched`, `/lti/failed`, `/lti/sign-in`, `/lti/conflict`, `/lti/choose` |
| The visitor's | `/login`, `/register` |
| Whichever the session calls for | `/`, `/terms`, `/privacy`, `/cookies`, `/accessibility` |

Everything below is behind one session guard, and behind `LaunchShell`, which
draws the confined interface for a tab that arrived through a framed launch.

| Route | View |
|---|---|
| `/account` | the account's own page |
| `/activities` | activity list |
| `/activities/:activityId` | the activity's own page, or the form to enrol |
| `/activities/:activityId/problems` | problem list, and `/:problemId` for one problem |
| `/activities/:activityId/submit/:problemId?` | submission form |
| `/activities/:activityId/submissions` | submission list, `/:submissionId` details, `/code` source |
| `/activities/:activityId/ranking` | ranking |
| `/activities/:activityId/questions` | questions and announcements |
| `/activities/:activityId/rules` | rules |

The manager panel is sixteen routes, lazily loaded as one chunk a participant
never downloads. Each is guarded by the permissions its own entry in
`src/pages/manager/managerAreas.ts` declares, so a screen cannot be listed in
the menu under one permission and guarded by another.

| Route | Screen |
|---|---|
| `/manager` | the panel's index |
| `/manager/activities`, `/manager/activities/:activityId` | activities, and one activity |
| `/manager/problems`, `/manager/problems/:problemId` | the problem library, and one problem |
| `/manager/submissions`, `/manager/submissions/:submissionId` | submissions, and one submission |
| `/manager/users`, `/manager/grants`, `/manager/permission-templates` | accounts and what they may do |
| `/manager/questions` | questions and announcements |
| `/manager/runners` | Runners |
| `/manager/instance` | what the installation says about itself |
| `/manager/external-content` | the hosts the Server may fetch a document from |
| `/manager/oidc`, `/manager/lti` | identity providers, and LTI platforms |

## Contributing

`main` is the integration and default branch; changes arrive through pull
requests. Run lint, `lint:deps`, typecheck and build before opening one.

Architecture rules that apply here: the Client renders, it never evaluates.
Untrusted JavaScript from a problem package must never be executed, an unknown
activity or problem type must fail into a controlled message rather than break
the application, and anything delivered over WebSocket must also be reproducible
through REST.

## Related repositories

- [AlgoJudge-Server](https://github.com/AlgoJudge/AlgoJudge-Server) — API, persistent state, authorization
- [AlgoJudge-Runner](https://github.com/AlgoJudge/AlgoJudge-Runner) — isolated execution and evaluation
- `AlgoJudge-Runner-UVa` — a second Runner, forwarding `uva@1` submissions to `onlinejudge.org`
- `AlgoJudge-Ops` — the production Compose stack, which is what ships this image to an installation
- `AlgoJudge-Identity-Keycloak` and `AlgoJudge-Identity-Authentik` — **two** supported identity deployments for `auth.algojudge.app`, neither a fallback for the other. An installation runs one

The last four are private.

## License

See [LICENSE](LICENSE). Contributors are listed in [AUTHORS.txt](AUTHORS.txt).
