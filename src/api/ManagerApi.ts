import { InstanceDocumentKind, InstanceDocumentRef, InstanceInfo, ThemeColours } from "./CoreApi";
import { Event } from "./Event";
import { StatementRef, UploadedFile } from "./FileApi";
import { SeriesImportanceScope } from "./seriesImportance";
import {
    ActivityDocumentKind, ActivityDocumentRef, DisplayName, JobState, JoinPolicy, Page,
    QuestionAnswer, QuestionKind, ScoreVisibility, SubmissionFile,
} from "./ParticipantApi";

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
    /**
     * Whether the participant template grants it by default — what the editor
     * starts a new participant with.
     */
    participant: boolean;
    /**
     * Whether a grant carrying it is a membership that **runs** the activity
     * rather than takes part in it, and so leaves the participant count and the
     * ranking.
     *
     * Published by the Server rather than worked out here, because the Server is
     * what enforces it: a rule the Client kept its own copy of would be a rule
     * the Server could not enforce. It was worked out here — as "anything not in
     * the participant template" — until `trial:run` showed the two apart.
     */
    systemic: boolean;
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
/**
 * Several people competing as one, inside one activity.
 *
 * A group is a **contestant**: it submits, it spends one allowance, and it holds
 * one row in the ranking while its members hold none.
 */
export interface ActivityGroup {
    id: string;
    activityId: string;
    name: string;
    /** A short line beside the name, shown in the ranking. */
    description?: string;
    /**
     * Kept out of results and out of the ranking — the rule `isSystem` on a
     * grant applies to a person, one level up. **It still submits and still
     * spends its allowance**; what it does not do is appear.
     */
    isSystem: boolean;
    memberCount: number;
    /**
     * How many submissions were sent under it. **Any at all and it cannot be
     * deleted**: the group stamped on a submission is the record of what
     * competed. Retiring one means marking it system.
     */
    submissionCount: number;
    createdAt: string;
}

export interface ActivityGroupInput {
    name: string;
    description?: string;
    isSystem: boolean;
}

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
    /** The group this person competes as here, or absent for themselves. */
    groupId?: string;
    groupName?: string;
    permissions: string[];
    /**
     * A membership that is not a participation: whoever runs the activity, a
     * reference solution, a monitor. Submits like anybody, counts as nobody —
     * absent from `participantCount` and from the ranking.
     *
     * **Forced true for a staff grant**, which is any grant carrying a
     * permission a participant does not hold. A jury member counted among the
     * competitors is a bug, not a setting somebody might want. On a grant that
     * holds only a participant's permissions it is free, and off unless
     * somebody says otherwise.
     */
    isSystem: boolean;
    /** Where the set started. Informational: it is not a reference. */
    createdFromTemplate?: string;
    state: GrantState;
    createdAt: string;

    /**
     * Where this contribution came from.
     *
     * **At system scope a person's permissions are the union of several rows** —
     * one assigned by hand, plus one per linked identity provider — so no single
     * grant is the answer to "what may they do". A screen that cannot say where
     * a right came from is one nobody can act on.
     */
    source: "manual" | "provider";
    sourceProviderId?: string;
    /** The provider's display name, so a row reads without a second lookup. */
    sourceProviderName?: string;

    /**
     * Rewritten from its provider's mapping at every sign-in, and therefore
     * **not editable here**. True exactly when `source` is `provider`; sent as
     * its own field so a control is disabled on a fact rather than on a string
     * comparison.
     */
    managed: boolean;

    /**
     * This activity grant is authoritative inside its activity, and system
     * contributions do not reach it — not even `system:administrator`.
     *
     * **Setting it on somebody who holds system permissions demotes them
     * there**, and the screen has to say so at the moment of the act: otherwise
     * the first sign of it is a manager who has quietly lost a screen.
     *
     * It can also strand its holder. Inside that activity they are whatever the
     * grant says, typically a participant holding no `grant:update`, so clearing
     * it takes another manager of the activity or a system administrator.
     */
    overrideSystem: boolean;
}

export interface GrantInput {
    userId: string;
    activityId?: string;
    permissions: string[];
    /**
     * Ignored where the permissions already settle it: a staff grant is systemic
     * whatever this says. The Server decides, as it must — a flag only the
     * Client maintained is a flag the next caller sets to whatever it likes.
     */
    isSystem?: boolean;
    createdFromTemplate?: string;
    state?: GrantState;
    /**
     * Make this activity grant authoritative inside its activity. Ignored at
     * system scope, where there is nothing to override.
     *
     * There is deliberately no field naming a provider: this writes the manual
     * contribution and only that one.
     */
    overrideSystem?: boolean;
}

/**
 * An identity provider this installation trusts.
 *
 * **No secret is ever readable.** The Server has no field for one on the way
 * out, so what arrives is whether one is set — and a form showing an empty box
 * where a value exists reads as a loss, which is why the screen has to say so
 * rather than leave it blank.
 */
export interface IdentityProvider {
    id: string;
    /** Appears in the sign-in path and in the redirect URI. Expensive to change. */
    slug: string;
    displayName: string;
    issuer: string;
    clientId: string;
    scopes: string;
    enabled: boolean;
    /** Where a person edits their own details, because they cannot do it here. */
    accountUrl?: string;
    /**
     * Where a person deletes their account **at the provider** — a different
     * address and a different act. Absent means the account screen offers only
     * what this installation can do itself, rather than guessing a URL.
     */
    deletionUrl?: string;
    /** Where in the token the mapped value lives: `groups`, `realm_access.roles`. */
    claimPath: string;
    unmappedBehavior: "deny" | "defaultTemplate";
    defaultTemplateName?: string;
    deletionChannelEnabled: boolean;
    hasClientSecret: boolean;
    hasDeletionSecret: boolean;
    /**
     * The path the provider must send the browser back to, **relative to the API
     * origin**. Sent rather than left to an operator to work out: it has to match
     * exactly on both sides, and a registration that gets it wrong fails at the
     * end of somebody's first sign-in with an error from the provider.
     */
    callbackPath: string;
    mappingRules: MappingRule[];
    /** How many accounts sign in through it. Deleting one with people behind it is refused. */
    linkedAccounts: number;
    createdAt: string;
}

