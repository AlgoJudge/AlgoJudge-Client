import {
    IconAlignBoxCenterTop, IconBox, IconBuildingCommunity, IconDevicesPc, IconIdBadge2, IconKey,
    IconListDetails, IconMessageQuestion, IconNotes, IconPrinter, IconServer, IconUserCheck,
    IconUsers, IconWorldWww, TablerIcon,
} from "@tabler/icons-react";

/**
 * The manager panel, as one list.
 *
 * The sidebar, the landing screen and the route guard all read it, so what a
 * person may open, what they are offered, and what they are told about cannot
 * drift apart — which is exactly how a menu ends up listing a screen that
 * answers 403.
 *
 * `permissions` is a disjunction: holding **any** of them admits. They are
 * checked against what the caller holds *anywhere* (`getMyAccess`), because a
 * person who manages one activity and nothing else still needs the panel that
 * activity lives in.
 */
export interface ManagerArea {
    to: string;
    /** English label and description; both are translation keys. */
    label: string;
    description: string;
    icon: TablerIcon;
    /** Any one of these admits. Empty means every manager. */
    permissions: string[];
    /**
     * Whether the keys above have to be held **at system scope**.
     *
     * The default is the union across scopes, which is what a menu wants:
     * somebody who manages one activity still needs the panel it lives in. An
     * area the installation owns is the exception — see the Users entry.
     */
    systemScope?: boolean;
    /** Planned, not built: shown dead so the shape of the product is legible. */
    soon?: boolean;
}

export const MANAGER_AREAS: ManagerArea[] = [
    {
        to: "/manager/users",
        label: "Users",
        description: "Accounts, temporary logins in bulk, blocking and notes.",
        icon: IconUsers,
        permissions: ["user:read:all"],
        // **At system scope, and it is the only area that says so.** The key
        // joined the shipped `manager` role on 2026-09-14 so that an activity's
        // manager can look somebody up to enroll them — and this screen is still
        // the installation's: it lists every account, blocks them and merges
        // them, and `UserService.ListAsync` goes on asking at system scope. Read
        // as a union, the card appeared for every manager and the list behind it
        // refused, which is the one thing this table exists to prevent.
        systemScope: true,
    },
    {
        to: "/manager/grants",
        label: "Grants",
        description: "Who may do what, in the system and in each activity.",
        icon: IconKey,
        permissions: ["grant:read:all"],
    },
    {
        to: "/manager/roles",
        label: "Roles",
        description: "The sets a grant points at. Editing one reaches everybody holding it.",
        icon: IconUserCheck,
        // Both keys, because a manager grant written before roles existed holds
        // the second and not the first — and applying a role is the reason to
        // read one.
        permissions: ["role:read", "grant:update"],
    },
    {
        to: "/manager/problems",
        label: "Problems",
        description: "The library: statements, attachments, packages and versions.",
        icon: IconNotes,
        permissions: ["problem:read:own", "problem:read:all"],
    },
    {
        to: "/manager/activities",
        label: "Activities",
        description: "Contests and courses: series, assignments, times and enrollment.",
        icon: IconListDetails,
        permissions: ["activity:create", "activity:update", "activity:archive"],
    },
    {
        to: "/manager/submissions",
        label: "Submissions",
        description: "Every submission, its source, its attempts and a rejudge.",
        icon: IconBox,
        permissions: ["submission:read:all"],
    },
    {
        to: "/manager/questions",
        label: "Questions and announcements",
        description: "Answering, publishing an answer to everyone, announcing.",
        icon: IconMessageQuestion,
        permissions: ["question:read:all", "question:answer"],
    },
    {
        to: "/manager/runners",
        label: "Runners",
        description: "The machines that evaluate: approval, tags and their reports.",
        icon: IconServer,
        permissions: ["runner:read"],
    },
    {
        to: "/manager/instance",
        label: "Instance",
        description: "What this installation is called, the mark it shows, and the documents it publishes.",
        icon: IconBuildingCommunity,
        permissions: ["instance:update"],
    },
    {
        to: "/manager/oidc",
        label: "External logins",
        description: "Identity providers, what a claim from one grants, and the accounts asked to go.",
        icon: IconIdBadge2,
        permissions: ["provider:manage"],
    },
    // Directions rather than features. No permission of their own: they are dead
    // entries that lead nowhere and disclose nothing, and hiding them would make
    // the product look smaller than the plan it is being built to.
    {
        to: "/manager/lti",
        label: "LTI platforms",
        description: "Course platforms that may open activities for their students.",
        icon: IconAlignBoxCenterTop,
        // The same permission the OIDC providers sit behind, because registering
        // a platform writes a provider row: it is the same decision about who
        // this installation trusts to vouch for people.
        permissions: ["provider:manage"],
    },
    {
        to: "/manager/external-content",
        label: "External content",
        description: "Where this installation may fetch documents from, and whether it may at all.",
        icon: IconWorldWww,
        // The same permission as the rest of the installation's settings: this
        // is one of them, and turning it on is the same kind of decision.
        permissions: ["instance:update"],
    },
    { to: "/manager/workstations", label: "Workstations", description: "", icon: IconDevicesPc, permissions: [], soon: true },
    {
        to: "/manager/printouts",
        label: "Printouts",
        description: "The queue of source somebody asked to have on paper.",
        icon: IconPrinter,
        // **The one area a person can be given on its own.** A grant carrying
        // this key and no other opens this and refuses the rest of the panel,
        // which is what the key exists for — `MANAGER_PERMISSIONS` derives from
        // this array, so holding it is also what admits them to `/manager` at
        // all.
        permissions: ["printout:manage"],
    },
];

/** The areas that exist, with what each of them requires. */
export const BUILT_AREAS = MANAGER_AREAS.filter(area => !area.soon);

/**
 * Everything that opens any part of the panel.
 *
 * Holding none of these means the manager panel has nothing in it for you, so
 * neither the entry nor the landing screen appears.
 */
export const MANAGER_PERMISSIONS: string[] = [
    ...new Set(BUILT_AREAS.flatMap(area => area.permissions)),
];

/**
 * Whether this reader may open an area.
 *
 * One predicate, so the sidebar, the landing screen and the route guard cannot
 * disagree about a scope the way they would if each spelled the test out.
 */
export const admits = (
    area: ManagerArea,
    hasAny: (permissions: readonly string[]) => boolean,
    hasAtSystemScope: (permission: string) => boolean,
): boolean => area.permissions.length === 0
    || (area.systemScope
        ? area.permissions.some(hasAtSystemScope)
        : hasAny(area.permissions));

/** What a path needs, for the route guard. Longest match wins. */
export const areaFor = (path: string): ManagerArea | undefined =>
    [...BUILT_AREAS]
        .sort((a, b) => b.to.length - a.to.length)
        .find(area => path === area.to || path.startsWith(`${area.to}/`));
