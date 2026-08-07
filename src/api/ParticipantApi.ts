import { Event } from "./Event";
import { StatementRef } from "./FileApi";

/**
 * Models for the participant-facing part of the product.
 *
 * They mirror the Server entities in
 * `AlgoJudge-Server/AlgoJudge.Server/Database/Models/`, reduced to what a
 * participant may see. Two fields are deliberately `unknown` — a submission's
 * evaluation `detail` and a result's `extra`. Both are documents the Runner
 * produces and the Server stores without parsing, rendered or reckoned with here
 * by whatever the problem type calls for. Typing them would put back into the
 * Client exactly the coupling the Server was freed from.
 *
 * The ranking payload used to be a third. It is not one any more: the Server
 * sends results and the board is computed here, so the feed has one shape for
 * every ranking type and there is nothing left to guess at.
 *
 * Both are **optional, and absent means none** — `docs/specs/OPAQUE_DOCUMENTS.md`
 * carries the rule and the ceilings the Server holds them to.
 *
 * Every identifier is a string holding a UUID. A `slug` is a human-readable
 * alias used in URLs and never a reference: nothing points at anything by slug.
 */

/** One page of a collection. Paging and filtering happen on the Server. */
export interface Page<T> {
    items: T[],
    total: number,
    page: number,
    pageSize: number,
}


/**
 * How a person is written wherever one is shown.
 *
 * First and last name when they were given, the **login** otherwise — computed
 * by the Server, so every screen says the same thing about the same person. A
 * contest account is `contest-001` everywhere; somebody who gave a name is that
 * name everywhere, including the ranking.
 *
 * This is the only identity a participant sees of another participant, so an
 * installation that wants an anonymous scoreboard issues opaque logins and
 * leaves the name fields empty — the choice sits with whoever creates accounts,
 * not with the model.
 */
export type DisplayName = string;

export type ActivityState = "upcoming" | "ongoing" | "finished";

/**
 * Who may see scores — and, by the same answer, who may see the ranking.
 *
 * One setting rather than two. There used to be a `modules.ranking` switch
 * beside it, which is two answers to one question: a board switched on where
 * nobody may see a score shows nothing, and a board switched off where everybody
 * may see them withholds what is already public.
 *
 * - `everyone` — the whole board, with places.
 * - `participantOnly` — the reader's own row, and **no place**: a standing among
 *   people whose scores they may not see is not a standing.
 * - `managersOnly` — no ranking screen at all.
 */
export type ScoreVisibility = "everyone" | "participantOnly" | "managersOnly";

/**
 * How the signed-in user relates to the activity. The list also shows activities
 * that may be joined, so this is not always "enrolled".
 */
export type ActivityMembership = "enrolled" | "invited" | "open";

/**
 * How somebody gets in without a manager doing it for them.
 *
 * A manager may always enrol somebody by hand — that is what a grant is — so
 * these are the three answers to *self*-enrolment and nothing else.
 */
export type JoinPolicy =
    /** No self-enrolment, and not listed to anybody who is not already in it. */
    | "closed"
    /** Self-enrolment on giving the activity's join password. */
    | "password"
    /** Self-enrolment, no password. */
    | "open";

/**
 * A document an activity publishes, written by whoever runs it.
 *
 * The same arrangement the instance's documents got, for the same reason: text
 * an author owns, in the `content.md` format the Client already renders, stored
 * as a file and referred to by id. An activity is simply a second owner.
 */
export type ActivityDocumentKind =
    /** What somebody **not enrolled** reads on the activity's page. */
    | "welcome"
    /** What a participant reads there instead — their landing page. */
    | "home"
    /** The regulations, and what the enrolment form asks acceptance of. */
    | "rules";

/**
 * Where one activity document lives, and what a screen needs before it has the
 * text.
 *
 * There is one per kind **per language**, as `content-<language>.md` is to a
 * statement, and the one with no `language` is the fallback. The references ride
 * on the activity because the activity is loaded once for the whole shell
 * anyway — the same bargain `InstanceInfo` makes, and for the same reason: a
 * reference is small and read on every arrival, a document is neither.
 *
 * There is no `isTemplate` here. An activity ships nothing: what it publishes,
 * somebody wrote.
 */
