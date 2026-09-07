# Releasing the Client

For whoever cuts the release. Somebody installing the product wants
[AlgoJudge-Ops](https://github.com/AlgoJudge/AlgoJudge-Ops) instead.

Every claim below was checked against the repository on 2026-09-07. Where
something could not be checked, the last section says so rather than leaving it
to be assumed.

## Where the version lives

**`package.json`, `version`**, with `package-lock.json` following it — change it
with `npm pkg set version=…` and `npm install --package-lock-only`, never by
hand, because the lock carries it in two places (`package-lock.json` lines 3 and
9). All three read `0.1.0`.

The package is `private` and is never published to a registry; the field exists
so the repository can say which release a commit belongs to.

**The version is not in the bundle.** Nothing under `src/`, `vite.config.ts` or
`index.html` reads it, and that is deliberate: one image serves every
installation, and what it is configured with is read from the container's
environment when it starts.

## The tag has to sit on `main`

`.github/workflows/release.yml` refuses a tag whose commit is not an ancestor of
`main`, and that is the first thing to settle, because it does not hold for this
branch:

**`release/0.1.0` is not an ancestor of `main`.** `main` is at `7da88ab`, and
this branch carries commits on top of it. A tag pushed from here fails at *The
tag must be on main*. The check is
`git merge-base --is-ancestor HEAD main`.

`.github/workflows/ci.yml` triggers on `push` and `pull_request` against `main`
alone, so **no CI run exists for `release/0.1.0`**. The branch carries no
evidence of its own.

Both are the same fix: land the branch on `main` through a pull request, let
that run go green, and tag the merge commit.

## What a tag does

`release.yml` runs on a pushed tag matching `v*`, checks the ancestry above,
refuses a name that is not `v<major>.<minor>.<patch>[-prerelease]`, and publishes
`ghcr.io/algojudge/algojudge-client` under `0.1.0`, `0.1`, `0` and `latest`. A
prerelease publishes its own tag alone, so nothing moving follows it.

It builds the image, starts it, and checks it serves the front page and a deep
link before pushing. **It runs none of the checks below** — a tag points at a
commit, and that commit's own CI run is the evidence.

`ghcr.io/algojudge` is empty and no repository carries a `v*` tag, so this tag
creates the package. A package a workflow creates starts private;
`AlgoJudge-Ops/docs/INSTALL.md` covers what that means for an installation
pulling it.

## Before the tag

- [ ] `package.json` and `package-lock.json` say the version being released.
- [ ] `README.md` names it in the `docker pull` and `docker run` examples —
      lines 149 and 163, both `0.1.0`.
- [ ] The commit is on `main`, and **its** CI run is green. See *The tag has to
      sit on `main`*.
- [ ] `npm ci`, then `npm run lint`, `lint:deps`, `typecheck`, `build`.
- [ ] **The ten `check:` scripts the `build` job runs**: `check:content`,
      `check:package`, `check:languages`, `check:exchange`, `check:zawodyweb`,
      `check:access`, `check:events`, `check:i18n`, `check:ranking`,
      `check:api`. `check:api` cannot go red as it is invoked — it prints the
      endpoints the HTTP layer calls, because the Server publishes no OpenAPI
      document yet.
- [ ] **`npm run check:ui` in full**, not per script.
- [ ] `.env.example` matches the source **in both directions**. Nothing checks
      this here.
- [ ] The runtime variables are not confused with the build-time ones.
- [ ] `git ls-files` names `.env.example` and no other env file.
- [ ] `npm outdated` and `npm audit` read, and each entry either taken or
      recorded as deferred.

`npm run check:e2e` is the other Playwright suite and is **not** a release gate:
it runs nowhere automatically and wants a full stack already up.

### Why `check:ui` is the gate

There is no unit-test runner in this repository. `lint`, `lint:deps`,
`typecheck`, `build` and the ten `check:` scripts all read files and modules;
not one of them renders a screen, so a rule applied by a view instead of by the
API, a control that stopped reaching the keyboard, or two halves of the fake
disagreeing all pass the whole of that gate.

`check:ui` is a Playwright suite driving a real browser against the fake API. It
runs as the `browser-checks` job, blocks a merge, and carries `retries: 0`.
Budget minutes rather than seconds — the job allows 45. `scripts/verify/README.md`
covers running it, and what a single red script in an otherwise green run
usually means.

### The two sets of variables

They are configured in different places at different times, and they are the
easiest thing here to mix up.

**Build-time**, inlined by Vite and baked into the bundle. Four, and
`.env.example` lists exactly these four:

| Variable | Read by |
|---|---|
| `VITE_APP_API_BASE_URL` | `src/api/ApiFactory.ts`, `src/api/http/apiBase.ts` |
| `VITE_APP_USE_FAKE_API` | `src/api/ApiFactory.ts` |
| `VITE_APP_DEBUG_AUTHENTICATION` | `src/routers/Authentication.tsx`, under `import.meta.env.DEV` |
| `VITE_DOTNET_CERT` | `vite.config.ts` — the **dev server**, not the bundle |

Checked both ways on 2026-09-07: `import.meta.env` across `src/`,
`vite.config.ts` and `index.html` reaches these four plus Vite's own `DEV` and
`BASE_URL`, which are not configuration. Nothing in `.env.example` goes unread,
and nothing the source reads is missing from it.

**Runtime**, written into the served bundle by `docker-entrypoint.sh` when the
container starts. Two, and neither is `VITE_`-prefixed:

| Variable | Becomes |
|---|---|
| `API_BASE_URL` | `window.__ALGOJUDGE__.apiBaseUrl` |
| `USE_FAKE_API` | `window.__ALGOJUDGE__.useFakeApi` |

Both are emitted as JSON **strings**: `ApiFactory` compares `useFakeApi` to
`"true"` and `apiBase` calls `.trim()`, so a bare boolean breaks both. `README.md`
documents the same two and the `Dockerfile` declares them with empty defaults.
Where both sets are present, runtime wins.

The `VITE_APP_*` build arguments in the `Dockerfile` are left empty on purpose:
one set there binds the image to a single installation, which is the thing the
entrypoint exists to avoid. **Neither set may hold a secret** — everything in
both ends up readable in the browser.

### There is no `.env` in the repository

`git ls-files` names `.env.example` and nothing else. `.gitignore` and
`.dockerignore` both exclude `.env` and `.env.*` while keeping the example, so a
working copy's own `.env` is neither committed nor built into the image. That
file is a developer's and is never printed, quoted or carried into a release.

**History still holds one**: `.env` was added in `76f259c` and untracked in
`836c451`, so it is absent from every current tree and reachable from the log. By
construction it can hold only `VITE_`-prefixed values, which are public — the
release is the moment to have somebody confirm that rather than assume it.

## Node and the toolchain

Node **24**, in three places that stay on the same major: `.nvmrc` (`24`, which
CI reads through `node-version-file`), `package.json` `engines` (`>=24`), and the
`Dockerfile` build stage (`node:24-alpine`, the one deliberate copy, because a
`FROM` cannot read `.nvmrc`).

Node 24 is **Active LTS** on the release date. It enters maintenance 2026-10-20,
when Node 26 becomes Active LTS on 2026-10-28 — read from `nodejs/Release`
`schedule.json` on 2026-09-07. The pin is right for 0.1.0, and raising it to 26
is a decision for after the release, in those three files.

Checked locally on Node 24.20.0 with npm 11.19.0, which is what `README.md`
records.

## Dependencies

`npm outdated` and `npm audit`, both read-only. **Never `npm install`,
`npm update` or `npm audit fix` while cutting a release** — the lockfile must not
move under a version that has already been checked.

Read on **2026-09-07**:

**At the latest published version**: Vite 8.2.2, React and React DOM 19.2.8,
`@vitejs/plugin-react` 6.1.1, React Router 7.18.3, Monaco 0.56.0.

**Behind, and every one inside its declared `^` range** — a lockfile refresh
rather than a release decision: Mantine 9.5.2 → 9.6.0 across all five packages,
`@playwright/test` 1.62.1 → 1.63.0, ESLint 10.9.1 → 10.10.0,
`@typescript-eslint/*` 8.68.0 → 8.69.0, `@types/react-dom` 19.2.5 → 19.2.7,
i18next 26.4.0 → 26.4.2, `i18next-http-backend` 4.0.1 → 4.0.2, `react-i18next`
17.0.12 → 17.0.13, katex 0.18.4 → 0.18.7, postcss 8.5.26 → 8.5.28,
`eslint-plugin-react-refresh` 0.5.5 → 0.5.6.

**Two majors, which are release decisions rather than chores.** Each moves the
range in `package.json` and needs the whole gate re-run:

- **TypeScript 6.0.3 → 7.0.2.** `README.md` states TypeScript 6 as the stack,
  and `@typescript-eslint`'s stable line is what decides when 7 is reachable.
- **`markdown-it-anchor` 9.2.1 → 10.0.0.** It anchors statement headings, which
  `check:content` covers.

Neither belongs in 0.1.0. Nothing is published, so there is no installation to
break and no reason to take a major on release day.

**Mantine is worth naming on its own.** The browser suite no longer matches its
generated class names, so a Mantine minor does not redden `check:ui` for nothing.
It is still a UI library upgrade: if it is taken, a full `check:ui` run is the
evidence, not the file-reading gate.

`npm audit`, 2026-09-07: **one moderate, zero high, zero critical**, over 317
dependencies.

| | |
|---|---|
| Advisory | GHSA-p498-v437-472g, `@humanfs/node` < 0.16.8 |
| Present as | 0.16.6, `dev: true` in the lockfile |
| Reached through | `eslint@10.9.1`, and nothing else |
| In the published image | no — the final stage is `nginx:1.27-alpine` with `dist/` copied in, and there is no Node.js runtime in it |

It is a development-tree advisory and does not ship. The ESLint 10.10.0 bump
above is the ordinary way out of it, inside the existing range.

## The nginx base

**`1.27-alpine` here**, and `AlgoJudge-Ops/compose.yaml` defaults its edge to the
same (`nginx:${NGINX_TAG:-1.27-alpine}`). `AlgoJudge-Docs` runs `1.29-alpine`
because it is a separate deployment that shares nothing with an installation. If
you raise one, know which of the three you are raising.

## Release order across the repositories

An image has to exist before anything can pull it:

1. **AlgoJudge-Server** and **AlgoJudge-Client** — independent of each other,
   either order, or together.
2. **AlgoJudge-Runner**, which publishes `algojudge-runner` and the four `lang-*`
   sandbox images.
3. **AlgoJudge-External-Runner**, which publishes `algojudge-external-runner`.
4. **AlgoJudge-Ops** last. It builds nothing and pulls all six by tag.

Only step 4 is a hard dependency. `AlgoJudge-Ops/compose.yaml` references
`algojudge-server`, `algojudge-client`, `algojudge-runner`, `lang-gcc`,
`lang-clang`, `lang-python`, `lang-pypy` and `algojudge-external-runner`, every
one at the **moving major `0`** by default, so publishing `0` from here is what
makes an installation resolve.

Neither Runner depends on the other's image, and neither depends on this one.
Their order is the order the release follows, not a constraint.

## After the tag

- [ ] The package exists at `ghcr.io/algojudge/algojudge-client` and carries
      `0.1.0`, `0.1`, `0` and `latest`.
- [ ] `docker pull ghcr.io/algojudge/algojudge-client:0.1.0` succeeds from
      outside the organisation, or the package's visibility is deliberately
      private.
- [ ] Ops has been stood up against the published tags rather than local builds.

The documentation site cuts its `/client/` snapshot on release day. That is
`AlgoJudge-Docs`' step rather than this repository's, and it is not done:
`content/docs/en/client/` holds no version directory, and `docs.algojudge.pl` has
no DNS record.

## Not verified here

- **`npm run check:ui` was not run** while this file was written. It is minutes
  long and it is a gate rather than a document check — run it against the commit
  being tagged.
- **`npm run check:e2e`** likewise, and it needs a full stack.
- **No CI run exists for `release/0.1.0`** to read, for the reason in *The tag
  has to sit on `main`*.
- **The image was not built or pulled** from this branch; the `docker` job in
  `ci.yml` and the release workflow's own serve check are what cover it.