/**
 * One line of the allowlist: this claim value grants this template.
 *
 * **The one place anything points at a permission template.** A grant does not —
 * choosing one copies its permissions and nothing points back — so editing a
 * template touches nobody who already used it. A rule is different: the
 * contribution is re-derived from it at every sign-in, so editing the template it
 * names *does* reach people, at their next sign-in.
 */
export interface MappingRule {
    claimValue: string;
    templateName: string;
}

export interface IdentityProviderInput {
    slug: string;
    displayName: string;
    issuer: string;
    clientId: string;
    /**
     * Required when registering. On an update, **absent means "leave the stored
     * one alone"** — sending back a secret the screen was never given is how a
     * write-only field quietly becomes a readable one.
     */
    clientSecret?: string;
    scopes?: string;
    enabled: boolean;
    accountUrl?: string;
    deletionUrl?: string;
    claimPath?: string;
    unmappedBehavior?: "deny" | "defaultTemplate";
    defaultTemplateName?: string;
    deletionChannelEnabled: boolean;
    deletionSecret?: string;
    /** Replaced wholesale. An empty list clears the allowlist, which is a real instruction. */
    mappingRules?: MappingRule[];
}

/**
 * A request to remove an account, from whichever direction it came.
 *
 * The queue exists because of two rules that both end in "somebody has to look
 * at this": a provider's request waits a day before it is carried out, and an
 * account holding system-scope permissions is never emptied automatically.
 */
export interface DeletionRequest {
    id: string;
    /** `holder` is the person themselves; `provider` is a directory's back channel. */
    channel: "holder" | "provider";
    /**
     * `pending` is inside its window and stoppable. `attention` means the link
     * was removed and the account was **not** emptied, because it holds
     * system-scope permissions.
     */
    state: "pending" | "completed" | "halted" | "attention";
    providerId?: string;
    providerName?: string;
    userId?: string;
    userLogin?: string;
    requestedAt: string;
    /** When it may be carried out. A day after arrival on the provider's channel. */
    executeAfter: string;
    resolvedAt?: string;
    /** What happened, in a sentence, for whoever reads the queue. */
    detail?: string;
}

export interface DeletionRequestFilter {
    page?: number;
    pageSize?: number;
    /** `open` is pending and attention together — what a queue screen wants. */
    state?: "pending" | "attention" | "open";
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
/**
 * Who may read one named attachment on a submission.
 *
 * `participant` means **whoever may read the submission** — its author and the
 * managers — not every participant of the activity. The scope is judged against
 * the file's owner, and a submission's owner is one person's work.
 */
export type AttachmentVisibility = "managersOnly" | "participant";

/**
 * What an activity says about one attachment name.
 *
 * Keyed on the name **within the submission** — `source`, `log`, `details` —
 * never on the uploaded file name, which is `main.cpp` and differs per person.
 *
 * **A name with no rule is `managersOnly`.** A Runner that starts attaching
 * something new must not publish it by arriving: the manager sees a row they did
 * not have before and decides. The cost of being wrong is asymmetric — an
 * over-cautious default is one click, an under-cautious one leaks the tests
 * during a contest.
 */
export interface AttachmentRule {
    name: string;
    visibility: AttachmentVisibility;
}
export type { JoinPolicy, ScoreVisibility, SubmissionFile };

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
    modules: { questions: boolean };
    /**
     * A reference to every document this activity publishes. What exists is what
     * has one; there is no flag beside them saying so.
     */
    documents: ActivityDocumentRef[];
    scoreVisibility: ScoreVisibility;
    /**
     * Who reads each named attachment a submission carries.
     *
     * Replaces `logVisibility`, which was this table with one row in it and no
     * way to add another. A Runner attaches a log, a per-test document and
     * whatever else the problem type produces, and they are not equally public:
     * a diff of the failing input is a teaching aid in a course and a leak in a
     * contest, which is an activity's decision and nobody else's.
     */
    attachmentVisibility: AttachmentRule[];
    /**
     * Free display metadata for the activity list, e.g. `Prowadzący: Jan
     * Kowalski`. Opaque and **absent means none**, never `{}`.
     *
     * It replaces `languages`, which lived here and is now three documents on
     * the assignment: `config` for the Runner, `spec` for the submit form,
     * `props` for a header. A fourth copy on the activity would be the one
     * nothing reads and nothing enforces.
     */
    props?: unknown;
    joinPolicy: JoinPolicy;
    /**
     * Hidden from the activity list of anybody not enrolled — reachable by its
     * address and nothing else.
     *
     * Independent of the policy, so an activity anybody may join can still be
     * link-only. Under `closed` it is what the policy already means, and the
     * screen shows it on and fixed.
     */
    unlisted: boolean;
    /**
     * The join password, under `joinPolicy: "password"`.
     *
     * **A join code, not a credential.** It authenticates nobody and belongs to
     * the activity rather than to a person, so it is neither an end-user password
     * nor an exception to the rule that those do not live in the Server. It is
     * readable by a manager on purpose: the whole use of it is to be put in a
     * link and sent to a class, and a secret its owner cannot read cannot be
     * shared.
     */
    joinPassword?: string;
    /**
     * Take the problems of a finished round away, rather than leaving them
     * readable.
     *
     * Off by default, because a round that is over is over, not secret: a
     * competitor goes back to what they were solving. On for a course that
     * reuses its problems next year.
     */
    hideEndedSeriesProblems: boolean;
    /**
     * Whether a group's ranking row also names who is in it.
     *
     * **A manager's field only.** The participant's `Activity` has no
     * counterpart and must not grow one: a reader is sent the roster or is not,
     * and a flag beside the effect would invite a screen to decide a disclosure
     * the Server has already decided.
     *
     * The Server held this column with **no DTO carrying it** until 2026-08-26,
     * so `ResultsService` read a setting nothing could write and every activity
     * had held the default since groups arrived.
     */
    showGroupMembers: boolean;
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