export interface ActivityDocumentRef {
    kind: ActivityDocumentKind,
    /** BCP-47 subtag. Absent on the one written first. */
    language?: string,
    /** Absent on the front pages: their heading is inside the document. */
    title?: string,
    /** When this revision came into force. Publishing adds one; it replaces none. */
    validFrom?: string,
    /** The stored text, read with `fileApi.getText`. */
    fileId: string,
    sha256: string,
    sizeBytes: number,
}

export interface Activity {
    id: string,
    /** Alias used in URLs, for example `AMMPZ-2019`. */
    slug: string,
    name: string,
    /** Type discriminator, `name@version`. Selects the layout renderer. */
    type: string,
    /** Selects the ranking renderer. Independent of `type`. */
    rankingType: string,
    /** IANA zone the activity's clock is displayed in, e.g. `Europe/Warsaw`. */
    timeZone: string,
    state: ActivityState,
    membership: ActivityMembership,
    /**
     * How somebody not enrolled may get in. Carried to the participant because
     * the activity's own page draws the enrolment form from it — the Server
     * still decides, and refuses whatever the form sends if it is wrong.
     */
    joinPolicy: JoinPolicy,
    /**
     * Who sees scores, which is also what decides whether the ranking is
     * offered. Carried to the participant so the navigation can be drawn without
     * a second field that could disagree with it.
     */
    scoreVisibility: ScoreVisibility,
    /** Absent when the activity is not time-limited. */
    startDate?: string,
    endDate?: string,
    /**
     * Whether a finished round keeps its problems readable. Carried so the
     * screen can say **why** a round shows none, not so it can decide: the
     * Server withholds them.
     */
    hideEndedSeriesProblems: boolean,
    /**
     * A reference to every document this activity currently publishes, one per
     * kind per language.
     *
     * **Every one of them is optional** and an empty list is a legitimate
     * answer. Which documents exist is read from here and nowhere else: the
     * rules used to be announced by `modules.rules` as well, which is two
     * answers to one question and they disagree the moment one is withdrawn.
     */
    documents: ActivityDocumentRef[],
    /**
     * Which sidebar modules the activity manager enabled.
     *
     * Questions alone: the ranking left this list because `scoreVisibility`
     * already answers it, and the rules left it because whether there are rules
     * is whether one is published.
     */
    modules: {
        questions: boolean,
    },
    /** Present once the activity has finished. */
    finalScore?: number,
    maxScore?: number,
    /** Free display metadata, e.g. `Prowadzący: Jan Kowalski`. Never queried. */
    props: { key: string, value: string }[],
}

/**
 * What the enrolment form collected.
 *
 * Both fields are conditional on the activity: the password only under
 * `joinPolicy: "password"`, the acceptance only where there are rules to accept.
 * The Server is told what was given and decides; sending neither where both were
 * required is refused there, not here.
 */
export interface EnrolInput {
    /** The activity's join password, as typed or as it arrived in the link. */
    password?: string,
    /** Recorded with the enrolment, so it stays answerable who accepted what. */
    acceptedRules?: boolean,
}

export interface ActivityFilter {
    page?: number,
    pageSize?: number,
    /** Empty or absent means every state. */
    states?: ActivityState[],
    /** Matched against `Activity.type` before the `@`. */
    types?: string[],
}

export type ProblemStatus = "untouched" | "attempted" | "partial" | "solved";

/**
 * A group of problems: a round in a contest, a week or a class in a course. The
 * label comes from the activity type renderer, not from the data.
 */
