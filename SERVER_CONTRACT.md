# Where the Client and the Server disagreed

> Opened 2026-08-08 while implementing `AlgoJudge-Server` against this
> repository's API layer, and finished the same day after pointing the two at
> each other for the first time.
>
> **This is a register, not a report.** Every entry says what differed, where it
> lives on each side, and which side was wrong — because a list of differences
> without a ruling is a list somebody has to work through twice.

> **Read as of 2026-08-08. The body below is frozen — 2026-08-30.**
>
> It is a record of one day, and rewriting its findings would destroy the only
> thing it is good for. What follows are the changes since, each verified today
> and annotated where it belongs rather than merged into the text:
>
> - **The rulings against the Client shipped**, on the day. Entry 2's four
>   manager reads are under `/manager/` in `ManagerApiHttp.ts`; entry 4's
>   `src/api/fake/refuse.ts` exists and `Utils.throwError` is gone.
> - **§12.3 was closed 2026-08-22** and says so in place.
> - **§12.9 is settled**: the canonical Server–Runner contract is
>   `AlgoJudge-Design/specifications/server-runner/SERVER_RUNNER_API.md`.
> - **§12.10's numbers have moved twice** and the three copies now agree.
> - **§12.11 is half closed**: the Client half, not the Server half.
> - **§13's counts are all stale**, and `check:ui` has gated since 2026-08-30.
>
> Everything else in §12 was still open when this banner was written.

## How an entry is classified

| Ruling | What it means |
|---|---|
| **Client** | The Client was wrong. Fixed here. |
| **Server** | The Server was wrong. Fixed there, with `openapi.json` regenerated — CI diffs the served document against the committed one, so a contract change that skips this fails the build. |
| **Both** | Each side had half of it. |
| **Tooling** | Neither implementation was wrong; the thing that was supposed to catch the drift could not. |
| **Undecided** | No document settles it. Recorded, not chosen — these need an owner's decision. |

Nothing below was found by reading alone. The numbers come from
`npm run check:api`, `npm run check:events`, `dotnet test`, and a browser driven
over the two running side by side.

---

## 1. The number nobody had

`check:api` prepended `/api/v1` to every path the Client calls and compared that
against the raw keys of `openapi.json` — which declares
`servers: [{"url": "/api/v1"}]` and lists its paths **relative to it**. Run as it
stood, every single call reported as unserved. It had never produced a usable
answer, which is why the opening sentence of this file's first draft said the
Server served 24 of 95.

Fixed, and run:

| | |
|---|---|
| Call sites in `src/api/http/*Http.ts` | **99** |
| Distinct `(method, path)` pairs | **95** → **98** after entry 2 |
| Served by the Server | **all of them** |
| Response-shape disagreements | **5**, all now closed |
| Endpoints the Client never calls | 22 — the Runner surface and the identity endpoints |

**Ruling: Tooling.** Path coverage was already complete before any of this
work; the check that would have said so was broken. Two fixes: honour
`servers[].url`, and compare the **response schema** against the type argument in
`this.http.request<T>(…)` — because a path that exists is not a path that answers
with the right thing, and entries 2 and 6 hid behind exactly that gap.

A third fix, smaller and worse: the script deduplicated calls by method and path,
so when two files called one path expecting different types it silently kept
whichever `readdirSync` reached second. It was discarding the evidence of the one
blocking divergence in the register.

---

## 2. Three paths carried two shapes — **blocking**

`GET /activities`, `GET /activities/{idOrSlug}` and
`GET /activities/{activityId}/series` were each called by both
`ParticipantApiHttp.ts` and `ManagerApiHttp.ts`, expecting different types.
`Activity` carries `state`, `membership` and `finalScore`; `ManagedActivity`
carries `joinPassword`, `attachmentVisibility`, `seriesCount`,
`participantCount` and three ceilings. One method and path has one response
schema — an OpenAPI document cannot describe otherwise, and a Server picking a
shape from the caller's intent would be deciding disclosure by something other
than permissions.

