import { Event } from "./Event";
import { DisplayName, JobState, Page, QuestionAnswer, QuestionKind } from "./ParticipantApi";

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
    /** {@link DisplayName}: the name if there is one, the login otherwise. */
    userName: DisplayName;
    /**
     * The login, beside the name.
     *
     * Two people called Jan Kowalski are one department, not a hypothesis, and a
     * grant list showing only names cannot be checked against anything. Sent
     * rather than looked up from another request: what the row shows must not
     * depend on that person happening to be in some other answer.
     */
    userLogin: string;
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
    files: ProblemFile[];
}

/**
 * A file attached to one problem version.
 *
 * The scope decides who ever receives it, and the Server enforces it without
 * looking inside: a participant sees `participant`, a Runner receives the
 * package, and `manager` — a model solution, a note — reaches neither.
 */
export interface ProblemFile {
    name: string;
    scope: FileScope;
    mimeType: string;
    sizeBytes: number;
    sha256: string;
    /** Where to fetch it. Absent until the Server has stored it. */
    url?: string;
}

export type FileScope = "participant" | "manager" | "runner";

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

/**
 * Everything a version is, published in one request.
 *
 * A version is not built up after the fact: the statement, the files and the
 * package go in together, because a result has to stay attributable to what it
 * was judged against. Files the previous version carried come along unless
 * `removedFiles` names them, so correcting a typo does not drop every figure.
 *
 * The **statement travels inline** while everything else travels as a
 * reference. The difference is where the bytes come from: a statement is
 * written in this request, in an editor, and is small; a figure or a package is
 * bytes the author already had, uploaded before the version is published. The
 * Server stores the statement as a file all the same — `content.md` is a
 * well-known name inside the version, not a column.
 */
export interface ProblemVersionInput {
    note?: string;
    /** The default statement, as a `content.md` document. */
    content?: unknown;
    /** Translations, stored as `content-<language>.md` beside the default. */
    translations?: StatementVariant[];
    config?: unknown;
    /** Attached in this version, beside the ones carried forward. */
    files?: NewProblemFile[];
    /** Carried-forward names that must not be. */
    removedFiles?: string[];
    /** The Runner package. Absent carries the previous version's forward. */
    package?: NewProblemPackage;
}

/**
 * A file being attached, as a **reference**.
 *
 * The bytes went up first, through `fileApi.upload`, which is where the
 * checksum was checked; what arrives here is the id that came back. That is
 * also what makes carrying a figure into the next version free — the new
 * version references the same file rather than copying it.
 *
 * A name the version already holds is refused rather than silently replaced: a
 * statement referring to `graf.png` must not change meaning because somebody
 * attached a different `graf.png`.
 */
export interface NewProblemFile {
    /** As `fileApi.upload` returned it. */
    fileId: string;
    /** The name **within this version** — what a statement refers to. */
    name: string;
    scope: FileScope;
}

/**
 * The Runner package being attached, as a reference.
 *
 * The archive is assembled in the Client, because its layout belongs to the
 * problem type and the Server is not allowed to know one type from another. It
 * is uploaded like any other file and referenced here under `FileScope.Runner`.
 */