export interface Series {
    id: string,
    slug: string,
    name: string,
    startDate?: string,
    endDate?: string,
    /**
     * Whether it is running now.
     *
     * The **Server** sets it, from the clock: a scheduler opens a series when its
     * start passes and closes it when its end does, and announces both. No
     * screen decides this by looking at a date.
     *
     * **Before** it opens, `problems` is absent — not an empty array: a series
     * that has not started does not disclose what it holds. **After** it ends
     * they stay: a round that is over is readable for ever and simply accepts
     * nothing more. `isOpen` is false in both cases, which is why what may be
     * read and what may be sent are worked out by `api/seriesState.ts` rather
     * than from this field alone.
     */
    isOpen: boolean,
    /**
     * Since when a manager has it stopped. Absent means it is not paused.
     *
     * A pause takes no submission and stops the countdown. Whether it also takes
     * the statements away is the manager's decision at the moment of pausing,
     * and it is expressed by `isOpen` going false — there is no third field,
     * because "may I see it" is what `isOpen` has always answered.
     */
    pausedAt?: string,
    /**
     * When this round's standings may be seen. Absent `from` means the round's
     * own start; absent `to` means for ever.
     *
     * Per round rather than per activity: an organiser publishes the first
     * round's board while the second is still being fought.
     */
    rankingVisibleFrom?: string,
    rankingVisibleTo?: string,
    /**
     * How many problems the series holds, when the manager allows that to be
     * shown before it opens. Absent means even the count is withheld.
     */
    problemCount?: number,
    problems?: ProblemSummary[],
}

export interface ProblemSummary {
    id: string,
    /** Label shown to the participant and used in the URL. Unique in the activity. */
    slug: string,
    name: string,
    /** The signed-in participant's own status, not a global one. */
    status: ProblemStatus,
    /** Best score that counts, under the activity's ranking rules. */
    bestScore?: number,
    maxScore?: number,
    attempts: number,
}

export interface ProblemLimits {
    timeMs: number,
    memoryMb: number,
}

export interface ProblemSample {
    input: string,
    output: string,
    explanation?: string,
}

export interface Attachment {
    name: string,
    mimeType: string,
    sizeBytes: number,
    url: string,
    /** SHA-256 of the bytes. Names the file: equal checksums are the same file. */
    sha256: string,
}

/** A field the submit form must render, declared by the problem type. */
export interface SubmitField {
    kind: "file" | "code",
    name: string,
    label: string,
    /** Accepted extensions for a file field, e.g. `[".cpp", ".zip"]`. */
    accept?: string[],
}

export interface ProblemDetail {
    id: string,
    slug: string,
    name: string,
    /** Problem type discriminator, `name@version`. Selects every renderer below. */
    type: string,
    seriesId: string,
    /**
     * The statement, as **references**: `content.md`, its translations, and a
     * `content.pdf` where the problem ships one.
     *
     * The text is fetched with `fileApi.getText`, exactly as it was uploaded
     * with `fileApi.upload` when the version was published. It used to arrive
     * inline here while being published by reference, which is the same bytes
     * on two roads — and the read road had no `sha256`, so the one file on the
     * page that could not be verified was the one the reader came for.
     *
     * The one with no `language` is the default and the fallback; a missing
     * translation is a fallback, never an error.
     */
    statements: StatementRef[],
    /** Everything scoped to participants. Well-known `content.*` files excluded. */
    attachments: Attachment[],
    /** Absent when the manager chose not to show them. */
    limits?: ProblemLimits,
    samples?: ProblemSample[],
    /**
     * The signed-in participant's own standing on this problem, the same as the
     * list carries. Repeated here so the statement screen can show it and keep
     * it current without loading the whole series.
     */
    status: ProblemStatus,
    bestScore?: number,
    maxScore?: number,
    attempts: number,
    /** Configured on the assignment, so the same problem may differ between series. */
    languages: string[],
    maxUploadBytes: number,
    submitFields: SubmitField[],
    /** Absent means unlimited. */
    submissionsLeft?: number,
}

export type JobState = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface SubmissionSummary {
    id: string,
    problemId: string,
    problemSlug: string,
    problemName: string,
    seriesId: string,
    submittedAt: string,
    language?: string,
    state: JobState,
    score?: number,
    maxScore?: number,
    /** Short label from the Runner, e.g. `Accepted`. Meaning is the type's business. */
    verdict?: string,
}