    /**
     * When somebody decided this exists for the people taking part. Absent means
     * never: it is being prepared, nothing in it opens, and only the people who
     * may edit it can reach it.
     */
    publishedAt?: string;
    seriesCount: number;
    problemCount: number;
    participantCount: number;
    /**
     * Which Runners judge this activity's submissions. Empty is the default
     * pool — every Runner nobody has reserved.
     */
    runnerTags: string[];
    /**
     * How many approved Runners those tags reach.
     *
     * **It counts tags and nothing else**: not problem types, not whether a
     * Runner forwards work. So a number above zero promises nothing, and zero
     * promises that nothing here can be judged — which is the answer worth
     * having on the screen where the tags are typed, because the failure is
     * otherwise silent. The submissions are accepted, queued, and never
     * claimed.
     */
    matchingRunners: number;
}

export interface ActivityInput {
    slug: string;
    name: string;
    type: string;
    rankingType: string;
    timeZone: string;
    startDate?: string;
    endDate?: string;
    modules: { questions: boolean };
    scoreVisibility: ScoreVisibility;
    attachmentVisibility: AttachmentRule[];
    /** Display metadata. Opaque; absent means none. */
    props?: unknown;
    joinPolicy: JoinPolicy;
    unlisted: boolean;
    /** Absent or empty removes it. Meaningful only under `joinPolicy: "password"`. */
    joinPassword?: string;
    /**
     * Take the problems of a finished round away, rather than leaving them
     * readable.
     *
     * Off by default, because a round that is over is over, not secret: a
     * competitor goes back to what they were solving. On for a course that
     * reuses its problems next year.
     */
    hideEndedSeriesProblems: boolean;
    /** Whether a group's ranking row also names who is in it. */
    showGroupMembers: boolean;
    maxUploadBytes: number;
    maxAttachments: number;
    maxSubmissionsPerProblem?: number;
    /** Which Runners judge this activity. Empty is the default pool. */
    runnerTags?: string[];
}

export interface ManagedActivityFilter {
    page?: number;
    pageSize?: number;
    search?: string;
    includeArchived?: boolean;
}

/** One address range a round may be reached from. */
export interface AddressRule {
    /** `10.0.5.0/24`, `2001:db8::/32`. A single machine is a `/32`. */
    network: string,
    /** What a manager calls it — a room number, a building. */
    note?: string,
}

export interface ManagedSeries {
    id: string;
    activityId: string;
    slug: string;
    name: string;
    order: number;
    startDate?: string;
    endDate?: string;
    /** Whether it is running now. The **Server** sets it, from the clock. */
    isOpen: boolean;
    /** Since when a manager has it stopped. Absent means it is not paused. */
    pausedAt?: string;
    /**
     * Whether the pause in force took the statements with it.
     *
     * Answered as the round is paused, and reported back only here: the
     * participant's `Series` has no counterpart, because the Server withholds by
     * leaving `problems` out rather than by asking the reader to. Without it a
     * manager who reloads cannot see what they chose.
     */
    hideProblemsWhilePaused: boolean;
    /** Whether a closed series admits how many problems it holds. */
    revealProblemCount: boolean;
    /**
     * Between these two instants the Server withholds ranking entries. The
     * ranking is assembled in the Client, so anything sent is disclosed —
     * freezing has to happen where the data leaves.
     */
    rankingFreezeAt?: string;
    rankingRevealAt?: string;
    /**
     * When participants may see this round's standings. Absent `from` means the
     * round's own start; absent `to` means for ever.
     *
     * A window per round rather than per activity: an organiser publishes the
     * first round's board while the second is still being fought. Different
     * from the freeze above it — that hides late results within a board, this
     * decides whether there is a board at all.
     */
    rankingVisibleFrom?: string;
    rankingVisibleTo?: string;
    /**
     * How much this round outranks the rest while it runs.
     *
     * **A number, and the number is the meaning.** While it is running, anything
     * of a lower rank is locked for whoever takes part in it; equal ranks survive
     * together, which is what lets two contests share one room. The select prints
     * the rank beside the name for exactly that reason — a manager choosing one
     * has to see what it loses to.
     */
    importance: number;
    /**
     * How far that rank reaches: this activity's own rounds, or every activity
     * the reader takes part in.
     *
     * A course marking one round an examination should not lock its students out
     * of every other course; a laboratory contest should. Both are wanted, so the
     * manager chooses, and `activity` is what a round starts as.
     */
    importanceScope: SeriesImportanceScope;
    /** The ranges it may be reached from. Empty means anywhere. */
    addressRules: AddressRule[];
    /**
     * Off, this round neither hides nor locks — and keeps its rules, so turning
     * it back on restores them. The switch for a wrong list on the day.
     */
    restrictionsEnabled: boolean;
    /**
     * This round's own Runner pools, or **absent** where it takes its
     * activity's.
     *
     * Two states, not three: a round wanting the general Runners while its
     * activity is pinned to a laboratory carries `["default"]` rather than an
     * empty list, so one meaning keeps one spelling.
     */
    runnerTags?: string[];
    /** How many approved Runners the tags in force here reach. */
    matchingRunners: number;
    problems: ManagedSeriesProblem[];
}

export interface PauseInput {
    /** Take the statements away as well, not only the clock. */
    hideProblems: boolean;
}

export interface ResumeInput {
    /** Move the end by however long the pause lasted. */
    extendEnd: boolean;
}

