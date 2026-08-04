import { Event } from "./Event";
import { JobState, Page } from "./ParticipantApi";

/**
 * The manager-facing API.
 *
 * Separate from `ParticipantApi` because the two answer different questions
 * about the same data: a participant asks what they may see, a manager asks what
 * exists. Sharing one interface would mean every participant call carrying a
 * "but as a manager" variant.
 */

/** Where a permission is meaningful. `both` means either scope accepts it. */
export type PermissionScope = "global" | "activity" | "both";

/**
 * One entry from the catalogue the **Server** publishes.
 *
 * The catalogue is served rather than hard-coded here, because the Server is
 * what enforces it: an editor that offered a permission the Server does not know
 * would grant nothing, and one that hid a permission the Server does know would
 * leave a right unmanageable. The Client translates `key` and falls back to
 * printing it.
 */
export interface PermissionDefinition {
    /** For example `problem:read:all`. */
    key: string;
    scope: PermissionScope;
    /** Grouping for the editor: `activity`, `problem`, `submission`, and so on. */
    group: string;
}

export interface PermissionTemplate {
    id: string;
    name: string;
    description?: string;
    permissions: string[];
    /** One of the three shipped. Deleting one is refused. */
    isBuiltIn: boolean;
}

export interface PermissionTemplateInput {
    name: string;
    description?: string;
    permissions: string[];
}

export type GrantState = "invited" | "active";

/**
 * What one user may do within one scope — and, for an activity, the membership
 * itself. A null `activityId` is the system scope.
 */
export interface Grant {
    id: string;
    userId: string;
    userName: string;
    activityId?: string;
    activityName?: string;
    permissions: string[];
    /** Where the set started. Informational: it is not a reference. */
    createdFromTemplate?: string;
    state: GrantState;
    createdAt: string;
}

export interface GrantInput {
    userId: string;
    activityId?: string;
    permissions: string[];
    createdFromTemplate?: string;
    state?: GrantState;
}

export interface GrantFilter {
    page?: number;
    pageSize?: number;
    userId?: string;
    activityId?: string;
    /** Absent means both scopes. */
    scope?: "global" | "activity";
}

/**
 * Just enough of an account to grant to.
 *
 * The account screens come later and will need much more; this is the lookup a
 * grant editor cannot do without, and is deliberately not the full user model.
 */
export interface ManagedUserSummary {
    id: string;
    username: string;
    name: string;
    email?: string;
}

/** An activity, as something to scope a grant to. */
export interface ManagedActivitySummary {
    id: string;
    slug: string;
    name: string;
}

/**
 * Visibility and enrolment, mirroring the Server enums. Score and log are two
 * settings rather than one policy: a manager may want a public scoreboard while
 * the compiler output stays internal.
 */
export type ScoreVisibility = "everyone" | "participantOnly" | "managersOnly";
export type LogVisibility = "managersOnly" | "participant";
export type JoinPolicy = "closed" | "invitation" | "open";

/**
 * An activity as its manager sees it: everything the participant model hides,
 * plus the counts that make the list useful.
 */
export interface ManagedActivity {
    id: string;
    slug: string;
    name: string;
    /** Type discriminator, `name@version`. Selects the layout renderer. */
    type: string;
    /** Selects the ranking renderer. Independent of `type`. */
    rankingType: string;
    /** IANA zone the activity's clock is displayed in. */
    timeZone: string;
    /** Absent when the activity spans its series instead of stating its own bounds. */
    startDate?: string;
    endDate?: string;
    modules: { ranking: boolean; questions: boolean; rules: boolean };
    scoreVisibility: ScoreVisibility;
    logVisibility: LogVisibility;
    joinPolicy: JoinPolicy;
    /**
     * The three limits the **Server** enforces, so none of them may live in the
     * opaque configuration chain. Time and memory are the Runner's and do.
     */
    maxUploadBytes: number;
    maxAttachments: number;
    /** Null or absent means unlimited. */
    maxSubmissionsPerProblem?: number;
    /** Set once ended: still readable, accepting nothing new. */
    archivedAt?: string;
    seriesCount: number;
    problemCount: number;
    participantCount: number;
}