/** One attempt at evaluating a submission. A rejudge adds an attempt. */
export interface EvaluationAttempt {
    id: string,
    attempt: number,
    startedAt: string,
    finishedAt?: string,
    state: JobState,
    verdict?: string,
    score?: number,
}

export interface SubmissionFile {
    name: string,
    language?: string,
}

export interface SubmissionDetail extends SubmissionSummary {
    /**
     * The problem's type discriminator. Needed here because the evaluation
     * document is rendered by the type, and the detail view is where it is
     * drawn — without it the renderer would have to be found by fetching the
     * problem again.
     */
    problemType: string,
    authorName: string,
    /** Newest first. */
    attempts: EvaluationAttempt[],
    /**
     * The Runner's result document, rendered by the problem type's renderer.
     *
     * **Absent until something has judged it.** A queued or running submission
     * has no result, and an empty document standing in for one says "a result
     * with nothing in it" where the truth is "nothing has looked at this yet".
     * Opaque to the Server; an object or absent — see
     * `docs/specs/OPAQUE_DOCUMENTS.md`.
     */
    detail?: unknown,
    /** Present only when the activity's log visibility permits it. */
    log?: string,
    files: SubmissionFile[],
}

export interface SubmissionFilter {
    page?: number,
    pageSize?: number,
    problemId?: string,
    seriesId?: string,
    states?: JobState[],
}

/** What the participant sends. Which fields are set is decided by the problem type. */
export interface SubmitPayload {
    language?: string,
    /** Pasted source, when the participant used the editor. */
    code?: string,
    /** Uploaded file, when they used the file field instead. Never both. */
    file?: File,
    /**
     * SHA-256 of what is being sent — the file's bytes, or the pasted source
     * encoded as UTF-8. The Server recomputes it and refuses a mismatch.
     */
    sha256?: string,
}

/* ── Results, from which every ranking is computed ─────────────────────────── */

/**
 * Somebody with a row on the board.
 *
 * A **contestant**, not a user: an ICPC row is a team and three people submit
 * for it. Who typed a particular solution is the submissions screen's business
 * and is not disclosed here.
 */
export interface Contestant {
    id: string,
    name: string,
}

/** A problem as a board's column: what it is called and what it is worth. */
export interface ResultProblem {
    id: string,
    /** Unique across the whole activity, which is why cells key on it. */
    slug: string,
    name: string,
    maxPoints: number,
}

/**
 * One round the results cover.
 *
 * Carried even where nobody has attempted anything in it, because a board's
 * columns are the problems that exist, not the problems somebody has solved.
 */
export interface ResultSeries {
    id: string,
    name: string,
    /** What a penalty minute is counted from. Absent in an untimed activity. */
    startDate?: string,
    /**
     * The board is frozen right now: outcomes after the freeze arrive withheld.
     *
     * Renderers mark a frozen round's columns, because a combined board that
     * mixed settled and withheld columns without saying so would read as a
     * standing when it is not one.
     */
    frozen: boolean,
    /** When the organiser said it comes back. Absent means they did not say. */
    revealAt?: string,
    problems: ResultProblem[],
}

/**
 * One submission, reduced to what a board needs.
 *
 * Deliberately not `SubmissionSummary`: the verdict text, the language and the
 * Runner's per-test document say more about somebody's solution than a
 * scoreboard has any business publishing, and the per-test document would also
 * be most of the payload.
 */
