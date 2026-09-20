# Releasing the Client

For whoever cuts the release. Somebody installing the product wants
[AlgoJudge-Ops](https://github.com/AlgoJudge/AlgoJudge-Ops) instead.

Every claim below was retaken against the repository on **2026-09-21**, the day
0.2.0 was cut: the readings that move on their own — dependencies, base images,
the Node schedule — and also the counts and line numbers this file quotes out of
other files. Where something could not be checked, the last section says so
rather than leaving it to be assumed.

**Recompute, do not re-read.** Ten claims in this file were wrong on the morning
of 2026-09-21, and the one reported as having held — a count of manager screens
— was among them. A figure that was right at the last release is evidence about
that day and nothing else.

## Where the version lives

**`package.json`, `version`**, with `package-lock.json` following it — change it
with `npm pkg set version=…` and `npm install --package-lock-only`, never by
hand, because the lock carries it in two places (`package-lock.json` lines 3 and
9). All three read `0.2.0`.

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
`ghcr.io/algojudge/algojudge-client` under `<major>.<minor>.<patch>`,
`<major>.<minor>`, `<major>` and `latest`. A prerelease publishes its own tag
alone, so nothing moving follows it.

It builds the image, starts it, and checks it serves the front page and a deep
link before pushing. **It runs none of the checks below** — a tag points at a
commit, and that commit's own CI run is the evidence.

**The package exists and is public.** Read anonymously on 2026-09-21, the tag
list answers `0.1.0`, `0.1.1`, `0.1`, `0` and `latest` — so a tag moves the three
floating ones onto new bytes rather than creating anything, and that move is what
an installation following the major picks up on its next `docker compose pull`.
A package a workflow creates starts private, which this one is not;
`AlgoJudge-Ops/docs/INSTALL.md` covers what private would mean for an
installation pulling it.

Read it without a token — `gh api .../packages` needs a `read:packages` scope
that a release does not otherwise require:

```bash
token=$(curl -s "https://ghcr.io/token?scope=repository:algojudge/algojudge-client:pull&service=ghcr.io" |
  python -c "import json,sys; print(json.load(sys.stdin)['token'])")
curl -s -H "Authorization: Bearer $token" \
  "https://ghcr.io/v2/algojudge/algojudge-client/tags/list"
```

## Before the tag

- [ ] `package.json` and `package-lock.json` say the version being released.
- [ ] `README.md` names it in **four** places, not two: the `docker pull`
      example, the sentence listing the four tags, the prerelease example beside
      it, and the `docker run` example — lines 156, 159, 160 and 170.
      **`git grep -n` the previous version rather than trusting those numbers**,
      which move whenever anything above them does.
- [ ] **The documentation describes the software as it is** — not merely the
      version in it. `README.md`, `CLAUDE.md`, `SERVER_CONTRACT.md`,
      `scripts/verify/README.md`, `AUTHORS.md` and `AUTHORS.txt`, this file, and
      the comments in `.env.example`, the `Dockerfile`, `docker-entrypoint.sh`,
      `example-full-stack-docker-compose.yaml` and the two workflows. See *What
      goes stale in a README*.
- [ ] The commit is on `main`, and **its** CI run is green. See *The tag has to
      sit on `main`*.
- [ ] `npm ci`, then `npm run lint`, `lint:deps`, `typecheck`, `build`.
- [ ] **The `check:` scripts the `build` job runs. Count them in
      `.github/workflows/ci.yml` rather than here** — `grep -c 'run: npm run
      check:'` — because the list grows and a copy of it does not. Thirteen on
      2026-09-21: `check:content`, `check:package`, `check:languages`,
      `check:exchange`, `check:zawodyweb`, `check:access`, `check:time`,
      `check:events`, `check:i18n`, `check:ranking`, `check:seo`, `check:api`,
      `check:instructions`. With `check:ui` in `browser-checks` that is fourteen
      in all.
- [ ] **`npm run check:ui` in full**, not per script.
- [ ] **`check:api` and `check:events` against the Server's own documents.** See
      *Two checks CI runs blind*.
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

### Two checks CI runs blind

`check:api` and `check:events` each compare **only when handed a document**, and
CI hands them none. Run bare they print what this Client calls and stay green
whatever the Server does, so in CI they are inventories rather than checks.

The Server commits both documents, beside each other, and both are present at
its release tags. A release is the one moment the comparison can be made against
a Server that is itself released:

```bash
git -C ../AlgoJudge-Server switch --detach v<major>.<minor>.<patch>
npm run check:api    -- ../AlgoJudge-Server/openapi.json
npm run check:events -- ../AlgoJudge-Server/events.json
```

`check:api` reads `openapi.json` and reports an endpoint this Client calls that
the Server does not serve. `check:events` drives the real `WebSocketEvents` class
and diffs the event names against `events.json`, which is generated from
`Api/Contracts/Events.cs` — that diff is what once caught fourteen names
reaching nobody.

**Read a difference before calling it a defect.** The two repositories release
independently, so a name on one side and not the other may be a Client ready for
a Server that has not shipped yet. What it must never be is unnoticed.

### What goes stale in a README

The bullet above it reads four lines and would pass a README that is wrong about
everything else. Four kinds of claim go stale on their own, and each has done so
here at least once:

**A dependency named in prose.** The `Technology` and `Commands` tables name a
major per library — React 19, TypeScript 6, Vite 8, Mantine 9, React Router 7,
i18next 26, ESLint 10. Read every one against `package.json` on release day; a
refresh inside a `^` leaves them all true and a major taken makes one false.

**A list that mirrors CI.** The README names the `check:` scripts the `build`
job runs, and the list grows. Count the `run: npm run check:` lines in
`.github/workflows/ci.yml` and compare, rather than reading either prose against
the other — `ci.yml` is the only one of the three that decides anything.

**A value copied out of another file.** Every address, port and default stated
in prose is a copy, and a copy does not move with its original. The one that
matters most is the scheme: `SameSite=Lax` makes an HTTP page against an HTTPS
API unable to sign in at all, so `http://localhost:5171` in `.env.example` and
an `https://` example in the README would describe a pairing that cannot work.

**A count.** *Seventeen screens* in the manager panel is the number of
`managerRoute` **call sites** in `src/App.tsx` — `grep -c` gives eighteen,
because the arrow function's own definition matches too. Know which thing is
being counted: `managerAreas.ts` has fourteen entries, one of them `soon: true`,
and neither number is the one the README states.

**`check:instructions` covers `CLAUDE.md` and not this file or the README.** It
asserts the counts `CLAUDE.md` states about the repository, which is why those
stay true between releases without anybody looking. Every count in the README and
in this runbook is still checked by a person, on release day, or not at all.

### Why `check:ui` is the gate

There is no unit-test runner in this repository. `lint`, `lint:deps`,
`typecheck`, `build` and every `check:` script in the `build` job read files and
modules; not one of them renders a screen, so a rule applied by a view instead of
by the API, a control that stopped reaching the keyboard, or two halves of the
fake disagreeing all pass the whole of that gate.

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

Checked both ways on 2026-09-21: the source reaches these four plus Vite's own
`DEV`, `PROD` and `BASE_URL`, which are not configuration. Nothing in
`.env.example` goes unread, and nothing the source reads is missing from it.

**Three of the four are reached as `import.meta.env.*` and the fourth is not.**
`VITE_DOTNET_CERT` is read by `vite.config.ts` through `loadEnv`, because it
configures the dev server rather than the bundle — so a grep for
`import.meta.env` alone finds three keys, concludes the example has one too many,
and is wrong. Grep for the bare names.

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

Node 24 satisfies the rule today. Read from `nodejs/Release` `schedule.json` on
**2026-09-21**: 24 entered Active LTS 2025-10-28 and leaves it **2026-10-20**,
Node 26 becomes Active LTS 2026-10-28, and 22 is already in maintenance.

**So the pin is right for 0.2.0 by twenty-nine days.** A release cut after
2026-10-20 cannot say this, and the gap between the two dates is eight days in
which no line is both Active LTS and released — plan the move rather than
discovering it. Raising it is those three files at once, plus the whole gate.

Read the schedule; do not carry the dates. They are published as data:

```bash
curl -s https://raw.githubusercontent.com/nodejs/Release/main/schedule.json
```

Checked locally on Node 24.20.0 with npm 11.19.0, which is what `README.md`
records.

## Dependencies

`npm outdated` and `npm audit`, both read-only. If the lockfile is going to
move, **it moves before the gate runs, never after**: a green gate is evidence
about one tree, and an `npm install`, `npm update` or `npm audit fix` afterwards
turns it into evidence about a tree nobody checked.

Read on **2026-09-21**. `npm outdated` gave nineteen rows: seventeen inside
their declared range, and two majors where `Wanted` equals `Current`.

**The refresh was taken.** `npm update` moved **fifty-one** packages in the lock
— seventeen direct and the rest transitive — and added or removed none: 326
entries before and after. `package.json` did not move with them, **which is the
check that this was a refresh and not a decision**: every one was already inside
its `^`.

The direct seventeen: Mantine 9.6.0 → 9.6.1 across all five,
`@tabler/icons-react` 3.46.0 → 3.47.0, `@types/react` 19.2.18 → 19.3.0,
`@types/react-dom` 19.2.7 → 19.3.0, ESLint 10.10.0 → 10.11.0,
`eslint-plugin-react-refresh` 0.5.6 → 0.5.7, `markdown-it` 15.0.1 → 15.0.2,
React and React DOM 19.2.8 → 19.3.0, `react-i18next` 17.0.13 → 17.0.14, React
Router 7.18.3 → 7.18.4, Vite 8.2.2 → 8.3.0, `yaml` 2.9.0 → 2.9.1.

**Compare the two lockfiles rather than reading `npm update`'s summary.** It
reports how many packages changed and not which, and the distinction that
matters at a release is between a version moving and a package arriving:

```bash
cp package-lock.json /tmp/before.json && npm update
python - <<'PY'
import json
b=json.load(open('/tmp/before.json'))['packages']
a=json.load(open('package-lock.json'))['packages']
print('added  ', sorted(set(a)-set(b)))
print('removed', sorted(set(b)-set(a)))
print('moved  ', sum(1 for k in set(a)&set(b) if a[k].get('version')!=b[k].get('version')))
PY
git diff --quiet -- package.json && echo 'package.json unchanged: a refresh'
```

**Two of the seventeen are worth naming rather than counting.** React 19.2.8 →
19.3.0 and Vite 8.2.2 → 8.3.0 are minors of the renderer and of the build tool,
and **nothing in the file-reading gate can see a view that renders
differently**. The full `check:ui` run against the refreshed tree is what turns
a refresh into evidence. The same holds for Mantine, whose generated class names
the browser suite no longer matches — so a Mantine minor does not redden
`check:ui` for nothing, and equally does not vouch for itself.

**Two majors, which are release decisions rather than chores.** Each moves the
range in `package.json` and needs the whole gate re-run. Both were left where
they are for 0.2.0:

- **TypeScript 6.0.3 → 7.0.2**, and it is **red**: Dependabot's pull request
  fails *Lint, typecheck, build*, *The browser checks* and *Build the container
  image*. `@typescript-eslint`'s stable line declares `typescript <6.1.0` and
  only its alphas support 7, so this is the expected result rather than a
  surprise. It becomes takeable when that line does, not before.
- **`markdown-it-anchor` 9.2.1 → 10.0.0**, and it is **green** on all six
  checks. It anchors statement headings, which `check:content` covers. Nothing
  in this release needed it, and a major taken on release day is a major taken
  against installations that will pull it.

**A green Dependabot major is still a decision; a red one is not even a
question.** Read the pull request's own checks before weighing either — the two
here differ in nothing except that, and it settles both.

`npm audit`, 2026-09-21: **zero at every severity**, before and after the
refresh.

**`npm audit` is the advisory scan and Dependabot is not.** Dependabot offers
upgrades and says nothing about what is already in the lock, so an open pull
request is not evidence of anything and an empty inbox is not either. Run the
audit, and run it before the gate: a lock that moves afterwards makes the green
gate evidence about a tree nobody checked.

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

Read on 2026-09-21: `node:24-alpine` built **2026-09-18**, `nginx:1.30-alpine`
**2026-09-18**, `postgres:18` **2026-09-19** — all three within three days, none
of them stale. Postgres 19 does not exist yet.

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

**The other two are not this repository's to raise.** Read on 2026-09-21, all
three now agree: `AlgoJudge-Ops` defaults its edge to
`nginx:${NGINX_TAG:-1.30-alpine}` — in `compose.yaml` and in `.env.example` —
and `AlgoJudge-Docs` builds on `1.30-alpine`. Agreement is not a rule, though;
each moves on its own release's schedule. If you raise one, know which of the
three you are raising, and do not read this file for the other two.

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

## Cutting the tag

The tag is what publishes. Nothing that lands on `main` reaches the registry on
its own, and nothing above this line has moved a byte outside this machine.

Three things are true before it is cut, and each is read rather than assumed:

```bash
git merge-base --is-ancestor <sha> origin/main          # it is on main
gh run list -R AlgoJudge/AlgoJudge-Client --commit <sha> # its own run, green
git tag --list                                           # the name is free
```

**Its own run.** A later green run on `main` is evidence about a later commit,
and a release branch has no run at all — `ci.yml` triggers on `main` and on pull
requests into it, which is the same reason the branch has to be merged first.

The tag is annotated, and the message names the product:

```bash
git tag -a v<version> -m "AlgoJudge Client <version>" <sha>
git push origin v<version>
```

That push starts `.github/workflows/release.yml`, which takes **about a minute**
— the shortest of the five. It builds the image, starts it, checks it serves the
front page and a deep link, and pushes the four tags. Watch it rather than
assuming it: `gh run watch <id> -R AlgoJudge/AlgoJudge-Client`.

**Two things have no undo.** The run is never canceled: `cancel-in-progress` is
`false` here because a run interrupted between two `docker push` calls leaves a
version half in the registry. And **deleting a tag unpublishes nothing** — the
images of a tag deleted from a sibling repository in August 2026 are still in
GHCR. The name is checked before the push or not at all.

Then the GitHub Release, which no workflow creates — `release.yml` holds
`contents: read`:

```bash
gh release create v<version> -R AlgoJudge/AlgoJudge-Client \
  --title "<version>" --notes-file <file>
```

The title is the bare version, with no `v`. Add `--prerelease` when the version
carries one; a prerelease publishes its own tag alone and moves
`<major>.<minor>`, `<major>` and `latest` onto nothing.

**A release body is not a file in this repository.** GitHub renders a single
newline as a visible line break, so an eighty-column paragraph arrives as a
ragged column. Write each paragraph as one physical line.

## After the tag

- [ ] The package carries the new version, and `<major>.<minor>`, `<major>` and
      `latest` have moved onto it — all four at one digest, read by comparing
      the `docker-content-digest` header of each.
- [ ] `docker pull ghcr.io/algojudge/algojudge-client:<version>` succeeds from
      outside the organization, or the package's visibility is deliberately
      private.
- [ ] Ops has been stood up against the published tags rather than local builds.

**The documentation snapshot, and only on the day.** `AlgoJudge-Docs` cuts
`/client/` when this repository opens a new **minor** line —
`npm run snapshot -- v<major>.<minor> client` — and **there is no backfill**: it
is taken on release day or never. It refuses a patch version as usage and
refuses to re-cut a directory that exists, so a patch release must not invoke it
at all and a minor release must not forget to.

It is `AlgoJudge-Docs`' step rather than this repository's, which is why it is
easy to lose: nothing in this repository fails when it is skipped, and the
window closes with the day. `content/docs/en/client/` holds `v0.1`.

### The public website states this component's version

`algojudge.pl` states this component's version in **three structural places per
locale file**, in each of `src/content/pl.json` and `src/content/en.json` of
`AlgoJudge-Website`: a sentence claiming one version for every component, a
`badge` on each of the five component cards, and a roadmap `items` array naming
all five. A release makes this component's entry wrong in all six.

**`AlgoJudge-Website` has no CI at all.** Its tests run only when somebody types
`npm test`, so nothing reports the mismatch — read on 2026-09-21, every one of
those places still says `v0.1.0`, which has been wrong for this component since
0.1.1 was cut.

**The test is wrong in its shape, not only in its literal.**
`tests/content.test.mjs` is named *"the 0.1 release line reflects independently
versioned components"* and then asserts, in a loop over five hard-coded
component keys, that each reads `v0\.1\.0`. Those two things cannot both be
wanted: components that version independently do not share a literal. Correcting
the content turns the suite red, and editing the regex would keep the defect —
the loop is what has to go.

The correction is `/website-sync` in the workspace, and it is a separate piece of
work with its own approval. This runbook's step is to record that it is owed.

## Not verified here

- **`npm run check:e2e`** was not run: it runs nowhere automatically and needs a
  full stack already up.
- **The image was not built or pulled** from this branch; the `docker` job in
  `ci.yml` and the release workflow's own serve check are what cover it.
- **No installation was stood up against the published image.** That is
  `AlgoJudge-Ops`' proof and its own release's step.

`npm run check:ui` **was** run in full, against the tree being tagged, and so
were `check:api` and `check:events` against the Server's own documents at its
release tag.
