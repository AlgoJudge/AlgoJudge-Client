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

export type ManagerEventType = "permissionTemplateChanged" | "grantChanged";
export type ManagerEvent<T extends ManagerEventType, V> = Event<T, V>;

export type PermissionTemplateChangedEvent = ManagerEvent<"permissionTemplateChanged", {
    template?: PermissionTemplate;
    deletedId?: string;
}>;

export type GrantChangedEvent = ManagerEvent<"grantChanged", {
    grant?: Grant;
    deletedId?: string;
}>;

export interface ManagerEventDispatcher {
    addEventListener(type: "permissionTemplateChanged", listener: (evt: PermissionTemplateChangedEvent) => void, signal: AbortSignal): void;
    addEventListener(type: "grantChanged", listener: (evt: GrantChangedEvent) => void, signal: AbortSignal): void;
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
}