export interface ContestantResult {
    id: string,
    contestantId: string,
    seriesId: string,
    problemId: string,
    problemSlug: string,
    submittedAt: string,
    /**
     * Absent while `frozen`, and while nothing has judged it yet. Absent is not
     * zero: a board must not score what it has not been told.
     */
    points?: number,
    /** Absent alongside `points`, for the same two reasons. */
    state?: JobState,
    /**
     * Whatever else the problem type wants a board to have — cycles used, peak
     * memory, a domain measure. Filled by the Runner, stored by the Server
     * without being read, shaped by the problem type.
     *
     * **Public by construction.** Everyone who may see the board is sent this,
     * so nothing goes in it that is not meant to be seen. It is not a way back
     * in for the Runner's per-test document, which is kept out of the feed both
     * for its size and because per-test rows of everybody's submissions publish
     * how other people's solutions behave — that stays on the submission, with
     * its own access rule.
     *
     * Untyped for the same reason `SubmissionDetail.detail` is: a ranking type
     * that needs a metric must not need a Server release to carry it. Whoever
     * reads it guards the shape, as the result renderers already do.
     *
     * An object or absent. **Kept small** — it rides in a list, so it is
     * multiplied by every submission of every contestant, which is why its
     * ceiling is a hundredth of the result document's. See
     * `docs/specs/OPAQUE_DOCUMENTS.md`.
     */
    extra?: unknown,
    /**
     * Its outcome is withheld: that it happened is all that is disclosed.
     *
     * This is what a freeze looks like on the wire. Omitting the result instead
     * would leave a board unable to tell "did not try" from "tried, and you may
     * not know yet" — and the second is what the `?` cell of an ICPC board is.
     */
    frozen?: boolean,
}

/** Everything a board is computed from. */
export interface ActivityResults {
    /** In the order the rounds run. */
    series: ResultSeries[],
    /** Everyone with a row, including those who have sent nothing. */
    contestants: Contestant[],
    results: ContestantResult[],
    /** Which contestant the reader is, where they are one. */
    me?: string,
}

export type QuestionKind = "question" | "announcement";

export interface QuestionAnswer {
    body: string,
    authorName: DisplayName,
    answeredAt: string,
}

export interface Question {
    id: string,
    kind: QuestionKind,
    topic: string,
    body: string,
    authorName: DisplayName,
    createdAt: string,
    /** Set when the question concerns one series rather than the whole activity. */
    seriesId?: string,
    seriesName?: string,
    /** Set when it concerns one problem. */
    problemId?: string,
    problemSlug?: string,
    problemName?: string,
    /** A question reaches every participant only once a manager publishes it. */
    isPublished: boolean,
    isRead: boolean,
    answer?: QuestionAnswer,
}

/**
 * What a question list may be ordered by.
 *
 * Three, because those are the three a reader looks for: when it was asked, and
 * what it is about. Topic and author were sortable in the mock-up and are not
 * here — nobody looks for a question by the first letter of its subject.
 */
export type QuestionSort = "createdAt" | "series" | "problem";

export interface QuestionFilter {
    page?: number,
    pageSize?: number,
    search?: string,
    kind?: QuestionKind,
    /** The mock-up called this "group"; a group **is** a series. */
    seriesId?: string,
    problemId?: string,
    /** Defaults to `createdAt`. */
    sortBy?: QuestionSort,
    /** Defaults to `desc`, so the newest question is the first one. */
    order?: "asc" | "desc",
}

/**
 * A question is asked about **one** of three things, and the pair below says
 * which: both absent is the activity at large, `seriesId` alone is a series,
 * `problemId` is one problem — and its series is filled in from it.
 */
export interface AskQuestionInput {
    topic: string,
    body: string,
    problemId?: string,
    seriesId?: string,
}

export type ParticipantEventType =
    | "activityCreated"
    | "activityUpdated"
    | "activityDeleted"
    | "activityTimesChanged"
    | "seriesChanged"
    | "problemStatusChanged"
    | "submissionStateChanged"
    | "rankingChanged"
    | "questionAnswered"
    | "questionPublished"
    | "announcementPublished";

export type ParticipantEvent<T extends ParticipantEventType, V> = Event<T, V>;

export type ActivityCreatedEvent = ParticipantEvent<"activityCreated", {
    activity: Activity;
}>;

export type ActivityUpdatedEvent = ParticipantEvent<"activityUpdated", {
    activity: Activity;
}>;