export interface ActivityInput {
    slug: string;
    name: string;
    type: string;
    rankingType: string;
    timeZone: string;
    startDate?: string;
    endDate?: string;
    modules: { ranking: boolean; questions: boolean; rules: boolean };
    scoreVisibility: ScoreVisibility;
    logVisibility: LogVisibility;
    joinPolicy: JoinPolicy;
    maxUploadBytes: number;
    maxAttachments: number;
    maxSubmissionsPerProblem?: number;
}

export interface ManagedActivityFilter {
    page?: number;
    pageSize?: number;
    search?: string;
    includeArchived?: boolean;
}

export interface ManagedSeries {
    id: string;
    activityId: string;
    slug: string;
    name: string;
    order: number;
    startDate?: string;
    endDate?: string;
    /** Whether a closed series admits how many problems it holds. */
    revealProblemCount: boolean;
    /**
     * Between these two instants the Server withholds ranking entries. The
     * ranking is assembled in the Client, so anything sent is disclosed —
     * freezing has to happen where the data leaves.
     */
    rankingFreezeAt?: string;
    rankingRevealAt?: string;
    problems: ManagedSeriesProblem[];
}

export interface SeriesInput {
    slug: string;
    name: string;
    startDate?: string;
    endDate?: string;
    revealProblemCount: boolean;
    rankingFreezeAt?: string;
    rankingRevealAt?: string;
}

/**
 * One problem assigned to one series — where a library entry becomes something
 * a participant can solve, which is why the per-use settings are here and not on
 * the problem.
 */
export interface ManagedSeriesProblem {
    id: string;
    seriesId: string;
    problemId: string;
    /** From the library, for a manager who needs to know what was attached. */
    problemSlug: string;
    problemName: string;
    /** The label a participant sees and the URL segment. Unique across the activity. */
    slug: string;
    /** Overrides the library name for this assignment. */
    name?: string;
    order: number;
    /**
     * Pins the content version this assignment evaluates against. Absent means
     * the current one, which is only safe while nobody is editing it underneath
     * a running series.
     */
    pinnedProblemVersionId?: string;
    pinnedVersion?: number;
    /** The library's newest version, so the screen can say what "current" means. */
    currentVersion: number;
    /** Whether the evaluated version has a Runner package. Nothing judges without one. */
    hasPackage: boolean;
    /**
     * How much has been submitted against this assignment. **Detaching is
     * refused above zero** — a result belongs to what it was judged against, and
     * removing the assignment would orphan it.
     */
    submissionCount: number;
    /** Per-assignment configuration. Opaque to the Server. */
    config: unknown;
    /** Narrow the activity's ceilings. Absent inherits. */
    maxUploadBytes?: number;
    maxAttachments?: number;
    maxSubmissions?: number;
}

export interface SeriesProblemInput {
    problemId: string;
    slug: string;
    name?: string;
    pinnedProblemVersionId?: string;
    config?: unknown;
    maxUploadBytes?: number;
    maxAttachments?: number;
    maxSubmissions?: number;
}

/**
 * Who can see a problem in the library. Private is the default: a manager's
 * drafts are not everyone's business.
 *
 * This is the product's only access list, and it is deliberately narrow. The
 * permission model settles what a manager may **do** with a problem; this
 * settles **which** problems that applies to.
 */
export type ProblemVisibility = "private" | "shared" | "instance";

export interface ManagedProblem {
    id: string;
    slug: string;
    name: string;
    /** Problem type discriminator, `name@version`. */
    type: string;
    ownerUserId: string;
    ownerName: string;
    visibility: ProblemVisibility;
    /** User ids, meaningful only when `visibility` is `shared`. */
    sharedWith: string[];
    /** Set once retired: gone from the attach picker, taking no new versions. */
    archivedAt?: string;
    currentVersion: number;
    versionCount: number;
    createdAt: string;
    /**
     * How many series assignments point at it. **Deletion is refused while this
     * is above zero** — retiring a problem must not break an activity that ran
     * with it, so the answer there is archiving.
     */
    attachedCount: number;
}