The Server had already resolved it by serving the manager's reads under
`/manager/`, and those endpoints sat unused.

**Ruling: Client.** Four lines in `ManagerApiHttp.ts`:

| Line | Was | Now |
|---|---|---|
| `:198` `getManagedActivities` | `/manager/activities` | `/manager/activities/summary` |
| `:230` `getActivities` | `/activities` | `/manager/activities` |
| `:234` `getActivity` | `/activities/{idOrSlug}` | `/manager/activities/{idOrSlug}` |
| `:275` `getSeries` | `/activities/{id}/series` | `/manager/activities/{idOrSlug}/series` |

The writes keep their paths — a participant has no write there and nothing
collides. The fake is untouched: it dispatches on method names, not paths.

---

## 3. A round's state was computed where it is stored

Decided 2026-08-08: whether a round is running is **stored** on `Series.IsOpen`,
and `Workers/SeriesScheduler.cs` owns every transition.
`api/seriesState.ts:34-39` still computed it from the dates and read `isOpen`
only in the paused branch, so a round the scheduler had opened read as
`upcoming` until a refetch.

**Ruling: Client.** `seriesState()` now reads the stored flag; the dates say only
*which kind of shut* a shut round is, which is a label rather than a permission.
`maySubmit` mirrors `SeriesGate.MaySubmit` — `isOpen && pausedAt is null` — rather
than asking `seriesState`, so the two keep agreeing if that ever stops being true.

`rankingWindow.ts` needed **no change**: the Server's window is date-driven too
(`ResultsService.WindowOpen`), and the two rules already matched.

Two things fell out of it:

- **`openByClock()` is new.** The fake computed `isOpen` by calling
  `seriesState`, which would have been circular. It now plays the scheduler
  explicitly — decide whether the round is open, then let everything read that
  decision, in the Server's order.
- **The fake's pause disagreed.** The Server closes a round whenever it is paused
  and records `HideProblemsWhilePaused` separately; the fake closed it only when
  hiding was asked for, using `isOpen` as a stand-in for the flag. Under the new
  rule that would have let `getProblem` serve a statement a pause had hidden.
  Separated, on the fake's side, without inventing a wire field.

---

## 4. The fake threw bare `Error` where the contract promises a code

`ApiError.ts` says "the fake throws the same classes, so a screen behaves the
same way against both". It did not: **51 refusals** went through
`Utils.throwError`, which is `new Error(message)` with no `status`, no `code` and
no `fields`. `ConflictError`, `NotFoundError`, `ValidationError` and
`ChecksumMismatchError` were declared and thrown nowhere.

**Ruling: Client.** New `src/api/fake/refuse.ts`; all 51 sites converted;
`Utils.throwError` deleted so nobody reaches for it again.

The codes are **not invented**. They were taken from the 60 refusal strings the
Server actually emits, and a case the Server names no code for gets the class and
no code — a code the Server never sends is a code no screen can rely on.

---

## 5. One wire name carried two payloads, and one of them was unreachable

`seriesChanged` was a member of both the participant and the manager record in
`WebSocketEvents.ts` (`:26` and `:40`), and routing at `:177-179` is an
`if / else if` chain testing the participant first. **The manager dispatcher
could never receive it.** `ManagerActivityPage.tsx:51` was unreachable code.

The two payloads genuinely differ — the participant's requires `series` and
`change`, the manager's has neither and may carry `deletedId` — and the envelope
has no scope member, so nothing on the wire could tell them apart. Had the
manager shape ever been sent, it would have landed on participant listeners that
dereference `evt.data.series.id` unguarded in three places.

The compile-time guard at `:9-15` catches a name missing from a record and is
structurally blind to a name present in **two**.

**Ruling: Both.** The Server's constant now reads `managerSeriesChanged`; the
Client splits the records. One wire name, one shape — the rule entry 2 applies to
paths. `check:events` gained two cases: that the manager's event reaches its own
dispatcher, and that it does **not** also reach the participant's.