export type ActivityDeletedEvent = ParticipantEvent<"activityDeleted", {
    activityId: string;
}>;

/** A manager moved a start or end time while the activity is being watched. */
export type ActivityTimesChangedEvent = ParticipantEvent<"activityTimesChanged", {
    activityId: string;
    startDate?: string;
    endDate?: string;
}>;

/**
 * Something happened to a series: it opened, ended, was stopped, started again,
 * or was moved.
 *
 * One event rather than five, because all five carry the same thing — the whole
 * series, so a screen redraws from what arrived rather than patching it — and
 * differ only in the sentence to say about it. `opened` carries the problems
 * that were withheld until then, as it always did.
 */
export type SeriesChangedEvent = ParticipantEvent<"seriesChanged", {
    activityId: string;
    series: Series;
    change: SeriesChange;
}>;

export type SeriesChange =
    /** Its start passed, or a manager lifted a pause that had hidden it. */
    | "opened"
    /** Its end passed. */
    | "closed"
    /** A manager stopped it. */
    | "paused"
    /** A manager started it again. */
    | "resumed"
    /** Its times moved. */
    | "rescheduled";

export type ProblemStatusChangedEvent = ParticipantEvent<"problemStatusChanged", {
    activityId: string;
    problem: ProblemSummary;
}>;

export type SubmissionStateChangedEvent = ParticipantEvent<"submissionStateChanged", {
    activityId: string;
    submission: SubmissionSummary;
}>;

/**
 * What happened to the results, on the same footing as `SeriesChange`.
 *
 * One event with a discriminator rather than three types carrying the same
 * payload: every listener wants the same thing, which is to end up drawing the
 * right board.
 */
export type RankingChange =
    /** A submission was judged. `result` carries it, already filtered. */
    | "result"
    /** A freeze ended. Everything it withheld is now readable. */
    | "unfrozen"
    /** A round's ranking window opened. There is a board that was not there. */
    | "windowOpened";

export type RankingChangedEvent = ParticipantEvent<"rankingChanged", {
    activityId: string;
    change: RankingChange;
    /** Which round it concerns, where it concerns one. */
    seriesId?: string;
    /**
     * The result itself, on `change: "result"` — pushed rather than fetched
     * because it is small and a scoreboard is watched.
     *
     * A screen may merge it, but **the feed remains the source of state**: a
     * dropped message would otherwise leave a board quietly wrong with nothing
     * to notice it by, so a reconnection refetches. The other two changes carry
     * nothing precisely because they mean "what you hold is now incomplete".
     */
    result?: ContestantResult;
}>;

export type QuestionAnsweredEvent = ParticipantEvent<"questionAnswered", {
    activityId: string;
    question: Question;
}>;

export type QuestionPublishedEvent = ParticipantEvent<"questionPublished", {
    activityId: string;
    question: Question;
}>;

export type AnnouncementPublishedEvent = ParticipantEvent<"announcementPublished", {
    activityId: string;
    question: Question;
}>;

export interface ParticipantEventDispatcher {
    addEventListener(type: "activityCreated", listener: (evt: ActivityCreatedEvent) => void, signal: AbortSignal): void;
    addEventListener(type: "activityUpdated", listener: (evt: ActivityUpdatedEvent) => void, signal: AbortSignal): void;
    addEventListener(type: "activityDeleted", listener: (evt: ActivityDeletedEvent) => void, signal: AbortSignal): void;
    addEventListener(type: "activityTimesChanged", listener: (evt: ActivityTimesChangedEvent) => void, signal: AbortSignal): void;
    addEventListener(type: "seriesChanged", listener: (evt: SeriesChangedEvent) => void, signal: AbortSignal): void;
    addEventListener(type: "problemStatusChanged", listener: (evt: ProblemStatusChangedEvent) => void, signal: AbortSignal): void;
    addEventListener(type: "submissionStateChanged", listener: (evt: SubmissionStateChangedEvent) => void, signal: AbortSignal): void;
    addEventListener(type: "rankingChanged", listener: (evt: RankingChangedEvent) => void, signal: AbortSignal): void;
    addEventListener(type: "questionAnswered", listener: (evt: QuestionAnsweredEvent) => void, signal: AbortSignal): void;
    addEventListener(type: "questionPublished", listener: (evt: QuestionPublishedEvent) => void, signal: AbortSignal): void;
    addEventListener(type: "announcementPublished", listener: (evt: AnnouncementPublishedEvent) => void, signal: AbortSignal): void;
    addEventListener<T extends ParticipantEventType, V>(type: T, listener: (evt: ParticipantEvent<T, V>) => void, signal: AbortSignal): void;
}