export interface SeriesInput {
    slug: string;
    name: string;
    startDate?: string;
    endDate?: string;
    revealProblemCount: boolean;
    rankingFreezeAt?: string;
    rankingRevealAt?: string;
    /**
     * When participants may see this round's standings. Absent `from` means the
     * round's own start; absent `to` means for ever.
     *
     * A window per round rather than per activity: an organiser publishes the
     * first round's board while the second is still being fought. Different
     * from the freeze above it — that hides late results within a board, this
     * decides whether there is a board at all.
     */
    rankingVisibleFrom?: string;
    rankingVisibleTo?: string;
    /** Absent leaves it alone; on a new round that means `normal`. */
    importance?: number;
    importanceScope?: SeriesImportanceScope;
    /** The whole list, replaced. Absent leaves it alone; empty clears it. */
    addressRules?: AddressRule[];
    restrictionsEnabled?: boolean;
    /**
     * Which Runners judge this round, overriding the activity's. Absent leaves
     * it alone; **empty goes back to inheriting**, as `addressRules` clears
     * itself.
     */
    runnerTags?: string[];
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
    /**
     * **What changes the verdict** — limits, and the toolchains that may be
     * submitted. Opaque to the Server, laid over the package's own `config.yml`
     * by the Runner, and **absent means none** — see
     * `docs/specs/OPAQUE_DOCUMENTS.md`. An object or absent, never a scalar or
     * an array.
     */
    config?: unknown;
    /**
     * **What the submit form is drawn from** — its fields, the toolchains its
     * select offers and their labels. Read by the Client alone.
     *
     * Separate from `config` because they fail differently: a wrong `config` is
     * a wrong result, a wrong `spec` is a broken form. Where they disagree about
     * languages, `config` is what happens — the Runner refuses regardless of
     * what the form offered.
     */
    spec?: unknown;
    /**
     * **Display only** — captions, the languages written out for the header
     * above a statement. Wrong here means an ugly screen and nothing else.
     */
    props?: unknown;
    /**
     * What this problem is worth **here**.
     *
     * The Server rescales what the Runner gave into it —
     * `round(score / scoreMax × maxPoints)` — wherever it reports a number: the
     * submission, the problem's standing, the results feed. Absent keeps the
     * problem's own scale, which is what an assignment that says nothing has.
     *
     * On the assignment rather than on the problem, so the same library problem
     * may be attached twice in one activity and be worth different amounts —
     * a warm-up in one round and the hard one in another.
     *
     * An **ICPC** board is unaffected: it counts solves and penalty minutes, and
     * a point value has nowhere to land in it. This moves a points board, the
     * problem list and the submission's own numbers.
     */
    maxPoints?: number;
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
    /** Absent leaves the assignment with none. */
    config?: unknown;
    spec?: unknown;
    props?: unknown;
    /** Absent keeps the problem's own scale. */
    maxPoints?: number;
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

    /**
     * When somebody decided this exists for the people taking part. Absent means
     * never: it is being prepared, nothing in it opens, and only the people who
     * may edit it can reach it.
     */
    publishedAt?: string;
    currentVersion: number;
    versionCount: number;
    createdAt: string;
    /**
     * How many series assignments point at it. **Deletion is refused while this
     * is above zero** — retiring a problem must not break an activity that ran
     * with it, so the answer there is archiving.
     */
    attachedCount: number;

    /** Whether judging it sends the submission outside. Set at creation and permanent. */
    external: boolean;
}

export interface ManagedProblemVersion {
    id: string;
    version: number;
    createdAt: string;
    createdByName?: string;
    /** What changed, for the manager reading the history later. */
    note?: string;
    /**
     * What the problem type needs to know about **this version of this
     * problem** — `uva@1`'s archive problem number, for instance.
     *
     * **Not the `config` that was here** and went with the middle layer of the
     * configuration chain. That was *settings*; this is *identity*, a fact about
     * the problem that every assignment inherits rather than restates.
     *
     * Opaque, and **absent means none** — never `{}`. Optional here and required
     * by some types: the Server cannot tell which, because it does not read this
     * and must not branch on a problem type.
     */
    props?: unknown;
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