export interface NewProblemPackage {
    fileId: string;
    /**
     * The example tests, as the participant receives them — referenced beside
     * the package as a participant-scoped `examples.zip`.
     *
     * A separate archive rather than the package itself: the package is scoped
     * to the Runner and carries every hidden test, so handing it over would
     * disclose the whole problem. Built from the same builder state, so it
     * travels with the package rather than as an ordinary attachment.
     */
    samplesFileId?: string;
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
    userName: DisplayName;
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


/**
 * A question or an announcement, as staff see it.
 *
 * One model for both because they are one table: an announcement is a question
 * nobody asked, published from the start. Splitting them would double every
 * filter and every screen for a difference of two fields.
 */
export interface ManagedQuestion {
    id: string;
    activityId: string;
    activitySlug: string;
    kind: QuestionKind;
    topic: string;
    body: string;
    /** Absent for an announcement: nobody asked it. */
    authorUserId?: string;
    authorName?: DisplayName;
    createdAt: string;
    /** Set when it concerns one series rather than the whole activity. */
    seriesId?: string;
    seriesName?: string;
    /** Set when it concerns one problem. */
    seriesProblemId?: string;
    problemSlug?: string;
    problemName?: string;
    answer?: QuestionAnswer;
    /**
     * Published means every participant sees it, not only the person who asked.
     * Answering and publishing are two acts: an answer meant for one team is the
     * common case, and publishing it by default would leak it.
     */
    isPublished: boolean;
    /** How many participants have opened it. Only meaningful once published. */
    readCount: number;
}

export interface ManagedQuestionFilter {
    page?: number;
    pageSize?: number;
    activityId?: string;
    seriesId?: string;
    kind?: QuestionKind;
    /** `true` narrows to those still waiting for an answer. */
    unansweredOnly?: boolean;
    search?: string;
}

export interface AnswerInput {
    body: string;
    /** Answer and publish in one act, which is what an FAQ-worthy question wants. */
    publish?: boolean;
}

export interface AnnouncementInput {
    topic: string;
    body: string;
    /** Optional: an announcement may concern one series. */
    seriesId?: string;
}


/**
 * An account, as the users screen shows it.
 *
 * Blocking is on the account rather than on a membership: it concerns signing
 * in, not one activity. What somebody may do inside an activity is a grant, and
 * revoking that is a different act with a different meaning.
 */
export interface ManagedUser {
    id: string;
    /**
     * The only required identifier. A temporary account has no address and a
     * person may decline to give a name, but everybody signs in as something.
     */
    username: string;
    /** Both optional: a contest account may be `contest-001` and nothing more. */
    firstName?: string;
    lastName?: string;
    /** Optional, and unverified until `emailConfirmed`. */
    email?: string;
    /**
     * Whether the address was confirmed. Separate from approval on purpose:
     * confirming an address proves the address, approving an account is a
     * decision somebody made.
     */
    emailConfirmed: boolean;
    /**
     * When an administrator let the account in. Absent means **pending** — the
     * state an installation gets when it approves accounts by hand instead of
     * by email.
     */
    approvedAt?: string;
    /** A sentence about the account, written by staff. Not a tag. */
    note?: string;
    /** Free display metadata, never queried. The Client's own labels. */
    tags: string[];
    /**
     * Created in bulk for one event, with a password this installation holds.
     * The permanent exception to "no end-user passwords in the Server", together
     * with administrator and local accounts.
     */
    isTemporary: boolean;
    /** After this the account stops signing in. Temporary accounts usually have one. */
    expiresAt?: string;
    blockedAt?: string;
    blockedReason?: string;
    createdAt: string;
    lastSeenAt?: string;
    /** How many scopes they hold a grant in, the system scope included. */
    grantCount: number;
}

/**
 * One sign-in, as the administrator screen shows it.
 *
 * A session is neither a person nor a browser tab. It is what signing in
 * created; it outlives the tab that made it, and it may have several tabs open
 * at once or none at all.
 */
export interface UserSession {
    id: string;
    /**
     * How many WebSockets the Server holds for this session **at the moment it
     * answered**. A count rather than a flag because two tabs and no tabs are
     * different facts, and "active" is only the first of them: zero means signed
     * in but not connected — a shut laptop, a tab the browser froze, a network
     * that went away without saying so.
     *
     * This is connection state, not stored state. REST is the source of what
     * persists; this is a snapshot, and a screen showing it says when it was
     * taken rather than pretending to be live.
     */
    connections: number;
    /** When signing in created it. */
    startedAt: string;
    /** When the Server last served this session anything at all. */
    lastRequestAt?: string;
    /**
     * What it last asked for — an API path, not the screen somebody was looking
     * at. The Server knows the first and cannot know the second.
     */
    lastRequestPath?: string;
    /** Where from, so that a person can tell their own session from another. */
    ipAddress?: string;
    userAgent?: string;
    expiresAt?: string;
    /** The session doing the asking, when somebody is looking at their own account. */
    isCurrent: boolean;
}

export interface ManagedUserFilter {
    page?: number;
    pageSize?: number;
    search?: string;
    includeBlocked?: boolean;
    temporaryOnly?: boolean;
}

export interface UserInput {
    username: string;
    firstName?: string;
    lastName?: string;
    email?: string;
}

/**
 * What may be changed afterwards. The username is not here: it is what a person
 * signs in as and what a manager knows them by, so it is fixed at creation the
 * way an activity's slug is.
 */
export interface UserUpdateInput {
    firstName?: string;
    lastName?: string;
    email?: string;
    note?: string;
    tags?: string[];
}

/**
 * Accounts for one event, made from a prefix and a count.
 *
 * The passwords are generated by the Server and returned **once**, at creation:
 * there is nowhere to read them back from afterwards, which is the point. What
 * the screen does with them — print, CSV — is the screen's business.
 */
export interface BulkUserInput {
    /** `contest` gives `contest-001`, `contest-002`, … */
    prefix: string;
    count: number;
    expiresAt?: string;
    tags?: string[];
    /** Enrol them all into one activity as they are created. */
    activityId?: string;
    /** The permission set the enrolment carries. Ignored without an activity. */
    permissions?: string[];
}

/** Handed over once. The Server keeps a hash; this is the only readable copy. */
export interface CreatedCredential {
    userId: string;
    username: string;
    password: string;
}


/**
 * A Runner, as the administrator screen shows it.
 *
 * **Everything here is reported by the Runner itself** — product and version,
 * the problem types it supports, its address, its key fingerprint and what
 * `lscpu` and `free` say about the machine. The Server records the report and
 * matches jobs against `problemTypes` by equality; it never interprets a type,
 * and the screen never invents a field the Runner did not send.
 */
export interface ManagedRunner {
    id: string;
    /** The Runner's own name for itself. Not unique, and not an identifier. */
    name: string;
    product: string;
    version: string;
    /** Problem types it will accept, `name@version`. Matched by equality. */
    problemTypes: string[];
    /** Free labels used to steer work at it. Set here, not by the Runner. */
    tags: string[];
    address: string;
    /** The Ed25519 public key it registered with. Immutable for its lifetime. */
    publicKey: string;
    /** Of {@link publicKey}, for reading aloud when approving one. */
    fingerprint: string;
    state: RunnerState;
    /** Whether its connection is up right now. Says nothing about approval. */
    isConnected: boolean;
    lastSeenAt?: string;
    registeredAt: string;
    approvedAt?: string;
    revokedAt?: string;
    revokedReason?: string;
    /** What the machine reported about itself. Absent until it first connects. */
    machine?: {
        os?: string;
        cpu?: string;
        cores?: number;
        memoryMb?: number;
    };
    /** The job it is running, if any, and how many it has finished. */
    currentSubmissionId?: string;
    completedJobs: number;
    /**
     * Whatever the Runner uploaded about itself — `lscpu`, `free`, its log.
     *
     * Ordinary files, sent through the ordinary file API and attached to the
     * Runner. The Server stores the bytes and does not know one from another,
     * so a Runner that starts reporting something new needs no Server change
     * and no migration: the panel renders every text attachment it finds.
     */
    attachments: RunnerAttachment[];
}

export interface RunnerAttachment {
    /** File id, as `POST /files` returned it. */
    id: string;
    /** `lscpu.txt`, `free.txt`, `runner.log`. The name is the tab's label. */
    name: string;
    mimeType: string;
    sizeBytes: number;
    sha256: string;
    uploadedAt: string;
}

/**
 * A Runner self-registers and an administrator approves it. The key is
 * generated once and never rotates, so a compromised Runner is revoked and
 * re-registers as a new identity.
 */
export type RunnerState = "pendingApproval" | "approved" | "revoked";

export interface ManagedRunnerFilter {
    page?: number;
    pageSize?: number;
    state?: RunnerState;
    search?: string;
}

export type ManagerEventType = "permissionTemplateChanged" | "grantChanged" | "problemChanged"
    | "activityChanged" | "seriesChanged" | "submissionChanged" | "questionChanged" | "userChanged"
    | "runnerChanged";
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

export type QuestionChangedEvent = ManagerEvent<"questionChanged", {
    question?: ManagedQuestion;
    deletedId?: string;
}>;

export type UserChangedEvent = ManagerEvent<"userChanged", {
    user: ManagedUser;
}>;

export type RunnerChangedEvent = ManagerEvent<"runnerChanged", {
    runner: ManagedRunner;
}>;

export interface ManagerEventDispatcher {
    addEventListener(type: "permissionTemplateChanged", listener: (evt: PermissionTemplateChangedEvent) => void, signal: AbortSignal): void;
    addEventListener(type: "grantChanged", listener: (evt: GrantChangedEvent) => void, signal: AbortSignal): void;
    addEventListener(type: "problemChanged", listener: (evt: ProblemChangedEvent) => void, signal: AbortSignal): void;
    addEventListener(type: "activityChanged", listener: (evt: ActivityChangedEvent) => void, signal: AbortSignal): void;
    addEventListener(type: "seriesChanged", listener: (evt: SeriesChangedEvent) => void, signal: AbortSignal): void;
    addEventListener(type: "submissionChanged", listener: (evt: SubmissionChangedEvent) => void, signal: AbortSignal): void;
    addEventListener(type: "questionChanged", listener: (evt: QuestionChangedEvent) => void, signal: AbortSignal): void;
    addEventListener(type: "userChanged", listener: (evt: UserChangedEvent) => void, signal: AbortSignal): void;
    addEventListener(type: "runnerChanged", listener: (evt: RunnerChangedEvent) => void, signal: AbortSignal): void;
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

