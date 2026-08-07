# What the Server needs from this Client

> Recorded 2026-08-08, while implementing `AlgoJudge-Server` against this
> repository's API layer. **Nothing here has been changed** — these are the
> places where the Client and a working Server cannot both be right, with the
> change each one needs. They are proposals awaiting a decision.

The Server now serves 24 of the 95 calls this Client makes. The rest arrive with
the manager panel and the Runner surface; that is a schedule, not a disagreement.
What follows is the disagreement.

---

## 1. Three paths carry two shapes — **blocking**

`Verified fact`, read from this repository:

| Method and path | Participant expects | Manager expects |
|---|---|---|
| `GET /activities` | `Page<Activity>` — `http/ParticipantApiHttp.ts:39` | `Page<ManagedActivity>` — `http/ManagerApiHttp.ts:230` |
| `GET /activities/{idOrSlug}` | `Activity` — `ParticipantApiHttp.ts:51` | `ManagedActivity` — `ManagerApiHttp.ts:234` |
| `GET /activities/{activityId}/series` | `Series[]` — `ParticipantApiHttp.ts:60` | `ManagedSeries[]` — `ManagerApiHttp.ts:275` |

These are not supersets of one another. `Activity` carries `state`, `membership`
and `finalScore`, which the manager model has no notion of; `ManagedActivity`
carries `joinPassword`, `attachmentVisibility`, `seriesCount`,
`participantCount` and the three ceilings, which a participant may not read.
`Series` withholds `problems` before a round opens; `ManagedSeries` never does.

**One HTTP method and path has one response schema.** An OpenAPI document cannot
describe otherwise, a generated client cannot consume it, and a Server that
picked a shape by guessing at the caller's intent would be deciding disclosure
from something other than permissions.

**The Server has moved the manager reads under `/manager/`**, which the contract
already had one of (`getManagedActivities` calls `GET /manager/activities`,
`ManagerApiHttp.ts:198`). Four lines here follow:

```diff
  // ManagerApiHttp.ts
- getActivities(...)  → "/activities"
+ getActivities(...)  → "/manager/activities"                  Page<ManagedActivity>

- getActivity(...)    → `/activities/${idOrSlug}`
+ getActivity(...)    → `/manager/activities/${idOrSlug}`      ManagedActivity

- getSeries(...)      → `/activities/${activityId}/series`
+ getSeries(...)      → `/manager/activities/${activityId}/series`  ManagedSeries[]

- getManagedActivities(...) → "/manager/activities"            ManagedActivitySummary[]
+ getManagedActivities(...) → "/manager/activities/summary"    ManagedActivitySummary[]
```

The writes keep their paths — `POST /activities`, `POST /activities/{id}/series`,
`POST /series/{id}/problems` — because a participant has no write there and
nothing collides.

The fake is untouched by any of this: it dispatches on method names, not paths.

---

## 2. `check:api` does not honour `servers[].url`

`scripts/check-api.mjs` builds the expected path as `API_PATH + path`, giving
`/api/v1/activities`. A conforming OpenAPI document keeps `paths` **relative to
`servers[].url`**, so the Server's document says `/activities` with
`servers: [{ "url": "/api/v1" }]`.

The comparison therefore never matches. Run against the real document it reports
*every* endpoint as unserved and *every* served endpoint as one the Client never
calls — which is what it did, and the numbers looked convincing.

```diff
+ // Paths in an OpenAPI document are relative to the server URL.
+ const base = (openapi.servers?.[0]?.url ?? "").replace(/\/+$/, "");
  for (const [path, item] of Object.entries(openapi.paths ?? {})) {
      for (const method of Object.keys(item)) {
          if (["get", "post", "put", "patch", "delete"].includes(method)) {
-             served.add(`${method.toUpperCase()} ${path}`);
+             served.add(`${method.toUpperCase()} ${base}${path}`);
          }
      }
  }
```

With that applied against the Server's current document: **24 served, 71 not
yet** — 61 of them `ManagerApiHttp`, 5 `CoreApiHttp`, 5 `ParticipantApiHttp`.

The Server commits its document at `AlgoJudge-Server/openapi.json` and its CI
fails if it drifts from what is served, so this check has something stable to run
against:

```
npm run check:api -- ../AlgoJudge-Server/openapi.json
```

---

## 3. `seriesState.ts` should trust `isOpen`

Decided 2026-08-08: **whether a series is running is stored on the Server**, set
by a scheduler, and is no longer derived from its dates.

`api/seriesState.ts:34-39` computes the state from `endDate`, `pausedAt` and
`startDate`, and reads `isOpen` only in the paused branch. A round the scheduler
has opened will therefore read as `upcoming` here until the screen refetches or
the `seriesChanged` event lands.

The proposal is that `seriesState()` take `isOpen` as authoritative and use the
dates only for the countdown. This is the one change to production Client code
that the Server's implementation asks for, and it needs a decision of its own —
it was raised when the stored flag was chosen and is recorded here so it is not
lost.

---

## 4. The fake throws plain `Error` where the contract promises a code

`api/ApiError.ts` documents that "the fake throws the same classes, so a screen
behaves the same way against both". It does not: across `src/api/fake/`, only six
call sites construct a typed `ApiError`. Every slug conflict, every "refused
because something exists", every not-found and the checksum mismatch in
`FileApiFake.ts:95` go through `Utils.throwError`, which is `new Error(message)`
with no `status`, no `code` and no `fields`.

`ConflictError`, `NotFoundError`, `ValidationError` and `ChecksumMismatchError`
are declared and **never thrown anywhere in the fake**.

This costs nothing in production — the real transport builds them from
`problem+json` — but it means a screen's behaviour against the fake is not
evidence of its behaviour against the Server. The codes the Server emits today,
for the fake to match:

| Code | Status | When |
|---|---|---|
| `unauthenticated` | 401 | no session |
| `forbidden` | 403 | a permission the caller does not hold |
| `not_found` | 404 | absent, or absent to this caller |
| `conflict` | 409 | refused because of what is already there |
| `activity.slug.taken`, `problem.slug.taken`, `series.slug.taken`, `assignment.slug.taken` | 409 | a name in use |
| `activity.archived`, `problem.archived` | 409 | an archived owner takes no changes |
| `series.closed` | 403 | the round is not accepting submissions |
| `submission.language` | 403 | a language the activity does not accept |
| `submission.limit` | 403 | no submissions left |
| `registration.closed` | 403 | the instance does not accept sign-ups |
| `mail.unavailable` | 403 | needs a mail sender; there is none in v1 |
| `checksum_mismatch` | 422 | the bytes did not match the checksum |
| `payload_too_large` | 413 | over the upload ceiling |
| `malformed_request`, `malformed_json` | 400 | a body the Server could not read |
| `opaque.tooLarge` | 422 | `extra` over 2 kB |
| `runner.*` | 403 / 409 | the Runner handshake and lease |

---

## 5. What the Server serves today

Enough for the whole submit-to-verdict path. Point the Client at it with:

```
VITE_APP_API_BASE_URL=http://localhost:8080 npm run dev
```

- `GET /instance`, `GET /account`, `POST /identity/login`
- `GET /permissions`, `/permissions/mine`, `/permissions/mine/anywhere`
- `POST /files`, `GET /files/{id}`, `GET /files/{id}/meta`
- `GET /activities`, `/activities/{idOrSlug}`, `/activities/{id}/series`,
  `/activities/{id}/problems/{slug}`, `/activities/{id}/submissions`,
  `/activities/{id}/submissions/{id}`
- `POST /activities/{id}/problems/{slug}/submissions`
- `GET /manager/activities`, `/manager/activities/summary`,
  `/manager/activities/{idOrSlug}`, `/manager/activities/{id}/series`
- `POST /activities`, `/activities/{id}/series`, `/series/{id}/problems`
- `GET /problems`, `POST /problems`, `POST /problems/{id}/versions`
- `GET /ws` — the socket, sending `submissionStateChanged`

**Two things a screen will notice are missing**: `GET /activities/{id}/results`
and the questions endpoints. Both arrive with the next milestone.

`POST /identity/register` answers **403** on an installation that has not enabled
local registration, which is how one ships. The registration screen already reads
`localRegistrationEnabled` from `/instance`, so nothing here needs to change —
but a screen that ignored it would now be refused rather than quietly succeed.