export interface ManagedProblemVersion {
    id: string;
    version: number;
    createdAt: string;
    createdByName?: string;
    /** What changed, for the manager reading the history later. */
    note?: string;
    /** Limits and scoring for this version. Opaque to the Server. */
    config: unknown;
    /** Whether a Runner package has been uploaded for this version. */
    hasPackage: boolean;
    files: { name: string; scope: "participant" | "manager" | "runner"; sizeBytes: number; sha256: string }[];
}

export interface ProblemInput {
    slug: string;
    name: string;
    type: string;
}

export interface ProblemFilter {
    page?: number;
    pageSize?: number;
    search?: string;
    /** Absent shows what the caller may see; `true` narrows to their own. */
    mineOnly?: boolean;
    includeArchived?: boolean;
}

export interface ProblemVersionInput {
    note?: string;
    /** The default statement, as a `content.md` document. */
    content?: unknown;
    /** Translations, stored as `content-<language>.md` beside the default. */
    translations?: StatementVariant[];
    config?: unknown;
}

/** A statement in one language. `language` absent means the default `content.md`. */
export interface StatementVariant {
    language?: string;
    content: unknown;
}


/**
 * A submission as a manager sees it: whose it is and where it sits, which the
 * participant's own view has no need to say.
 */
export interface ManagedSubmission {
    id: string;
    activityId: string;
    activitySlug: string;
    seriesId: string;
    seriesName: string;
    /** The assignment, not the library entry: the slug is the activity's. */
    seriesProblemId: string;
    problemSlug: string;
    problemName: string;
    userId: string;
    userName: string;
    submittedAt: string;
    language?: string;
    state: JobState;
    /** Short label from the Runner. Its meaning belongs to the problem type. */
    verdict?: string;
    score?: number;
    maxScore?: number;
    /** How many evaluation jobs it has had. A rejudge adds one. */
    attempts: number;
}

/** One evaluation job. The unit a rejudge creates and a cancellation stops. */
export interface ManagedAttempt {
    id: string;
    attempt: number;
    state: JobState;
    startedAt: string;
    finishedAt?: string;
    /** Which Runner claimed it, once one has. */
    runnerName?: string;
    /** The Runner's result document, rendered by the problem type. */
    detail?: unknown;
    /** Compiler output and the judge's messages. Managers always see it. */
    log?: string;
}

export interface ManagedSubmissionDetail extends ManagedSubmission {
    /** Selects the result renderer, as it does on the participant's screen. */
    problemType: string;
    /** Newest first. */
    attemptList: ManagedAttempt[];
    files: { name: string; language?: string; sizeBytes: number; sha256: string }[];
}

export interface ManagedSubmissionFilter {
    page?: number;
    pageSize?: number;
    activityId?: string;
    seriesId?: string;
    seriesProblemId?: string;
    userId?: string;
    state?: JobState;
    /** Matched against the verdict label exactly; the Server does not parse it. */
    verdict?: string;
    /** User name or problem slug. */
    search?: string;
}

export type ManagerEventType = "permissionTemplateChanged" | "grantChanged" | "problemChanged"
    | "activityChanged" | "seriesChanged" | "submissionChanged";
export type ManagerEvent<T extends ManagerEventType, V> = Event<T, V>;

export type PermissionTemplateChangedEvent = ManagerEvent<"permissionTemplateChanged", {
    template?: PermissionTemplate;
    deletedId?: string;
}>;

export type GrantChangedEvent = ManagerEvent<"grantChanged", {
    grant?: Grant;
    deletedId?: string;
}>;

export type ProblemChangedEvent = ManagerEvent<"problemChanged", {
    problem?: ManagedProblem;
    deletedId?: string;
}>;

export type ActivityChangedEvent = ManagerEvent<"activityChanged", {
    activity?: ManagedActivity;
    deletedId?: string;
}>;

/** Carries the whole series, assignments included: they are edited together. */
export type SeriesChangedEvent = ManagerEvent<"seriesChanged", {
    activityId: string;
    series?: ManagedSeries;
    deletedId?: string;
}>;

