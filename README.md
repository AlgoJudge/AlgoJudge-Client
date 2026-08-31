# AlgoJudge Client

AlgoJudge is open-source, self-hosted software for programming contests and
courses, with automatic evaluation of submitted solutions.

This is its web frontend. One application serves participants, activity managers
and administrators, with permission-aware views.

## What it does

Every screen that has something to fetch reads the API. Which implementation
answers is a configuration question rather than a screen's: `ApiFactory` serves
the fake or the real HTTP client. See *Running without a Server*.

| Area | Where |
|---|---|
| Activities, problems, submissions, source view, ranking, questions | `src/pages/` |
| Manager panel — sixteen screens, from activities to the LTI platforms | `src/pages/manager/` |
| Sign in and register | wired to the Server |
| Live status over WebSocket | `src/api/ws/WebSocketEvents.ts`, mounted as `<EventsProvider>` in `src/App.tsx` |
| Renderer registry keyed by the `name@version` discriminator | `src/renderers/TypeRegistry.ts`, registered in `src/renderers/index.ts` |

Views never call `fetch` directly. They go through `useApi`, `useApiEffect` or
`useApiCall`, which supply an `AbortSignal` scoped to the component.

## Technology

React 19, TypeScript 6, Vite 8, Mantine 9, React Router 7, i18next 26,
Tabler Icons. Polish and English, with translations in `public/locales/`.

## Requirements

Node.js 24 or later, and npm. Node 24 "Krypton" is the active LTS line.

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
script CI runs: `check:content`, `check:package`, `check:exchange`,
`check:zawodyweb`, `check:access`, `check:events`, `check:i18n` and `check:api`
in the `build` job, and `check:ui`, a Playwright suite, in `browser-checks`.

`npm run check:e2e` is the other suite and runs nowhere automatically: it wants
a full stack that is already up.

## Configuration

Development reads `.env`, which is **not in the repository**. Copy the example
and adjust:

```bash
cp .env.example .env
```

It points at a Server on `https://localhost:7004`, which is where that project's
own launch profile puts it. **Clear the value to work against the fake API** and
need no Server at all — see *Running without a Server*.

Build-time variables, read by Vite:

| Variable | Purpose |
|---|---|
| `VITE_APP_API_BASE_URL` | **origin** of AlgoJudge-Server, not a base URL — see below |
| `VITE_APP_USE_FAKE_API` | `true` forces the fake API implementation |
| `VITE_APP_DEBUG_AUTHENTICATION` | `true` bypasses the route guard. **Development only and off by default**: a production build ignores it, so no deployment can be configured into having no authentication |

`VITE_DOTNET_CERT` is the fourth, and the odd one out. `vite.config.ts` reads it
to serve the **development server** over HTTPS with the ASP.NET development
certificate, exporting one through `dotnet dev-certs` if there is none yet. It
configures the dev server rather than the bundle, and it needs the .NET SDK, so
it is off by default and plain HTTP is what most work needs.

Every `VITE_`-prefixed value is embedded in the published bundle, so none of
them can hold a secret.

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

### Where the API is

`/api/v1`, on whatever host serves it. **This is not configurable** — the Client
appends it itself, so `VITE_APP_API_BASE_URL` names only the origin:

| Configured | The Client asks |
|---|---|
| `https://api.example.com` | `https://api.example.com/api/v1/…` |
| `/` | `/api/v1/…` — the same origin the application is served from |
| *(empty)* | nothing: the fake API is used instead |

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

**One image serves every installation.** The address is read from the
container's environment when it starts, not from the build:

| Variable | Meaning |
|---|---|
| `API_BASE_URL` | the Server's origin. `/` when a reverse proxy serves both from one domain |
| `USE_FAKE_API` | `true` runs the interface against the in-browser fake, with no Server at all |

`docker-entrypoint.sh` writes those into `index.html` before nginx starts, and
says on stdout what it wrote. **Nothing here may hold a secret**: it ends up in a
page every browser reads.

The `VITE_APP_*` build arguments still exist and are left empty on purpose. Vite
inlines them into the bundle, so setting one binds the image to a single
installation — which is the thing the entrypoint exists to avoid.

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

The route tree is `src/App.tsx`. The manager panel is lazily loaded as one chunk
a participant never downloads, and each of its screens is guarded by the
permissions its own entry in `src/pages/manager/managerAreas.ts` declares — so a
screen cannot be listed in the menu under one permission and guarded by another.

## Architecture rules

The Client renders; it never evaluates. Untrusted JavaScript from a problem
package is never executed, an unknown activity or problem type fails into a
controlled message rather than breaking the application, and anything delivered
over WebSocket is also reproducible through REST.

## Related repositories

- [AlgoJudge-Server](https://github.com/AlgoJudge/AlgoJudge-Server) — API, persistent state, authorization
- [AlgoJudge-Runner](https://github.com/AlgoJudge/AlgoJudge-Runner) — isolated execution and evaluation
- [AlgoJudge-External-Runner](https://github.com/AlgoJudge/AlgoJudge-External-Runner) — a second Runner, forwarding submissions to external judging systems
- [AlgoJudge-Ops](https://github.com/AlgoJudge/AlgoJudge-Ops) — the production Compose stack, which is what ships this image to an installation
- [AlgoJudge-Docs](https://github.com/AlgoJudge/AlgoJudge-Docs) — the public documentation site, whose `/client/` section describes every screen here

## Contributing

Open an issue saying what you expected, what happened, and how to reproduce it.
Or open a pull request against `main`: one subject per pull request, with a note
on what changes and why.

By contributing you agree that your work is licensed under the terms below.

## License

This project is licensed under the MIT License.
See [LICENSE](LICENSE).

Authors are listed in [AUTHORS.txt](AUTHORS.txt).
