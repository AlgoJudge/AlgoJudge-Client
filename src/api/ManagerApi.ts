import { Event } from "./Event";
import { Page } from "./ParticipantApi";

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
    files: { name: string; scope: "participant" | "manager" | "runner"; sizeBytes: number }[];
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
    /** The statement, as a `content.md` document. */
    content?: unknown;
    config?: unknown;
}

export type ManagerEventType = "permissionTemplateChanged" | "grantChanged" | "problemChanged";
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

export interface ManagerEventDispatcher {
    addEventListener(type: "permissionTemplateChanged", listener: (evt: PermissionTemplateChangedEvent) => void, signal: AbortSignal): void;
    addEventListener(type: "grantChanged", listener: (evt: GrantChangedEvent) => void, signal: AbortSignal): void;
    addEventListener(type: "problemChanged", listener: (evt: ProblemChangedEvent) => void, signal: AbortSignal): void;
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
    /** The stored `content.md` for one version, or undefined when it has none. */
    getProblemContent(problemId: string, versionId: string, signal: AbortSignal): Promise<unknown>;
    /** Publishes a new version. Versions are append-only; nothing is edited in place. */
    createProblemVersion(problemId: string, input: ProblemVersionInput, signal: AbortSignal): Promise<ManagedProblemVersion>;
    /**
     * Attaches the Runner package to a version.
     *
     * The archive is assembled in the Client, because its layout belongs to the
     * problem type and the Server is not allowed to know one type from another.
     * The Server stores the bytes under `FileScope.Runner`.
     */
    uploadProblemPackage(problemId: string, versionId: string, archive: Blob, signal: AbortSignal): Promise<ManagedProblemVersion>;
}