/** Sent as a job is claimed, finishes, or is cancelled. */
export type SubmissionChangedEvent = ManagerEvent<"submissionChanged", {
    submission: ManagedSubmission;
}>;

export interface ManagerEventDispatcher {
    addEventListener(type: "permissionTemplateChanged", listener: (evt: PermissionTemplateChangedEvent) => void, signal: AbortSignal): void;
    addEventListener(type: "grantChanged", listener: (evt: GrantChangedEvent) => void, signal: AbortSignal): void;
    addEventListener(type: "problemChanged", listener: (evt: ProblemChangedEvent) => void, signal: AbortSignal): void;
    addEventListener(type: "activityChanged", listener: (evt: ActivityChangedEvent) => void, signal: AbortSignal): void;
    addEventListener(type: "seriesChanged", listener: (evt: SeriesChangedEvent) => void, signal: AbortSignal): void;
    addEventListener(type: "submissionChanged", listener: (evt: SubmissionChangedEvent) => void, signal: AbortSignal): void;
    addEventListener<T extends ManagerEventType, V>(type: T, listener: (evt: ManagerEvent<T, V>) => void, signal: AbortSignal): void;
}

export interface ManagerApi {
    readonly eventDispatcher: ManagerEventDispatcher;

    /** Every permission the Server knows. The editor renders exactly this. */
    getPermissionCatalogue(signal: AbortSignal): Promise<PermissionDefinition[]>;

    /**
     * What the signed-in user themselves holds in a scope.
     *
     * The editor needs it because nobody may grant a permission they do not
     * hold: an entry they lack is shown and disabled, rather than hidden, so the
     * limit is visible instead of looking like a missing feature.
     */
    getMyPermissions(activityId: string | undefined, signal: AbortSignal): Promise<string[]>;

    getPermissionTemplates(signal: AbortSignal): Promise<PermissionTemplate[]>;
    createPermissionTemplate(input: PermissionTemplateInput, signal: AbortSignal): Promise<PermissionTemplate>;
    updatePermissionTemplate(id: string, input: PermissionTemplateInput, signal: AbortSignal): Promise<PermissionTemplate>;
    deletePermissionTemplate(id: string, signal: AbortSignal): Promise<void>;

    getGrants(filter: GrantFilter, signal: AbortSignal): Promise<Page<Grant>>;
    setGrant(input: GrantInput, signal: AbortSignal): Promise<Grant>;
    revokeGrant(id: string, signal: AbortSignal): Promise<void>;

    searchUsers(query: string, signal: AbortSignal): Promise<ManagedUserSummary[]>;
    getManagedActivities(signal: AbortSignal): Promise<ManagedActivitySummary[]>;

    getActivities(filter: ManagedActivityFilter, signal: AbortSignal): Promise<Page<ManagedActivity>>;
    /** Accepts an id or a slug: the manager's URLs read like the participant's. */
    getActivity(idOrSlug: string, signal: AbortSignal): Promise<ManagedActivity>;
    createActivity(input: ActivityInput, signal: AbortSignal): Promise<ManagedActivity>;
    updateActivity(id: string, input: ActivityInput, signal: AbortSignal): Promise<ManagedActivity>;
    /** The ordinary way an activity ends. Readable, accepting nothing new. */
    setActivityArchived(id: string, archived: boolean, signal: AbortSignal): Promise<ManagedActivity>;
    /**
     * Destroys the submissions participants may still want to look back at,
     * which is why it is a permission of its own and not in the manager
     * template. Refused while the activity holds anything.
     */
    deleteActivity(id: string, signal: AbortSignal): Promise<void>;

    getSeries(activityId: string, signal: AbortSignal): Promise<ManagedSeries[]>;
    createSeries(activityId: string, input: SeriesInput, signal: AbortSignal): Promise<ManagedSeries>;
    updateSeries(seriesId: string, input: SeriesInput, signal: AbortSignal): Promise<ManagedSeries>;
    /** Refused once anything has been submitted to it. */
    deleteSeries(seriesId: string, signal: AbortSignal): Promise<void>;
    reorderSeries(activityId: string, orderedIds: string[], signal: AbortSignal): Promise<ManagedSeries[]>;

