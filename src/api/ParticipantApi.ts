import { Event } from "./Event";
import { StatementRef } from "./FileApi";

/**
 * Models for the participant-facing part of the product.
 *
 * They mirror the Server entities in
 * `AlgoJudge-Server/AlgoJudge.Server/Database/Models/`, reduced to what a
 * participant may see. Two fields are deliberately `unknown` — the ranking
 * payload and a submission's evaluation detail. Both are documents the Runner
 * produces and the Server stores without parsing, rendered here by a renderer
 * chosen from the type. Typing them would put back into the Client exactly the
 * coupling the Server was freed from.
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
    /** Absent when the activity is not time-limited. */
    startDate?: string,
    endDate?: string,
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
    /** Which sidebar modules the activity manager enabled. */
    modules: {
        ranking: boolean,
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
     * While `false`, `problems` is absent. It is not an empty array: a closed
     * series does not disclose what it holds.
     */
    isOpen: boolean,
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
    /** The Runner's result document. Rendered by the problem type's renderer. */
    detail: unknown,
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
    | "sectionOpened"
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

/** A series reached its start. Carries the problems that were withheld until now. */
export type SectionOpenedEvent = ParticipantEvent<"sectionOpened", {
    activityId: string;
    series: Series;
}>;

export type ProblemStatusChangedEvent = ParticipantEvent<"problemStatusChanged", {
    activityId: string;
    problem: ProblemSummary;
}>;

export type SubmissionStateChangedEvent = ParticipantEvent<"submissionStateChanged", {
    activityId: string;
    submission: SubmissionSummary;
}>;

export type RankingChangedEvent = ParticipantEvent<"rankingChanged", {
    activityId: string;
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
    addEventListener(type: "sectionOpened", listener: (evt: SectionOpenedEvent) => void, signal: AbortSignal): void;
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

    /** The ranking document, shaped by `Activity.rankingType` and rendered from it. */
    getRanking(activityId: string, signal: AbortSignal): Promise<unknown>;

    getQuestions(activityId: string, filter: QuestionFilter, signal: AbortSignal): Promise<Page<Question>>;
    askQuestion(activityId: string, input: AskQuestionInput, signal: AbortSignal): Promise<Question>;
    markQuestionRead(activityId: string, questionId: string, signal: AbortSignal): Promise<void>;
}