While there: `ScopedManagerEventDispatcher` had no overload for
`instanceChanged`, which made it unreachable through a scoped dispatcher. The
same defect, one line, found because the compiler pointed at it.

---

## 6. Approving a Runner answered the registration's shape

`POST /runners/{id}/approve` returned `RunnerRegisteredDto` —
`{runnerId, fingerprint, state}`, what a Runner is told about itself — while
`ManagerApiHttp.approveRunner` expects a `ManagedRunner` to put back into the
table. Its two siblings on the same route, `revoke` and `tags`, always answered
the whole row; `approve` lived in a different controller and drifted.

**Ruling: Server.** Moved beside its siblings, uses the same projection,
`openapi.json` regenerated. No test caught it because every test checked that the
call succeeded and none checked what came back — there is now one that does.

---

## 7. Absent was written as `null`

The activities list showed **`Wynik: / null`**.

`ActivitiesPage.tsx:126` guards with `finalScore !== undefined`. The Server sent
`"finalScore": null`, and `null !== undefined`, so the guard passed and the
template printed the word at a competitor. The cause was systemic: no
`DefaultIgnoreCondition` anywhere, so **every** unfilled optional field arrived as
an explicit `null`, across the whole API.

**Ruling: Server.** `WhenWritingNull` on both halves of the surface — the
controllers and the minimal-API endpoints `MapIdentityApi` adds. Three tests
asserted `JsonValueKind.Null` on fields that are now omitted; they were rewritten
to assert **absence**, because absence is the contract.

Found by opening a screen. Nothing else in either repository could have.

---

## 8. The terms of service needed an account to read

The footer links four legal documents from every signed-out screen.
`GET /files/{id}` answered **401** to all of them — including the terms the
registration form asks acceptance of.

The read rule was already right: `FileService.CanReadThroughAsync` returns true
for an instance document and the logo, "readable by anybody, signed in or not".
`[Authorize]` on the controller refused the caller **before the rule ran**.

**Ruling: Server.** `[AllowAnonymous]` on the two reads — the rule decides, not
the attribute. Nothing is loosened: an anonymous caller now reaches the rule,
which answers `false` for everything else and becomes a 404.

Beside it, a comment promising `private` "unless the answer does not depend on
who is asking, which is only true of an instance document and the logo" sat above
code that always wrote `private`. The code now does what the comment says.

---

## 9. Smaller closures

| # | What | Ruling |
|---|---|---|
| 9.1 | `ManagedSeriesDto` never reported `hideProblemsWhilePaused`, so a manager who reloaded could not see whether their pause had hidden the statements | **Server** — field added, document regenerated |
| 9.2 | `SeriesScheduler.OpenAsync` required `StartDate != null` while `ManagerWriteService.Reconcile` treats a round with no start as started — two answers to one question, and a dateless round that closed could never reopen | **Server** |
| 9.3 | `SeriesPanel.tsx` showed only the pinned version, so a manager could not tell "v2 is the newest" from "v2 while the library is at v3" | **Client** — shows `V2 / V3` when they part |
| 9.4 | The Server's image had no healthcheck, so `docker compose --wait` returned while the host was still booting; its own CI works around it by polling | **Server** |
| 9.5 | `nginx.conf` had no `client_max_body_size`, so the 1 MB default would refuse a submission with an HTML body the Client cannot read as `problem+json` | **Client** |
| 9.6 | `Cors:AllowedOrigins` named only `https://localhost:5173` — the one shape nobody runs, since `npm run dev` serves plain HTTP | **Server** |
| 9.7 | The config chain stated `kind`/`memoryMb`/`scoring.groups` in the fixtures against the specification's `format`/`memoryKib`/`groups`, bridged by hand in `ManagerApiFake` | **Client** — a chain whose layers override one another must name the same fields. *Both names are history: memory is `memoryBytes` everywhere since 2026-08-09 (D-15).* |
| 9.8 | One image per installation, configured at start, was decided 2026-08-03 and unimplemented; `ApiFactory` read `import.meta.env`, which Vite inlines at build | **Client** — now written into `index.html` by the container's entrypoint |