    attachProblem(seriesId: string, input: SeriesProblemInput, signal: AbortSignal): Promise<ManagedSeries>;
    updateSeriesProblem(seriesProblemId: string, input: SeriesProblemInput, signal: AbortSignal): Promise<ManagedSeries>;
    /** Refused once anything has been submitted against the assignment. */
    detachProblem(seriesProblemId: string, signal: AbortSignal): Promise<ManagedSeries>;
    reorderSeriesProblems(seriesId: string, orderedIds: string[], signal: AbortSignal): Promise<ManagedSeries>;

    getSubmissions(filter: ManagedSubmissionFilter, signal: AbortSignal): Promise<Page<ManagedSubmission>>;
    getSubmission(id: string, signal: AbortSignal): Promise<ManagedSubmissionDetail>;
    /** The submitted source, as stored. */
    getSubmissionFile(id: string, name: string, signal: AbortSignal): Promise<string>;

    /**
     * Adds an evaluation job. The previous attempts stay: a result belongs to
     * what it was judged against, and a rejudge is a new attempt rather than a
     * correction of an old one.
     */
    rejudgeSubmission(id: string, signal: AbortSignal): Promise<ManagedSubmission>;
    /** Every submission of one assignment. Returns how many jobs were added. */
    rejudgeSeriesProblem(seriesProblemId: string, signal: AbortSignal): Promise<number>;
    rejudgeSeries(seriesId: string, signal: AbortSignal): Promise<number>;
    /** Stops a job that has not finished. A finished one is history. */
    cancelAttempt(submissionId: string, attemptId: string, signal: AbortSignal): Promise<ManagedSubmissionDetail>;

    getProblems(filter: ProblemFilter, signal: AbortSignal): Promise<Page<ManagedProblem>>;
    getProblem(id: string, signal: AbortSignal): Promise<ManagedProblem>;
    createProblem(input: ProblemInput, signal: AbortSignal): Promise<ManagedProblem>;
    updateProblem(id: string, input: ProblemInput, signal: AbortSignal): Promise<ManagedProblem>;
    /** Copies **only the newest version**, as version 1 of a new problem. */
    duplicateProblem(id: string, signal: AbortSignal): Promise<ManagedProblem>;
    setProblemVisibility(id: string, visibility: ProblemVisibility, sharedWith: string[], signal: AbortSignal): Promise<ManagedProblem>;
    setProblemArchived(id: string, archived: boolean, signal: AbortSignal): Promise<ManagedProblem>;
    /** Refused while the problem is attached anywhere. Archive it instead. */
    deleteProblem(id: string, signal: AbortSignal): Promise<void>;

    getProblemVersions(problemId: string, signal: AbortSignal): Promise<ManagedProblemVersion[]>;
    /**
     * Every statement stored for one version — the default and each translation.
     * One call rather than one per language: the editor shows them together, and
     * a manager comparing two languages should not wait for a round trip.
     */
    getProblemContent(problemId: string, versionId: string, signal: AbortSignal): Promise<StatementVariant[]>;
    /** Publishes a new version. Versions are append-only; nothing is edited in place. */
    createProblemVersion(problemId: string, input: ProblemVersionInput, signal: AbortSignal): Promise<ManagedProblemVersion>;
    /**
     * Attaches the Runner package to a version.
     *
     * The archive is assembled in the Client, because its layout belongs to the
     * problem type and the Server is not allowed to know one type from another.
     * The Server stores the bytes under `FileScope.Runner`.
     *
     * `sha256` is the checksum of the archive, computed by the caller. The
     * Server recomputes it and refuses to store a mismatch, which is what turns
     * a truncated upload into an error instead of a stored file whose contents
     * are wrong.
     */
    uploadProblemPackage(problemId: string, versionId: string, archive: Blob, sha256: string, signal: AbortSignal): Promise<ManagedProblemVersion>;
}