    /**
     * Everything the caller holds **anywhere**: the system scope unioned with
     * every activity they have a grant in.
     *
     * The question a menu asks — "is there anywhere this person may do this" —
     * and deliberately not the same call as `getMyPermissions`, which answers
     * about one scope. Confusing the two would let somebody grant globally what
     * they hold in a single activity, and would hide the manager panel from a
     * person who manages one activity and nothing else.
     */
    getMyAccess(signal: AbortSignal): Promise<string[]>;

    getPermissionTemplates(signal: AbortSignal): Promise<PermissionTemplate[]>;
    createPermissionTemplate(input: PermissionTemplateInput, signal: AbortSignal): Promise<PermissionTemplate>;
    updatePermissionTemplate(id: string, input: PermissionTemplateInput, signal: AbortSignal): Promise<PermissionTemplate>;
    deletePermissionTemplate(id: string, signal: AbortSignal): Promise<void>;

    getGrants(filter: GrantFilter, signal: AbortSignal): Promise<Page<Grant>>;
    setGrant(input: GrantInput, signal: AbortSignal): Promise<Grant>;
    revokeGrant(id: string, signal: AbortSignal): Promise<void>;

    searchUsers(query: string, signal: AbortSignal): Promise<ManagedUserSummary[]>;

    getRunners(filter: ManagedRunnerFilter, signal: AbortSignal): Promise<Page<ManagedRunner>>;
    /** Nothing is evaluated by a Runner until an administrator has approved it. */
    approveRunner(id: string, signal: AbortSignal): Promise<ManagedRunner>;
    /**
     * There is no rotation: a key is generated once at first start. A leaked one
     * is revoked, and that Runner comes back as a new identity.
     */
    revokeRunner(id: string, reason: string | undefined, signal: AbortSignal): Promise<ManagedRunner>;
    setRunnerTags(id: string, tags: string[], signal: AbortSignal): Promise<ManagedRunner>;
    /** The bytes of one attachment, as text. Only sensible for a text one. */
    getRunnerAttachment(runnerId: string, attachmentId: string, signal: AbortSignal): Promise<string>;
    /** Forgets a revoked Runner entirely. Refused while it is anything else. */
    forgetRunner(id: string, signal: AbortSignal): Promise<void>;