---

## 10. What the two worlds did not share

`Database/Seeder.cs` and `fixtures/world.ts` had **nothing in common**: one
activity against thirteen, **no submissions against fifty-eight attempts**, not
one shared slug, English against Polish. A screen fed by each could not be told
apart from a screen that was broken, which made every comparison meaningless.

**Ruling: Server**, as the side with no data. `Database/ParityWorld.cs` seeds
`AMMPZ-2019` and `PROG-1-LA` from `world.ts` — slugs, names, round order,
assignment letters, dates and every attempt. Verified against a fresh database:
**49 submissions, 50 jobs, 43 results, 18 assignments, 9 library versions**, and
boards that match.

Deliberately not ported: the forty-five-second countdown, the unsupported
activity and problem types, the pagination fillers, the archived activity. They
exercise Client-side fallbacks that need no Server. `DEV-2026` stays as the
fixture the Server's own suite is written against.

**One known difference, decided rather than discovered.** The fake's contest is
fought by five *teams*, each sending what one of its members typed; the Server
has no team, and a contestant is a grant. Decided 2026-08-08 to seed a team as an
ordinary account named after the team. The board matches exactly; what is given
up is knowing which member sent a given submission, and `world.ts`'s one account
that is a team in the contest and a person on the course had to become two.

---

## 11. What could not catch drift, and now can

Two catalogues existed and nothing compared them: the Server declared its event
names in `EventTypes`, the Client in three records, and they were agreed by hand.
Fourteen names the Server declared were never sent, one name it did send
(`ping`) was declared nowhere, and one name meant two payloads. None of it could
fail a build.

**Ruling: Tooling.** `AlgoJudge-Server/events.json` is committed beside
`openapi.json` and for the same reason. `EventCatalogueTests` fails if it drifts
from `EventTypes`; `npm run check:events -- ../AlgoJudge-Server/events.json`
diffs the Client's records against it. Both were confirmed to **fail** on a
deliberately falsified catalogue, naming the missing and the extra.

`ping` is described as a transport frame rather than an event: nothing subscribes
to it, and the Client drops any type it does not know.

Neither this nor `check:api` can be a gate in the Client's own CI, which has no
Server repository to read. That is a limit, not an oversight.

---

## 12. Undecided — these need an owner

Nothing below was chosen. Each is recorded with what it would cost either way.

