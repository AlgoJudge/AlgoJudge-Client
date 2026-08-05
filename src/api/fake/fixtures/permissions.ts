import { Grant, ManagedActivitySummary, ManagedUserSummary, PermissionDefinition, PermissionTemplate } from "../../ManagerApi";

/**
 * The permission catalogue and the shipped templates.
 *
 * Mirrors `docs/specs/PERMISSIONS.md`. In the real product this list comes from
 * the Server, because the Server is what enforces it; here it is the fixture
 * standing in for that endpoint, and the two must not drift.
 */

const definition = (key: string, group: string, scope: PermissionDefinition["scope"]): PermissionDefinition =>
    ({ key, group, scope });

export const PERMISSION_CATALOGUE: PermissionDefinition[] = [
    definition("activity:read", "activity", "activity"),
    definition("activity:create", "activity", "global"),
    definition("activity:update", "activity", "both"),
    definition("activity:archive", "activity", "both"),
    definition("activity:delete", "activity", "both"),
    definition("activity:enroll", "activity", "both"),

    definition("problem:read:own", "problem", "global"),
    definition("problem:read:all", "problem", "global"),
    definition("problem:create", "problem", "global"),
    definition("problem:update", "problem", "global"),
    definition("problem:delete", "problem", "global"),
    definition("problem:share", "problem", "global"),
    definition("problem:archive", "problem", "global"),
    definition("problem:attach", "problem", "both"),

    definition("submission:read:own", "submission", "activity"),
    definition("submission:read:all", "submission", "both"),
    definition("submission:create", "submission", "activity"),
    definition("submission:source:read:all", "submission", "both"),
    definition("submission:rejudge", "submission", "both"),
    definition("submission:cancel", "submission", "both"),

    definition("result:read:own", "result", "activity"),
    definition("result:read:all", "result", "both"),
    definition("result:log:read:all", "result", "both"),

    definition("question:read:own", "question", "activity"),
    definition("question:read:all", "question", "activity"),
    definition("question:create", "question", "activity"),
    definition("question:answer", "question", "activity"),
    definition("question:publish", "question", "activity"),
    definition("announcement:create", "question", "activity"),

    definition("ranking:read", "ranking", "activity"),
    definition("ranking:read:unfrozen", "ranking", "both"),
    definition("ranking:unfreeze", "ranking", "both"),

    definition("user:read:all", "user", "global"),
    definition("user:create", "user", "global"),
    definition("user:update", "user", "global"),
    definition("user:block", "user", "global"),
    definition("user:create:temporary", "user", "both"),

    definition("grant:read:all", "grant", "both"),
    definition("grant:update", "grant", "both"),

    definition("template:read", "template", "global"),
    definition("template:manage", "template", "global"),

    definition("runner:read", "runner", "global"),
    definition("runner:approve", "runner", "global"),
    definition("runner:revoke", "runner", "global"),
    definition("runner:update", "runner", "global"),

    definition("system:administrator", "system", "global"),
];

const PARTICIPANT = [
    "activity:read",
    "submission:read:own",
    "submission:create",
    "result:read:own",
    "question:read:own",
    "question:create",
    "ranking:read",
];

const MANAGER = [
    ...PARTICIPANT,
    "activity:update", "activity:archive", "activity:enroll",
    "problem:read:own", "problem:create", "problem:update",
    "problem:share", "problem:archive", "problem:attach",
    "submission:read:all", "submission:source:read:all",
    "submission:rejudge", "submission:cancel",
    "result:read:all", "result:log:read:all",
    "question:read:all", "question:answer", "question:publish",
    "announcement:create",
    "ranking:read:unfrozen", "ranking:unfreeze",
    "user:create:temporary",
    "grant:read:all", "grant:update",
];

export const createTemplates = (): PermissionTemplate[] => [
    {
        id: "018f2c00-0000-7000-8000-0000000000a1",
        name: "participant",
        description: "Bierze udział: rozwiązuje zadania i widzi swoje wyniki.",
        permissions: [...PARTICIPANT],
        isBuiltIn: true,
    },
    {
        id: "018f2c00-0000-7000-8000-0000000000a2",
        name: "manager",
        description: "Prowadzi aktywność: zadania, zgłoszenia, pytania, zapisy.",
        permissions: [...MANAGER],
        isBuiltIn: true,
    },
    {
        id: "018f2c00-0000-7000-8000-0000000000a3",
        // One entry, because it bypasses the rest. An administrator with a list
        // of individual permissions is an administrator who can be trimmed.
        name: "admin",
        description: "Administruje instalacją. Omija wszystkie sprawdzenia.",
        permissions: ["system:administrator"],
        isBuiltIn: true,
    },
    {
        id: "018f2c00-0000-7000-8000-0000000000a4",
        name: "jury",
        description: "Widzi zgłoszenia i odpowiada na pytania, nie zmienia ustawień.",
        permissions: [
            "activity:read",
            "submission:read:all", "result:read:all", "result:log:read:all",
            "question:read:all", "question:answer", "question:publish",
            "ranking:read", "ranking:read:unfrozen",
        ],
        isBuiltIn: false,
    },
];

/**
 * The name and the login come from the account list rather than being written
 * here beside each grant: a fixture that spells the name a second time is a
 * fixture that can spell it differently, and the two screens would then disagree
 * about who somebody is.
 */
