# Releasing the Client

For whoever cuts the release. Somebody installing the product wants
[AlgoJudge-Ops](https://github.com/AlgoJudge/AlgoJudge-Ops) instead.

Every claim below was checked against the repository on 2026-09-07 and retaken
on 2026-09-09, the day 0.1.1 was cut: the readings that move on their own —
dependencies, base images — and also the counts and line numbers this file quotes
out of other files, two of which had gone stale in a day. Where something could
not be checked, the last section says so rather than leaving it to be assumed.

## Where the version lives

**`package.json`, `version`**, with `package-lock.json` following it — change it
with `npm pkg set version=…` and `npm install --package-lock-only`, never by
hand, because the lock carries it in two places (`package-lock.json` lines 3 and
9). All three read `0.1.1`.

The package is `private` and is never published to a registry; the field exists
so the repository can say which release a commit belongs to.

**The version is not in the bundle.** Nothing under `src/`, `vite.config.ts` or
`index.html` reads it, and that is deliberate: one image serves every
installation, and what it is configured with is read from the container's
environment when it starts.

## The tag has to sit on `main`

`.github/workflows/release.yml` refuses a tag whose commit is not an ancestor of
`main` — the check is `git merge-base --is-ancestor HEAD main` — and
`.github/workflows/ci.yml` triggers on `push` and `pull_request` against `main`
alone.

**A release branch satisfies neither until it is merged.** It is not an ancestor
of `main`, so a tag pushed from it fails at *The tag must be on main*; and no CI
run exists for it, so it carries no evidence of its own either. Those are one
fix rather than two: land the branch on `main` through a pull request, let that
run go green, and tag the merge commit.

Both releases so far were cut that way, and 0.1.0 found the rule by meeting it.

## What a tag does

`release.yml` runs on a pushed tag matching `v*`, checks the ancestry above,
refuses a name that is not `v<major>.<minor>.<patch>[-prerelease]`, and publishes
`ghcr.io/algojudge/algojudge-client` under `0.1.1`, `0.1`, `0` and `latest`. A
prerelease publishes its own tag alone, so nothing moving follows it.

It builds the image, starts it, and checks it serves the front page and a deep
link before pushing. **It runs none of the checks below** — a tag points at a
commit, and that commit's own CI run is the evidence.

**The package exists and is public.** 0.1.0's tag created it on 2026-09-08, and
read anonymously on 2026-09-09 all four of `0.1.0`, `0.1`, `0` and `latest`
answer — so a tag now moves the three floating ones onto new bytes rather than
creating anything, and that move is what an installation following the major
picks up on its next `docker compose pull`. A package a workflow creates starts
private, which this one no longer is; `AlgoJudge-Ops/docs/INSTALL.md` covers what
private would mean for an installation pulling it.

## Before the tag

- [ ] `package.json` and `package-lock.json` say the version being released.
- [ ] `README.md` names it in the `docker pull` and `docker run` examples —
      lines 156 and 170, both `0.1.1`. **Recount them**: they were 149 and 163
      when 0.1.0 was cut, one day earlier.
- [ ] **The documentation describes the software as it is** — not merely the
      version in it. `README.md`, `CLAUDE.md`, `SERVER_CONTRACT.md`,
      `scripts/verify/README.md`, `AUTHORS.md` and `AUTHORS.txt`, this file, and
      the comments in `.env.example`, the `Dockerfile`, `docker-entrypoint.sh`,
      `example-full-stack-docker-compose.yaml` and the two workflows. See *What
      goes stale in a README*.
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
      recorded as deferred. A refresh happens **before** the gate above, not
      after it.
- [ ] **Every image the repository pins is a tag upstream still builds**, judged
      by the date it was last built. See *Every image this repository pins*.
- [ ] **Node is an Active LTS**, the same major in `.nvmrc`, `engines` and the
      `Dockerfile`. See *Node and the toolchain*.

`npm run check:e2e` is the other Playwright suite and is **not** a release gate:
it runs nowhere automatically and wants a full stack already up.

### What goes stale in a README

The bullet above it reads two lines and would pass a README that is wrong about
everything else. Four kinds of claim go stale on their own, and on 2026-09-08
three of the four had:

**A dependency named in prose.** *ESLint 9* stood in the `Commands` table against
10.10.0 installed, and `CLAUDE.md` carried the same sentence. Read every major
the `Technology` and `Commands` tables name against `package.json` on the day.

**A list that mirrors CI.** The README gave eight of the ten `check:` scripts the
`build` job runs — `check:languages` and `check:ranking` were missing — so the
gate a reader trusted was shorter than the one that blocks a merge. Count the
`run: npm run check:` lines in `.github/workflows/ci.yml` and compare.

**A value copied out of another file.** It said the example points at
`https://localhost:7004`; `.env.example` has pointed at `http://localhost:5171`
since `9d40088`, and the scheme is not cosmetic — `SameSite=Lax` makes an HTTP
page against an HTTPS API unable to sign in at all. Every address, port and
default stated in prose is a copy, and a copy does not move with its original.

**A count.** *Sixteen screens* in the manager panel is the number of
`managerRoute` calls in `src/App.tsx`, and it held. Recompute a count rather than
re-reading it, and know which thing is being counted: `managerAreas.ts` has
fourteen entries, two of them `soon: true`, and neither number is the one the
README states.

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
`836c451`, so it is absent from every current tree and reachable from the log.
Read on 2026-09-08, it holds two keys — `VITE_APP_API_BASE_URL` and
`VITE_APP_DEBUG_AUTHENTICATION` — and no third. By construction it could hold
nothing worth hiding either: a `VITE_`-prefixed value is inlined into the bundle
and is public the moment the image serves it. This paragraph is the record of
somebody having looked rather than assumed.

## Node and the toolchain

Node **24**, in three places that stay on the same major: `.nvmrc` (`24`, which
CI reads through `node-version-file`), `package.json` `engines` (`>=24`), and the
`Dockerfile` build stage (`node:24-alpine`, the one deliberate copy, because a
`FROM` cannot read `.nvmrc`).

**The rule: Node is an Active LTS on the day of the release**, and the three
places move together. Not the newest line, which nothing here needs, and not one
already in maintenance — a maintenance line takes security fixes and nothing
else, so an image built on it ships something upstream has stopped improving, for
as long as that image is deployed.

Node 24 satisfies the rule today. It is **Active LTS** on the release date,
enters maintenance 2026-10-20, and Node 26 becomes Active LTS on 2026-10-28 —
read from `nodejs/Release` `schedule.json` on 2026-09-07. So the pin is right for
0.1.1 and will not be right for a release cut after October; raising it is those
three files at once, plus the whole gate.

Checked locally on Node 24.20.0 with npm 11.19.0, which is what `README.md`
records.

## Dependencies

`npm outdated` and `npm audit`, both read-only. If the lockfile is going to
move, **it moves before the gate runs, never after**: a green gate is evidence
about one tree, and an `npm install`, `npm update` or `npm audit fix` afterwards
turns it into evidence about a tree nobody checked.

Read on **2026-09-09**. Nothing was taken this time, because nothing was
behind: `npm outdated` names the same two majors and no third row, and the
lockfile did not move — which is the shape a patch release should have.

**Nothing is behind inside its declared range.** `npm update` took sixteen
packages on the day the release was cut — Mantine 9.5.2 → 9.6.0 across all five,
`@playwright/test` 1.62.1 → 1.63.0, ESLint 10.9.1 → 10.10.0,
`@typescript-eslint/*` 8.68.0 → 8.70.0, `@types/react-dom` 19.2.5 → 19.2.7,
i18next 26.4.0 → 26.4.2, `i18next-http-backend` 4.0.1 → 4.0.2, `react-i18next`
17.0.12 → 17.0.13, katex 0.18.4 → 0.18.7, postcss 8.5.26 → 8.5.28 and
`eslint-plugin-react-refresh` 0.5.5 → 0.5.6. `package.json` did not move with
them, which is the check that this was a refresh and not a decision: every one
was already inside its `^`.

**At the latest published version, and untouched**: Vite 8.2.2, React and React
DOM 19.2.8, `@vitejs/plugin-react` 6.1.1, React Router 7.18.3, Monaco 0.56.0.

**Two majors, which are release decisions rather than chores.** Each moves the
range in `package.json` and needs the whole gate re-run:

- **TypeScript 6.0.3 → 7.0.2.** `README.md` states TypeScript 6 as the stack,
  and `@typescript-eslint`'s stable line is what decides when 7 is reachable.
- **`markdown-it-anchor` 9.2.1 → 10.0.0.** It anchors statement headings, which
  `check:content` covers.

Neither belongs in 0.1.1, and less so than in 0.1.0: something **is** published
now, so a major taken on release day is a major taken against installations that
will pull it, for a release whose whole content is two fixes.

**Mantine is worth naming on its own.** The browser suite no longer matches its
generated class names, so a Mantine minor does not redden `check:ui` for nothing.
It is still a UI library upgrade, and nothing in the file-reading gate can see a
view that renders differently: the full `check:ui` run against the refreshed tree
is what makes it evidence.

`npm audit`, 2026-09-09: **zero at every severity**, unchanged.

It read **one moderate** before the refresh, kept here because the next release
will meet the same shape: GHSA-p498-v437-472g, `@humanfs/node` 0.16.6, reached
through `eslint@10.9.1` and nothing else. It could not have shipped — the final
stage is nginx with `dist/` copied in and carries no Node.js runtime at all — and
ESLint 10.10.0, inside the existing range, closed it anyway.

## Every image this repository pins

Three, and the first two are what the release publishes:

| Image | Where | What it is |
|---|---|---|
| `node:24-alpine` | `Dockerfile`, build stage | builds the bundle; nothing of it reaches the published image |
| `nginx:1.30-alpine` | `Dockerfile`, final stage | **the whole of the published image's userland** |
| `postgres:18` | `example-full-stack-docker-compose.yaml` | development only, and pinned on purpose: an unpinned `postgres:latest` moved major once and took `PGDATA` with it |

**Check each against the registry before the tag, by the date it was last
built** — not by whether `docker pull` still works. A tag that resolves is not a
tag anybody still maintains, which is exactly how `1.27-alpine` survived here
seventeen months past its last build:

```bash
for i in node:24-alpine nginx:1.30-alpine postgres:18; do
  curl -s "https://hub.docker.com/v2/repositories/library/${i%%:*}/tags/${i##*:}" |
    python -c "import json,sys; d=json.load(sys.stdin); print(d['name'], d['last_updated'][:10])"
done
```

Read on 2026-09-09: `node:24-alpine` built 2026-08-27, `nginx:1.30-alpine`
2026-09-03, `postgres:18` 2026-08-26 — the same three builds as the day before,
none of them stale. Postgres 19 does not exist yet.

## The nginx base

**`1.30-alpine` here**, the stable line, raised from `1.27-alpine` for 0.1.0
and unchanged since. nginx numbers even minors stable and odd ones mainline, so the choice is
between `1.30-alpine` and `1.31-alpine`, and this repository takes the stable
one.

It was not merely behind. `nginx:1.27-alpine` was last built **2025-04-16**, so
it had stopped receiving nginx patches and Alpine package updates seventeen
months before this release, while pulling cleanly the whole time. It is also the
only stage with system packages in it — the second stage is `dist/` copied in —
which makes it the only part of this image that goes stale on its own.

**The other two are not this repository's to raise.** `AlgoJudge-Ops` defaults
its edge to `nginx:${NGINX_TAG:-1.27-alpine}` and `AlgoJudge-Docs` runs
`1.29-alpine`; read on 2026-09-08, both are stale the same way, and each is its
own release's step. If you raise one, know which of the three you are raising.

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

- [ ] The package carries `0.1.1`, and `0.1`, `0` and `latest` have moved onto
      it.
- [ ] `docker pull ghcr.io/algojudge/algojudge-client:0.1.1` succeeds from
      outside the organisation, or the package's visibility is deliberately
      private.
- [ ] Ops has been stood up against the published tags rather than local builds.

The documentation site cuts its `/client/` snapshot on release day. That is
`AlgoJudge-Docs`' step rather than this repository's, and for 0.1.0 it was taken:
`content/docs/en/client/v0.1` exists, and `docs.algojudge.pl` answers — read on
2026-09-09, it redirects to `/en/` and serves it. **A patch release is not a new
snapshot**: `/client/v0.1` is the 0.1 line, and 0.1.1 is in it.

### The public website states this component's version

`algojudge.pl` prints **`Client v0.1.0`** in four places — a card badge and
a roadmap item, in each of `src/content/pl.json` and `src/content/en.json` of
`AlgoJudge-Website`. Releasing a new version makes all four wrong, and **nothing
fails**: that repository has no CI at all.

Two traps, both measured 2026-09-18:

- `AlgoJudge-Website/tests/content.test.mjs:125` **pins the literal** by regex,
  `Client v0\.1\.0`, and hard-codes the five repository keys. Correcting
  the content turns the suite red and **the test is what is wrong** — fix it in
  the same commit, never satisfy it by reverting a correct fact.
- The tests run only when somebody types `npm test`. Nothing runs on a push or
  a pull request there.

**This was already true when this line was written.** `AlgoJudge-Client` and
`AlgoJudge-External-Runner` were released as `0.1.1` on 2026-09-09 and
2026-09-08, and the website still printed `v0.1.0` for both.

The procedure is `/website-sync` in the workspace. It is not this runbook's
step to perform, and it is this runbook's job to say that it is owed.

## Not verified here

- **`npm run check:e2e`** was not run: it runs nowhere automatically and needs a
  full stack already up.
- **The image was not built or pulled** from this branch; the `docker` job in
  `ci.yml` and the release workflow's own serve check are what cover it.

`npm run check:ui` **was** run in full for 0.1.1, against the tree being tagged,
which is the one line of this section that 0.1.0 could not write.
