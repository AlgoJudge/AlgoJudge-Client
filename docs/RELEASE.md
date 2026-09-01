# Releasing the Client

For whoever cuts the release. Somebody installing the product wants
[AlgoJudge-Ops](https://github.com/AlgoJudge/AlgoJudge-Ops) instead.

## Where the version lives

**`package.json`, `version`**, with `package-lock.json` following it — change it
with `npm pkg set version=…` and `npm install --package-lock-only`, never by
hand, because the lock carries it in two places.

It was `0.0.0` until 0.1.0, which is what `npm init` writes and nobody had
revisited. The package is `private` and is never published to a registry; the
field exists here so the repository can say which release a commit belongs to.

**The version is not in the bundle.** Nothing the browser loads reads it, and
that is deliberate: one image serves every installation, and what it is
configured with is read from the container's environment when it starts.

## What a tag does

`.github/workflows/release.yml` runs on a pushed tag matching `v*`, refuses one
that does not point at a commit on `main`, and publishes
`ghcr.io/algojudge/algojudge-client` under `0.1.0`, `0.1`, `0` and `latest`. A
prerelease publishes its own tag alone.

It starts the built image and checks it serves before pushing.

## Before the tag

- [ ] `package.json` and `package-lock.json` say the version being released.
- [ ] `README.md` names it in the `docker pull` and `docker run` examples.
- [ ] The commit is on `main`, and **its** CI run is green.
- [ ] `npm ci`, then `npm run lint`, `lint:deps`, `typecheck`, `build`.
- [ ] The content checks CI runs: `check:content`, `check:package`,
      `check:exchange`, `check:zawodyweb`, `check:access`, `check:events`,
      `check:i18n`, `check:api`.
- [ ] **`npm run check:ui` in full**, not per script. It is a Playwright suite
      against a real browser and it is the gate that catches what the unit tests
      cannot.
- [ ] `.env.example` lists what the source reads — three `VITE_APP_*` and
      `VITE_DOTNET_CERT`, the last read by `vite.config.ts`. Nothing checks this
      for you.
- [ ] The runtime variables the entrypoint writes into the bundle —
      `API_BASE_URL`, `USE_FAKE_API` — still match `docker-entrypoint.sh` and
      what the README documents.

**The nginx base is `1.27-alpine` here**, the same as the edge in
`AlgoJudge-Ops`. The documentation site runs `1.29-alpine` because it is a
separate deployment that shares nothing with an installation. If you raise one,
know which of the three you are raising.

## After the tag

The image has to exist before an installation can pull it: **Server and Client,
then the Runners, then Ops**, which asks for the moving major `0`.

The documentation site cuts its `/client/` snapshot on release day.
