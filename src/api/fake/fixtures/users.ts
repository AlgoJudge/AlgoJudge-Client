import { ManagedUser } from "../../ManagerApi";
import { MANAGED_USERS } from "./permissions";

/**
 * Accounts, as the users screen shows them.
 *
 * Built from the same list the grant editor uses, so the two screens cannot
 * disagree about who exists, plus the temporary accounts a contest creates in
 * bulk — including one blocked and one expired, which are the states the screen
 * is most likely to get wrong.
 */

const daysAgo = (days: number) => new Date(Date.now() - days * 86400000).toISOString();
const daysAhead = (days: number) => new Date(Date.now() + days * 86400000).toISOString();

const KNOWN: Partial<Record<string, Partial<ManagedUser>>> = {
    "user-admin": { tags: ["staff"], createdAt: daysAgo(400), lastSeenAt: daysAgo(0), note: "Administrator instancji" },
    "user-me": { tags: ["staff"], createdAt: daysAgo(380), lastSeenAt: daysAgo(0) },
    "user-kowalski": { tags: ["PROG-1-LA"], createdAt: daysAgo(200), lastSeenAt: daysAgo(1) },
    "user-wisniewski": { tags: ["PROG-1-LA"], createdAt: daysAgo(200), lastSeenAt: daysAgo(3) },
    "user-nowak": {
        tags: ["PROG-1-LA"],
        createdAt: daysAgo(190),
        lastSeenAt: daysAgo(0),
        // Registered on her own and still waiting: the state an installation
        // that approves by hand spends most of its time in.
        approvedAt: undefined,
        emailConfirmed: false,
    },
    "user-lis": {
        tags: [],
        createdAt: daysAgo(150),
        lastSeenAt: daysAgo(40),
        blockedAt: daysAgo(20),
        blockedReason: "Konto na wniosek uczestniczki",
        note: "Prośba o zablokowanie wpłynęła mailem 15.07",
    },
};

/** Names, split. The mock-up had one field; a person has two. */
const NAMES: Record<string, [string, string]> = {
    "user-admin": ["John", "Smith"],
    "user-kowalski": ["Jan", "Kowalski"],
    "user-wisniewski": ["Tomasz", "Wiśniewski"],
    "user-nowak": ["Anna", "Nowak"],
    "user-me": ["Amy", "Horsefighter"],
    "user-lis": ["Agnieszka", "Lis"],
};

export const createUsers = (): ManagedUser[] => [
    ...MANAGED_USERS.map(user => ({
        id: user.id,
        username: user.username,
        firstName: NAMES[user.id]?.[0],
        lastName: NAMES[user.id]?.[1],
        email: user.email,
        emailConfirmed: true,
        approvedAt: daysAgo(300),
        tags: [],
        isTemporary: false,
        createdAt: daysAgo(300),
        grantCount: 0,
        ...KNOWN[user.id],
    })),
    {
        id: "user-contest-001",
        username: "contest-001",
        // No name and no address: a contest account is a login and nothing more.
        emailConfirmed: false,
        approvedAt: daysAgo(2),
        tags: ["AMMPZ-2019", "temporary"],
        isTemporary: true,
        expiresAt: daysAhead(1),
        createdAt: daysAgo(2),
        lastSeenAt: daysAgo(0),
        grantCount: 1,
    },
    {
        id: "user-contest-002",
        username: "contest-002",
        emailConfirmed: false,
        approvedAt: daysAgo(2),
        tags: ["AMMPZ-2019", "temporary"],
        isTemporary: true,
        expiresAt: daysAhead(1),
        createdAt: daysAgo(2),
        grantCount: 1,
    },
    {
        // Expired rather than blocked: it stopped signing in on its own, and the
        // screen has to tell the two apart.
        id: "user-contest-2018-017",
        username: "contest-2018-017",
        emailConfirmed: false,
        approvedAt: daysAgo(430),
        tags: ["AMMPZ-2018", "temporary"],
        isTemporary: true,
        expiresAt: daysAgo(400),
        createdAt: daysAgo(430),
        lastSeenAt: daysAgo(401),
        grantCount: 0,
    },
];