    /**
     * Whether judging it sends the submission outside this installation.
     *
     * **Read once, at creation.** There is no call that changes it afterwards:
     * a local equivalent of an external problem is a new problem with its own
     * slug, which is something somebody decides rather than a box they clear.
     */
    external?: boolean;
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
 * **Everything travels as a reference**, the statement included: the bytes go up
 * through `fileApi` first and the version names their ids. One shape for
 * everything a version holds, and one place — the file endpoint — where bytes
 * are accepted, sized and checksummed.
 */
export interface ProblemVersionInput {
    note?: string;
    /**
     * The statement and its translations, as uploaded files.
     *
     * Absent carries the previous version's statements forward, which is what
     * publishing a corrected package without touching the text should do. An
     * empty array is a different thing and is refused: a version with no
     * statement is a problem nobody can read.
     */
    statements?: NewStatement[];
    /** Absent carries the previous version's forward. */
    props?: unknown;
    /** Attached in this version, beside the ones carried forward. */
    files?: NewProblemFile[];
    /** Carried-forward names that must not be. */
    removedFiles?: string[];
    /** The Runner package. Absent carries the previous version's forward. */
    package?: NewProblemPackage;
}

/**
 * One statement, as an uploaded file.
 *
 * A field of its own rather than an entry in `files`, for the same reason the
 * package has one: the Server should know what it has been handed without
 * matching names against a list of well-known ones. The name follows from the
 * language — `content.md`, `content-en.md` — so nobody types it and nobody can
 * mistype it.
 */
export interface NewStatement {
    /** BCP-47 subtag. Absent is the default statement, `content.md`. */
    language?: string;
    /** As `fileApi.upload` returned it. */
    fileId: string;
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
    /**
     * What the participant declared beside the bytes — the language among it.
     * Opaque: the Server stores it and reads no member of it.
     */
    props?: unknown;
    state: JobState;
    /** Short label from the Runner. Its meaning belongs to the problem type. */
    verdict?: string;
    score?: number;
    maxScore?: number;
    /** How many evaluation jobs it has had. A rejudge adds one. */
    attempts: number;
    /**
     * A manager ruled that this counts towards no standing. On the list as well
     * as the detail, unlike `ipAddress`: no disclosure question, and a manager
     * scanning two hundred rows should not open each.
     */
    excluded: boolean;
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
    /**
     * What the Runner attached for this attempt — its log, its per-test
     * document, whatever else the type produces.
     *
     * A manager sees every one of them whatever the activity's table says: the
     * table decides what reaches a **participant**, and somebody who runs the
     * activity is the person the log was kept for.
     */
    files: SubmissionFile[];
}

export interface ManagedSubmissionDetail extends ManagedSubmission {
    /** Selects the result renderer, as it does on the participant's screen. */
    problemType: string;
    /**
     * Where this arrived from — for a judge asking whether a solution came from
     * outside the examination room.
     *
     * **On the detail and deliberately not on the list.** A column of addresses
     * across two hundred rows is exposure for a question nobody asked of most of
     * them; a judge who wants one opens one.
     *
     * Absent once past the Server's retention window, which is the honest
     * answer: it is not held any more.
     */
    ipAddress?: string;
    /** The browser session, or absent if it had none yet. */
    sessionId?: string;
    /**
     * The name the browser gave itself.
     *
     * **Not evidence.** A page writes it, so it is editable and forgeable by
     * whoever is using the browser, and a room of machines imaged from one disk
     * reports one for all of them. It answers *the same browser, two accounts*
     * and nothing else — do not present it as anything stronger.
     */
    deviceId?: string;
    /** When the ruling was made, and by whom. Absent unless `excluded`. */
    excludedAt?: string;
    excludedBy?: string;
    /**
     * Why, in the manager's own words.
     *
     * Not on the participant's screen — theirs carries the marker alone — but
     * writing about them, so their data export carries it. The form says so.
     */
    exclusionReason?: string;
    /** Newest first. */
    attemptList: ManagedAttempt[];
    /** What was sent. The attachments an evaluation produced are on the attempt. */
    files: SubmissionFile[];
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
export interface MergePreview {
    sourceUserId: string;
    sourceLogin: string;
    sourceName: string;
    sourceIsTemporary: boolean;
    targetUserId: string;
    targetLogin: string;
    targetName: string;
    submissions: number;
    questions: number;
    activities: number;
    activityNames: string[];
    /**
     * Why it would be refused. Empty means it would go through.
     *
     * One reason, and it is not about the work: an account holding permissions
     * over the whole installation is refused, because grants move with a merge
     * and a system grant is privilege rather than work.
     */
    blockers: string[];
}

export interface AccountMerge {
    id: string;
    sourceUserId: string;
    targetUserId: string;
    mergedAt: string;
    mergedByUserId: string;
    /**
     * When the emptied account is anonymised, which is also when an undo stops
     * being offered. Until then it is only blocked, so an undo gives it back
     * whole.
     */
    anonymiseAfter: string;
    sourceAnonymisedAt?: string;
    undoneAt?: string;
    canUndo: boolean;
}

export interface CreatedCredential {
    userId: string;
    username: string;
    password: string;
}


/**
 * A Runner, as the administrator screen shows it.
 *
 * **Almost everything here is reported by the Runner itself** — product and
 * version, the problem types it supports, its key fingerprint and what `lscpu`
 * and `free` say about the machine. The Server records the report and matches
 * jobs against `problemTypes` by equality; it never interprets a type, and the
 * screen never invents a field the Runner did not send.
 *
 * Two fields are not the Runner's: `tags`, which an operator sets to steer work
 * at it, and `address`, which the Server reads from the connection.
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
    /**
     * Where the Server saw the connection come from, not what the machine says
     * about itself: a Runner sees a private interface or a container's address
     * and not what the Server actually talked to. Decided 2026-08-06.
     */
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
        memoryBytes?: number;
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

/**
 * What an operator may change about the installation itself.
 *
 * The name is optional here as it is on `InstanceInfo`: an installation nobody
 * has named shows the product's name alone, and clearing the field is how an
 * operator says so.
 */
export interface AccessKey {
    name: string;
    /** When it was last set. The value is not here and never will be. */
    updatedAt: string;
}

export interface AccessKeyValue {
    name: string;
    value: string;
    /** Absent means it does not expire. Present means do not use it after this. */
    expiresAt?: string;
}

export interface ExternalContent {
    /** The instance switch. Set with the rest of the settings, read here. */
    enabled: boolean;
    hosts: string[];
}

export interface InstanceSettingsInput {
    name?: string;
    localRegistrationEnabled: boolean;
    requireEmail: boolean;
    requireConfirmedEmail: boolean;
    showLogo: boolean;
    showLocalSignIn: boolean;
    /** Whether a person may remove their own account. Shipped on. */
    accountDeletionEnabled: boolean;
    /**
     * Whether submissions may be judged by a service this installation does not
     * run. Shipped off.
     *
     * **Optional on the wire**, where the rest of this object is not: the Server
     * reads its absence as "leave it alone" rather than "turn it off", so a
     * caller that predates the field cannot close the door by saving something
     * else. This screen always sends it.
     */
    externalJudgingEnabled: boolean;
}

/**
 * The mark, for one language or for the instance as a whole.
 *
 * An absent `fileId` removes it: there is no separate call for taking a mark
 * off, because setting it to nothing is what that is.
 */
export interface InstanceLogoInput {
    fileId?: string;
    /** Absent sets the default mark, which every language without one uses. */
    language?: string;
}

/**
 * Setting the theme, by either of its two doors.
 *
 * **One mechanism, not two.** This screen's form sends `theme` and the Server
 * writes the canonical YAML; an operator with a file of their own sends
 * `fileId`. Both end at the same published file, so there is one thing in force
 * and one thing to download. Exactly one of the two — a request stating both is
 * refused, because its author disagrees with themselves.
 */
export interface InstanceThemeInput {
    fileId?: string;
    theme?: ThemeInput;
}

/**
 * What the form sends. **An empty string is absent**: the form sends every
 * field and an untouched one means the product's default rather than a colour.
 */
export interface ThemeInput {
    light?: ThemeColours;
    dark?: ThemeColours;
    fontFamily?: string;
    fontFamilyHeadings?: string;
    fonts?: ThemeFontInput[];
}

export interface ThemeFontInput {
    family: string;
    /** The name the face was uploaded under. Never a path and never a URL. */
    file: string;
    weight?: number;
    style?: string;
}

/** Publishing one face's file under the name a theme calls it by. */
export interface InstanceFontInput {
    fileId: string;
    /** A file name ending `.woff2`. */
    name: string;
}

export type ManagerEventType = "permissionTemplateChanged" | "grantChanged" | "problemChanged"
    | "activityChanged" | "managerSeriesChanged" | "submissionChanged" | "questionChanged" | "userChanged"
    | "runnerChanged" | "instanceChanged";
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

/**
 * Carries the whole series, assignments included: they are edited together.
 *
 * `managerSeriesChanged` on the wire, not `seriesChanged`. The participant event
 * of that name carries a different shape — it requires `series` and `change`,
 * this one has neither and may carry `deletedId` — and the envelope has no
 * scope member to tell them apart. Sharing the name meant this one could never
 * be routed here at all: the transport tests the participant record first.
 */
export type SeriesChangedEvent = ManagerEvent<"managerSeriesChanged", {
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

/**
 * The installation's own settings, mark or documents changed.
 *
 * Carries the whole answer, because that is what every reader of it holds: the
 * shell, the footer and the front page all read one `InstanceInfo`, and a patch
 * would leave them assembling it themselves.
 */
export type InstanceChangedEvent = ManagerEvent<"instanceChanged", {
    instance: InstanceInfo;
}>;

export interface ManagerEventDispatcher {
    addEventListener(type: "permissionTemplateChanged", listener: (evt: PermissionTemplateChangedEvent) => void, signal: AbortSignal): void;
    addEventListener(type: "grantChanged", listener: (evt: GrantChangedEvent) => void, signal: AbortSignal): void;
    addEventListener(type: "problemChanged", listener: (evt: ProblemChangedEvent) => void, signal: AbortSignal): void;
    addEventListener(type: "activityChanged", listener: (evt: ActivityChangedEvent) => void, signal: AbortSignal): void;
    addEventListener(type: "managerSeriesChanged", listener: (evt: SeriesChangedEvent) => void, signal: AbortSignal): void;
    addEventListener(type: "submissionChanged", listener: (evt: SubmissionChangedEvent) => void, signal: AbortSignal): void;
    addEventListener(type: "questionChanged", listener: (evt: QuestionChangedEvent) => void, signal: AbortSignal): void;
    addEventListener(type: "userChanged", listener: (evt: UserChangedEvent) => void, signal: AbortSignal): void;
    addEventListener(type: "runnerChanged", listener: (evt: RunnerChangedEvent) => void, signal: AbortSignal): void;
    addEventListener(type: "instanceChanged", listener: (evt: InstanceChangedEvent) => void, signal: AbortSignal): void;
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

    /** Every group competing in an activity. */
    getGroups(activityId: string, signal: AbortSignal): Promise<ActivityGroup[]>;
    createGroup(activityId: string, input: ActivityGroupInput, signal: AbortSignal): Promise<ActivityGroup>;
    updateGroup(activityId: string, groupId: string, input: ActivityGroupInput, signal: AbortSignal): Promise<ActivityGroup>;
    /** Refused with `group.hasSubmissions` where anything was sent under it. */
    deleteGroup(activityId: string, groupId: string, signal: AbortSignal): Promise<void>;
    /**
     * Moves somebody into a group, or out of every one with `undefined`.
     *
     * Allowed at any time and it moves nothing already sent: each submission
     * stamped its group when it was made.
     */
    setParticipantGroup(activityId: string, userId: string, groupId: string | undefined, signal: AbortSignal): Promise<Grant>;
    setGrant(input: GrantInput, signal: AbortSignal): Promise<Grant>;
    revokeGrant(id: string, signal: AbortSignal): Promise<void>;

    searchUsers(query: string, signal: AbortSignal): Promise<ManagedUserSummary[]>;

    /**
     * The identity providers, behind `provider:manage`.
     *
     * That permission decides what an external directory's groups buy inside
     * this installation, which makes it the most dangerous key after
     * `system:administrator`. Two rules the Server enforces and the screen has to
     * explain: `system:administrator` can never be mapped onto, and nobody may
     * map onto a permission they do not themselves hold.
     */
    getIdentityProviders(signal: AbortSignal): Promise<IdentityProvider[]>;
    createIdentityProvider(input: IdentityProviderInput, signal: AbortSignal): Promise<IdentityProvider>;
    updateIdentityProvider(id: string, input: IdentityProviderInput, signal: AbortSignal): Promise<IdentityProvider>;
    /** Refused while accounts still sign in through it. Disabling is the reversible act. */
    deleteIdentityProvider(id: string, signal: AbortSignal): Promise<void>;

    getDeletionRequests(filter: DeletionRequestFilter, signal: AbortSignal): Promise<Page<DeletionRequest>>;
    /** Stops one inside its window. Refused once the window has closed. */
    haltDeletionRequest(id: string, signal: AbortSignal): Promise<DeletionRequest>;

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
     * What carrying one account's work onto another would move, and what would
     * stop it. Changes nothing.
     *
     * **The preview is the guard.** A manager asserts that two accounts are one
     * person, and nothing but their own care stands behind that — so the screen
     * has to say whose work, how much of it, and onto whom, before anything
     * moves.
     */
    previewMerge(id: string, targetUserId: string, signal: AbortSignal): Promise<MergePreview>;

    mergeAccount(id: string, targetUserId: string, signal: AbortSignal): Promise<AccountMerge>;

    /** Offered only while the emptied account is still whole — the day after. */
    undoMerge(mergeId: string, signal: AbortSignal): Promise<AccountMerge>;
    /**
     * The sessions of one account, as the Server holds them at the moment it
     * answers. Read under `user:read:all`, like everything else on that screen:
     * a session carries an address and a browser, which is more than the account
     * row says about somebody.
     */
    getUserSessions(userId: string, signal: AbortSignal): Promise<UserSession[]>;
    getManagedActivities(signal: AbortSignal): Promise<ManagedActivitySummary[]>;

    /**
     * The installation's own configuration. Every one of these answers with the
     * whole `InstanceInfo`, so the screen and the shell see the result without
     * asking again — and the same document reaches every other tab as an
     * `instanceChanged` event.
     *
     * Read under no permission at all — `getInstanceInfo` is public, because a
     * signed-out screen needs it — and written under `instance:update`.
     */
    updateInstanceSettings(input: InstanceSettingsInput, signal: AbortSignal): Promise<InstanceInfo>;

    /**
     * Where this installation may fetch documents from, and whether it may.
     *
     * **Its own call rather than part of `getInstanceInfo`**, and that is the
     * Server's decision reflected here: whether the door is open is public,
     * because it is the fact a privacy notice is written from; the list of
     * destinations is operational detail and is read by a manager only.
     */
    getExternalContent(signal: AbortSignal): Promise<ExternalContent>;

    /** Which named secrets this installation holds. **Names only** — never values. */
    getAccessKeys(signal: AbortSignal): Promise<AccessKey[]>;

    /**
     * Sets one, or removes it when the value is empty.
     *
     * **Write-only through here.** The answer says which keys are set and when,
     * never what they are — the one endpoint that hands a value back is a
     * different call, made by whoever needs the key rather than by this screen.
     */
    setAccessKey(name: string, value: string, signal: AbortSignal): Promise<AccessKey[]>;

    /**
     * Asks for the credential this installation can produce for a named service.
     *
     * **What comes back is not always what is stored.** `uvaexplorer` answers
     * with an hourly token the Server minted from the stored key, carrying an
     * `expiresAt`; the long-lived key never leaves the Server, because the picker
     * puts whatever it is given into an iframe address. Every other name answers
     * with the stored value and no expiry, as they always have.
     *
     * **`expiresAt` is binding.** Where it is present the value is good only
     * until then — ask again rather than keep it.
     *
     * The gate is on the Server and is chosen by the key's name, so asking for
     * one this manager may not have is a refusal rather than an answer.
     *
     * **A 404 is an answer, not a fault.** It means this installation holds no
     * such key, and for the picker that is anonymous browsing rather than a
     * failure. A refusal carrying an `accessKey.*` code is the other thing: a key
     * is configured and could not be spent.
     */
    requestAccessKey(name: string, signal: AbortSignal): Promise<AccessKeyValue>;

    /**
     * Has the Server fetch a document and store it as an ordinary file.
     *
     * For the one thing a browser cannot do: a host that sends no
     * `Access-Control-Allow-Origin` cannot be read from here. What comes back is
     * the same file an upload would have produced.
     */
    fetchFile(url: string, signal: AbortSignal): Promise<UploadedFile>;

    /** Replaces the list, whole. An empty one means this installation fetches nothing. */
    setExternalContentHosts(hosts: string[], signal: AbortSignal): Promise<ExternalContent>;
    setInstanceLogo(input: InstanceLogoInput, signal: AbortSignal): Promise<InstanceInfo>;
    /**
     * Publishes a revision of one document, in every language it has.
     *
     * The text was uploaded through `fileApi` first, exactly as a problem
     * version's statement is, and what arrives here is a list of ids. The
     * revision comes into force now; earlier ones stay readable at their own
     * dates.
     */
    publishInstanceDocument(kind: InstanceDocumentKind, statements: NewStatement[], signal: AbortSignal): Promise<InstanceInfo>;
    /**
     * Stops publishing one. Its links disappear with its references — nothing
     * lists a document that has none — and the revisions already published stay
     * readable at their dates.
     */
    unpublishInstanceDocument(kind: InstanceDocumentKind, signal: AbortSignal): Promise<InstanceInfo>;
    /** Every revision of one document, newest first, including superseded ones. */
    getInstanceDocumentHistory(kind: InstanceDocumentKind, signal: AbortSignal): Promise<InstanceDocumentRef[]>;

    /**
     * Sets the operator's colours and typeface, from the form or from a file.
     * Answers the whole instance, so the shell repaints without being told.
     */
    setInstanceTheme(input: InstanceThemeInput, signal: AbortSignal): Promise<InstanceInfo>;
    /** Withdraws it, and the installation is back on the theme this Client ships. */
    clearInstanceTheme(signal: AbortSignal): Promise<InstanceInfo>;
    /**
     * The faces this installation has stored, whether or not the theme uses
     * them — `/instance` lists only the ones in force, so a face uploaded and
     * not yet declared is invisible without this.
     */
    getInstanceFonts(signal: AbortSignal): Promise<string[]>;
    /** Publishes one face. The file was uploaded through `fileApi` first. */
    addInstanceFont(input: InstanceFontInput, signal: AbortSignal): Promise<InstanceInfo>;
    /** Withdraws one. Refused while the published theme still draws with it. */
    removeInstanceFont(name: string, signal: AbortSignal): Promise<InstanceInfo>;

    getActivities(filter: ManagedActivityFilter, signal: AbortSignal): Promise<Page<ManagedActivity>>;
    /** Accepts an id or a slug: the manager's URLs read like the participant's. */
    getActivity(idOrSlug: string, signal: AbortSignal): Promise<ManagedActivity>;
    createActivity(input: ActivityInput, signal: AbortSignal): Promise<ManagedActivity>;
    updateActivity(id: string, input: ActivityInput, signal: AbortSignal): Promise<ManagedActivity>;
    /** The ordinary way an activity ends. Readable, accepting nothing new. */
    setActivityArchived(id: string, archived: boolean, signal: AbortSignal): Promise<ManagedActivity>;

    /**
     * Says an activity exists for the people taking part, or takes that back.
     *
     * **Withdrawing does not undo what happened.** Rounds already opened stay
     * open in every record of them; this stops the scheduler and hides the
     * activity, which is the most an unpublish can honestly claim.
     */
    setActivityPublished(
        id: string, published: boolean, signal: AbortSignal): Promise<ManagedActivity>;

    /**
     * Copies an activity for a new run of it: the rounds, the assignments and
     * the settings, with every date moved so the first round starts at
     * `startsAt`. Nothing that happened travels, and the copy arrives
     * unpublished.
     */
    duplicateActivity(
        id: string, slug: string, startsAt: string,
        signal: AbortSignal): Promise<ManagedActivity>;
    /**
     * Destroys the submissions participants may still want to look back at,
     * which is why it is a permission of its own and not in the manager
     * template. Refused while the activity holds anything.
     */
    deleteActivity(id: string, signal: AbortSignal): Promise<void>;

    /**
     * Publishes a revision of one activity document, in every language it has.
     *
     * The same shape as the instance's, and for the same reason: the text goes
     * up through `fileApi` and what arrives here is a list of ids. Answers with
     * the refreshed activity, so the screen and the shell get the new references
     * without asking again.
     */
    publishActivityDocument(activityId: string, kind: ActivityDocumentKind, statements: NewStatement[], signal: AbortSignal): Promise<ManagedActivity>;
    /**
     * Stops publishing one. Its references go and its links go with them — the
     * navigation, the enrolment form's acceptance box, the activity's own page.
     */
    unpublishActivityDocument(activityId: string, kind: ActivityDocumentKind, signal: AbortSignal): Promise<ManagedActivity>;
    /** Every revision of one activity document, newest first. */
    getActivityDocumentHistory(activityId: string, kind: ActivityDocumentKind, signal: AbortSignal): Promise<ActivityDocumentRef[]>;

    getSeries(activityId: string, signal: AbortSignal): Promise<ManagedSeries[]>;
    createSeries(activityId: string, input: SeriesInput, signal: AbortSignal): Promise<ManagedSeries>;
    updateSeries(seriesId: string, input: SeriesInput, signal: AbortSignal): Promise<ManagedSeries>;
    /** Refused once anything has been submitted to it. */
    deleteSeries(seriesId: string, signal: AbortSignal): Promise<void>;

    /**
     * Copies a round with the problems assigned to it, into this activity or
     * another. `targetActivityId` absent copies in place.
     *
     * **The problems are referenced, not copied.** Two activities setting the
     * same problem is what the library is for; duplicating it would mean a
     * correction reaching one of them.
     *
     * An assignment slug is unique across an *activity*, so a copy made in
     * place is suffixed — the answer comes back with the slugs it actually got.
     */
    duplicateSeries(
        seriesId: string, targetActivityId: string | undefined, slug: string, startsAt: string,
        signal: AbortSignal): Promise<ManagedSeries>;

    /**
     * Moves every instant the series holds by `minutes` — its start, its end,
     * and the ranking freeze and reveal with them.
     *
     * A delta rather than two new dates, because two managers each moving a
     * delayed round by ten minutes from the same screen would otherwise both
     * write **+10** and lose one of the shifts. The freeze travels because a
     * round delayed by ten minutes whose freeze stayed at the old wall clock
     * would freeze the wrong hour.
     *
     * Negative moves it earlier.
     */
    shiftSeries(seriesId: string, minutes: number, signal: AbortSignal): Promise<ManagedSeries>;

    /**
     * Stops a running series: nothing is accepted for it and the countdown
     * stands still.
     *
     * `hideProblems` also takes the statements away — `isOpen` goes false —
     * which is for a leak or a mistake in a statement rather than for an
     * ordinary interruption. Taking a problem off the screen of somebody in the
     * middle of it is violent, and they have read it already.
     */
    pauseSeries(seriesId: string, input: PauseInput, signal: AbortSignal): Promise<ManagedSeries>;

    /**
     * Starts it again. `extendEnd` gives the interruption back by moving the end
     * by however long the pause lasted, which is what pausing exists for; without
     * it every date is left alone.
     */
    resumeSeries(seriesId: string, input: ResumeInput, signal: AbortSignal): Promise<ManagedSeries>;
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
    /**
     * Rules that a submission counts towards no standing, or lifts the ruling.
     *
     * Neither a rejudge nor a cancellation — those are about evaluating, this
     * about what the evaluation counts for. Lifting clears the reason with it.
     */
    setSubmissionExcluded(
        id: string, excluded: boolean, reason: string | undefined, signal: AbortSignal,
    ): Promise<ManagedSubmissionDetail>;

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
     * Every statement stored for one version — the default and each translation,
     * as **references**.
     *
     * The text is fetched with `fileApi.getText`, which is also how it was put
     * there. This used to answer with the content inline while
     * `createProblemVersion` took ids, so the editor read one way and wrote
     * another; the two halves now use one road.
     */
    getProblemContent(problemId: string, versionId: string, signal: AbortSignal): Promise<StatementRef[]>;
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

    /**
     * Asks for a package to be timed, attached to no problem.
     *
     * **Not a submission**: it produces timings rather than a verdict, belongs
     * to nobody's standing and appears on no board. `activityIdOrSlug` says
     * where permission is asked for; **absent means the library**, which is
     * what a manager calibrating a problem before it is attached anywhere
     * needs (D-16).
     */
    requestTrial(input: NewTrial, signal: AbortSignal): Promise<Trial>;

    /** One trial, as it stands. Polled until it settles. */
    getTrial(trialId: string, signal: AbortSignal): Promise<Trial>;
}

export interface NewTrial {
    problemType: string;
    packageFileId: string;
    activityIdOrSlug?: string;
}

export interface Trial {
    id: string;
    /** Absent when it was asked for against the library. */
    activityId?: string;
    state: JobState;
    problemType: string;
    createdAt: string;
    finishedAt?: string;
    /** Why it failed, where it did. **Never a verdict.** */
    failureReason?: string;
    /**
     * What was measured, as the problem type states it — a JSON document the
     * Server stores without reading. Parsed by whoever knows the type, and by
     * nobody else.
     */
    measurement?: string;
    /** False once it finishes: the bytes do not survive the trial (D-12). */
    hasPackage: boolean;
}