export interface ParticipantApi {
    readonly eventDispatcher: ParticipantEventDispatcher;

    /**
     * The activities this reader may see.
     *
     * **The Server decides what that means**, and the Client never filters on
     * `joinPolicy` or `unlisted` itself: an activity that is closed, or hidden
     * from people who are not in it, is simply not in the answer. A rule the
     * Client enforced would be a rule anybody could turn off.
     */
    getActivities(filter: ActivityFilter, signal: AbortSignal): Promise<Page<Activity>>;
    /**
     * Accepts an id or a slug, as the API does.
     *
     * Answers for somebody **not enrolled** as well, with what the activity's
     * own page needs to draw itself for them: identity, dates, `joinPolicy` and
     * the `welcome` and `rules` references. Not the series, and not the
     * problems — those belong to being in it.
     */
    getActivity(idOrSlug: string, signal: AbortSignal): Promise<Activity>;

    /**
     * Puts the signed-in reader into the activity themselves.
     *
     * Answers with the activity as they now see it, so the page redraws from
     * what came back rather than asking again. A wrong or missing password is
     * refused by the Server; the Client sends what the form collected and does
     * not check it.
     */
    enroll(idOrSlug: string, input: EnrolInput, signal: AbortSignal): Promise<Activity>;

    getSeries(activityId: string, signal: AbortSignal): Promise<Series[]>;
    getProblem(activityId: string, problemSlug: string, signal: AbortSignal): Promise<ProblemDetail>;

    getSubmissions(activityId: string, filter: SubmissionFilter, signal: AbortSignal): Promise<Page<SubmissionSummary>>;
    getSubmission(activityId: string, submissionId: string, signal: AbortSignal): Promise<SubmissionDetail>;
    getSubmissionFile(activityId: string, submissionId: string, name: string, signal: AbortSignal): Promise<string>;
    submit(activityId: string, problemSlug: string, payload: SubmitPayload, signal: AbortSignal): Promise<SubmissionSummary>;

    /**
     * Every result the reader may see, from which a board is computed.
     *
     * The Server sends **results, not a ranking**: which board they add up to is
     * the activity's `rankingType`, and that is a renderer's business — a Server
     * computing an ICPC penalty would be encoding the semantics of one ranking
     * type, which is the thing it is not supposed to know.
     *
     * What stays the Server's is not arithmetic but disclosure, and none of it
     * is optional:
     *
     * - the **window** decides whether there is an answer at all,
     * - the **freeze** withholds outcomes — see `ContestantResult.frozen`,
     * - `scoreVisibility` decides whose results are in it.
     *
     * A board is assembled in the Client, so anything sent has already been
     * disclosed. Filtering has to happen where the data leaves.
     *
     * `seriesId` narrows the feed to one round. The ranking screen does not use
     * it: the combined board already carries every round the reader may see, so
     * it asks once and slices what it was given.
     */
    getResults(activityId: string, seriesId: string | undefined, signal: AbortSignal): Promise<ActivityResults>;

    getQuestions(activityId: string, filter: QuestionFilter, signal: AbortSignal): Promise<Page<Question>>;
    askQuestion(activityId: string, input: AskQuestionInput, signal: AbortSignal): Promise<Question>;
    markQuestionRead(activityId: string, questionId: string, signal: AbortSignal): Promise<void>;
}