| # | Question | Why it is not mine to settle |
|---|---|---|
| 12.1 | **`late` on `seriesChanged`.** The Server marks an announcement more than two minutes late; the Client does not declare the field and drops it. Suppress the animation, or say it? | It is a product decision about what a competitor is told |
| 12.2 | **Fourteen declared events are never emitted.** Live listeners wait on frames no code path produces. A schedule, or a surface to withdraw? | Either answer is a contract change |
| 12.3 | ~~**`ProblemDetail.limits` is declared and unfillable.**~~ **Closed 2026-08-22.** The field is deleted on both sides. The Server could never populate it without reading the opaque config, and it never did: the badges rendered against the fake alone. Limits reach the problem page from the assignment's `config`, which now travels to a participant — see `components/problem/limits.ts` and `docs/specs/PARTICIPANT_SCREENS.md` | — |
| 12.4 | **`MaxAttachments` is enforced nowhere.** Stored, shown in the panel, editable — and the submit endpoint takes exactly one file, so it governs nothing | Either the endpoint takes several, or the setting is about something else |
| 12.5 | **`GET /manager/activities` answers a participant 200 with an empty list**, where every other manager read answers 403. Not a leak; an inconsistency in how refusal is expressed | Changing an authorization surface |
| 12.6 | **Creating a round leaves it shut** until the scheduler opens it, while editing one opens it at once. Deliberate — a round created with a past start should be announced late — but the asymmetry is real, and a fresh round is unusable for up to fifteen seconds | The reason for the current behaviour is sound; the cost is a manager waiting |
| 12.7 | **`SeriesProblem.Config` may tighten a limit — may it raise one?** In no document | Never written down |
| 12.8 | **One origin or two?** This work runs two, with CORS. One origin behind a proxy needs a `location /api/` block, and settles the cookie's `SameSite` and whether `client_max_body_size` governs uploads at all | The deployment shape is the owner's |
| 12.9 | ~~**The Server–Runner protocol exists twice** — `docs/protocols/SERVER_RUNNER_API.md` and `AlgoJudge-Design/proposals/Server-Runner-api.md` — with drift, and nothing says which is canonical~~ **Settled.** The contract is `AlgoJudge-Design/specifications/server-runner/SERVER_RUNNER_API.md`, **v1.1**, `Accepted` 2026-08-08 and amended three times — 2026-08-09 (§9, unavailability), 2026-08-22 (§5, §6) and 2026-08-24 (§3, §5). Both files named here are history and describe paths this Server never served; `.claude/rules/documentation.md` says which to cite | — |
| 12.10 | ~~**`docs/specs/PERMISSIONS.md` is one key short.** The Client and the Server hold the identical 47; the document has 46 and never gained `instance:update`.~~ **The count half is closed; the status half is not.** Measured 2026-08-30 with `python scripts/check-permissions.py` from the workspace root: **52** permissions and a manager template of **32**, identical in the Server, the Client's fake and the specification. It drifted twice more before that — corrected 2026-08-10 to 49, and again 2026-08-25 to 52 — and it is still marked `Draft awaiting approval` | A document status is not mine to promote |
| 12.11 | **Three documents describe reversed code.** `AlgoJudge-Server/CLAUDE.md` on `EvaluationJob`, `int` keys and `Result` doubling as the job record; ~~`AlgoJudge-Client/CLAUDE.md` and `DECISIONS_AND_OPEN_QUESTIONS.md:1510` on "seven" opaque values against the specification's five~~. **Half closed — checked 2026-08-30.** The two Client-side documents no longer say it. **The Server half stands**: `AlgoJudge-Server/CLAUDE.md:60` still reads *"`EvaluationJob` is deferred as an entity"* and `:6` still lists the model as "activities, tasks, submissions". Being corrected separately | Proposals prepared; no status promoted |
| 12.12 | **Ten decisions of 2026-08-08 live only in code and commit messages.** `DECISIONS_AND_OPEN_QUESTIONS.md` was not edited that day | Rows drafted, waiting to be entered |

---

## 13. What now runs

| Check | Where | Covers |
|---|---|---|
| `npm run check:api -- ../AlgoJudge-Server/openapi.json` | Client | every path **and response shape** the Client asks for |
| `npm run check:events -- ../AlgoJudge-Server/events.json` | Client | the two event catalogues agree, and `ping` is dropped |
| `dotnet test` | Server | **666** cases against real PostgreSQL 18, including the event catalogue. 57 on 2026-08-08; re-counted 2026-08-30 with `dotnet test --list-tests`, over 85 test files |
| `npm run check:e2e` | Client | submit to verdict, through both halves and the socket |

The last one is the only thing in either repository that can see the two
disagreeing. A manager builds an activity and a problem and publishes a version
by reference; a participant submits through the screen; a Runner with no sandbox
claims the job and reports; and the verdict reaches the screen over the socket
without a reload. It needs the full stack:

```
docker compose -f example-full-stack-docker-compose.yaml up -d --build --wait
npm run check:e2e
```

~~It is not in CI, and neither is `check:ui`, for the same stated reason: a Server,
a database and a browser.~~

**Half of that stopped being true — 2026-08-18, then 2026-08-30.** `check:ui` has
run in CI since 2026-08-18, in the `browser-checks` job, and **gates a merge
since 2026-08-30**: Playwright brings its own browser and starts the dev server
against the fake, so the reason it was out never applied to it once it moved.
`check:e2e` is still outside CI, and the stated reason still holds for it — it
wants a Server and a database that are already up.