    getUsers(filter: ManagedUserFilter, signal: AbortSignal): Promise<Page<ManagedUser>>;
    createUser(input: UserInput, signal: AbortSignal): Promise<CreatedCredential>;
    /** Returns one credential per account, readable only here. */
    createTemporaryUsers(input: BulkUserInput, signal: AbortSignal): Promise<CreatedCredential[]>;
    /** Blocking stops sign-in; it does not touch what they may do once in. */
    setUserBlocked(id: string, blocked: boolean, reason: string | undefined, signal: AbortSignal): Promise<ManagedUser>;
    /** Issues a new password and returns it once. */
    resetUserPassword(id: string, signal: AbortSignal): Promise<CreatedCredential>;
    /** Name, address, note and the free display labels, in one act. */
    updateUser(id: string, input: UserUpdateInput, signal: AbortSignal): Promise<ManagedUser>;
    /** Lets a pending account in, where approval is by hand rather than by email. */
    approveUser(id: string, signal: AbortSignal): Promise<ManagedUser>;
    /**
     * The sessions of one account, as the Server holds them at the moment it
     * answers. Read under `user:read:all`, like everything else on that screen:
     * a session carries an address and a browser, which is more than the account
     * row says about somebody.
     */
    getUserSessions(userId: string, signal: AbortSignal): Promise<UserSession[]>;
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

    getQuestions(filter: ManagedQuestionFilter, signal: AbortSignal): Promise<Page<ManagedQuestion>>;
    /** Answering leaves it unpublished unless the input says otherwise. */
    answerQuestion(id: string, input: AnswerInput, signal: AbortSignal): Promise<ManagedQuestion>;
    /** Publishing a question shows it, and its answer, to every participant. */
    setQuestionPublished(id: string, published: boolean, signal: AbortSignal): Promise<ManagedQuestion>;
    createAnnouncement(activityId: string, input: AnnouncementInput, signal: AbortSignal): Promise<ManagedQuestion>;
    /** Only an announcement may be deleted; a participant's question is theirs. */
    deleteAnnouncement(id: string, signal: AbortSignal): Promise<void>;

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
    /**
     * Publishes a new version — the statement, the files and the package at once.
     *
     * The only way to change what a problem holds. Versions are append-only, and
     * an existing one takes no new file and no new package: what a submission was
     * judged against has to stay exactly what it was.
     */
    createProblemVersion(problemId: string, input: ProblemVersionInput, signal: AbortSignal): Promise<ManagedProblemVersion>;
    /**
     * The package stored for a version, or undefined where there is none.
     *
     * Read back so the builder can open what is already there: a correction
     * starts from the package that is live, not from an empty form.
     */
    getProblemPackage(problemId: string, versionId: string, signal: AbortSignal): Promise<Blob | undefined>;
}
