import {
    Icon, IconAlignBoxCenterTop, IconBox, IconBuildingCommunity, IconDevicesPc, IconIdBadge2, IconKey,
    IconListDetails, IconMessageQuestion, IconNotes, IconPrinter, IconProps, IconServer, IconUserCheck,
    IconUsers, IconWorldWww,
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
    icon: React.ForwardRefExoticComponent<IconProps & React.RefAttributes<Icon>>;
    /** Any one of these admits. Empty means every manager. */
    permissions: string[];
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
    },
    {
        to: "/manager/grants",
        label: "Grants",
        description: "Who may do what, in the system and in each activity.",
        icon: IconKey,
        permissions: ["grant:read:all"],
    },
    {
        to: "/manager/permission-templates",
        label: "Permission templates",
        description: "The sets a grant starts from, and the ones that ship.",
        icon: IconUserCheck,
        permissions: ["template:read"],
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
        description: "Contests and courses: series, assignments, times and enrolment.",
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
    { to: "/manager/lti", label: "LTI platforms", description: "", icon: IconAlignBoxCenterTop, permissions: [], soon: true },
    { to: "/manager/external-content", label: "External content", description: "", icon: IconWorldWww, permissions: [], soon: true },
    { to: "/manager/workstations", label: "Workstations", description: "", icon: IconDevicesPc, permissions: [], soon: true },
    { to: "/manager/printers", label: "Printers", description: "", icon: IconPrinter, permissions: [], soon: true },
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

/** What a path needs, for the route guard. Longest match wins. */
export const areaFor = (path: string): ManagerArea | undefined =>
    [...BUILT_AREAS]
        .sort((a, b) => b.to.length - a.to.length)
        .find(area => path === area.to || path.startsWith(`${area.to}/`));