const named = (grant: Omit<Grant, "userName" | "userLogin">): Grant => {
    const user = MANAGED_USERS.find(u => u.id === grant.userId);
    return {
        ...grant,
        userName: user?.name ?? grant.userId,
        userLogin: user?.username ?? grant.userId,
    };
};

export const createGrants = (): Grant[] => [
    named({
        id: "018f2c00-0000-7000-8000-0000000000b1",
        userId: "user-admin",
        permissions: ["system:administrator"],
        createdFromTemplate: "admin",
        state: "active",
        createdAt: new Date(Date.now() - 86400000 * 400).toISOString(),
    }),
    named({
        id: "018f2c00-0000-7000-8000-0000000000b2",
        userId: "user-kowalski",
        activityId: "018f2c00-0000-7000-8000-000000000002",
        activityName: "Programowanie 1 — grupa LA",
        permissions: [...MANAGER],
        createdFromTemplate: "manager",
        state: "active",
        createdAt: new Date(Date.now() - 86400000 * 30).toISOString(),
    }),
    named({
        // A manager with one right taken away — the case that would need a second
        // role in a model that unioned them, and is one edited set here.
        id: "018f2c00-0000-7000-8000-0000000000b3",
        userId: "user-wisniewski",
        activityId: "018f2c00-0000-7000-8000-000000000001",
        activityName: "Akademickie Mistrzostwa Polski 2019",
        permissions: MANAGER.filter(p => p !== "activity:update"),
        createdFromTemplate: "manager",
        state: "active",
        createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
    }),
    named({
        id: "018f2c00-0000-7000-8000-0000000000b4",
        userId: "user-me",
        activityId: "018f2c00-0000-7000-8000-000000000001",
        activityName: "Akademickie Mistrzostwa Polski 2019",
        permissions: [...PARTICIPANT],
        createdFromTemplate: "participant",
        state: "active",
        createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    }),
    named({
        // The same person managing one course and taking part in one contest,
        // which is the ordinary case in a department. It is also what makes the
        // questions screen reachable: answering is an activity-scoped
        // permission, so nobody holds it from the system scope.
        id: "018f2c00-0000-7000-8000-0000000000b6",
        userId: "user-me",
        activityId: "018f2c00-0000-7000-8000-000000000002",
        activityName: "Programowanie 1 — grupa LA",
        permissions: [...MANAGER],
        createdFromTemplate: "manager",
        state: "active",
        createdAt: new Date(Date.now() - 86400000 * 20).toISOString(),
    }),
    named({
        id: "018f2c00-0000-7000-8000-0000000000b5",
        userId: "user-nowak",
        activityId: "018f2c00-0000-7000-8000-000000000005",
        activityName: "Warsztat interaktywny",
        permissions: [...PARTICIPANT],
        createdFromTemplate: "participant",
        state: "invited",
        createdAt: new Date(Date.now() - 3600000).toISOString(),
    }),
];

/**
 * What the signed-in manager holds. Anything outside this cannot be granted on.
 *
 * It starts with the participant set on purpose. "Nobody may grant a permission
 * they do not hold" is otherwise self-defeating: enrolling someone means giving
 * them `activity:read` and `submission:create`, and a manager who did not hold
 * those could not enrol anybody. A manager of an activity is also in it.
 */
export const MY_SYSTEM_PERMISSIONS = [
    ...PARTICIPANT,
    "template:read", "template:manage",
    "grant:read:all", "grant:update",
    "user:read:all", "user:create", "user:update", "user:block", "user:create:temporary",
    "activity:create", "activity:update", "activity:archive", "activity:enroll",
    "problem:read:own", "problem:create", "problem:update", "problem:share",
    "problem:archive", "problem:attach",
    "submission:read:all", "submission:source:read:all", "submission:rejudge", "submission:cancel",
    "result:read:all", "result:log:read:all",
    "ranking:read:unfrozen", "ranking:unfreeze",
    "runner:read", "runner:approve", "runner:revoke", "runner:update",
];

export const MANAGED_USERS: ManagedUserSummary[] = [
    { id: "user-admin", username: "john", name: "John Smith", email: "john.smith@algojudge.pl" },
    { id: "user-kowalski", username: "jkowalski", name: "Jan Kowalski", email: "j.kowalski@example.edu.pl" },
    { id: "user-wisniewski", username: "twisniewski", name: "Tomasz Wiśniewski", email: "t.wisniewski@example.edu.pl" },
    { id: "user-nowak", username: "anowak", name: "Anna Nowak", email: "a.nowak@example.edu.pl" },
    { id: "user-me", username: "amy", name: "Amy Horsefighter", email: "amy@example.edu.pl" },
    { id: "user-lis", username: "alis", name: "Agnieszka Lis", email: "a.lis@example.edu.pl" },
];

export const MANAGED_ACTIVITIES: ManagedActivitySummary[] = [
    { id: "018f2c00-0000-7000-8000-000000000001", slug: "AMMPZ-2019", name: "Akademickie Mistrzostwa Polski 2019" },
    { id: "018f2c00-0000-7000-8000-000000000002", slug: "PROG-1-LA", name: "Programowanie 1 — grupa LA" },
    { id: "018f2c00-0000-7000-8000-000000000004", slug: "TRENING-OTWARTY", name: "Trening otwarty" },
    { id: "018f2c00-0000-7000-8000-000000000005", slug: "WARSZTAT-9", name: "Warsztat interaktywny" },
];
