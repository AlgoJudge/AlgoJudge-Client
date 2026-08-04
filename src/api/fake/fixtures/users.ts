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
    "user-admin": { tags: ["staff"], createdAt: daysAgo(400), lastSeenAt: daysAgo(0) },
    "user-me": { tags: ["staff"], createdAt: daysAgo(380), lastSeenAt: daysAgo(0) },
    "user-kowalski": { tags: ["PROG-1-LA"], createdAt: daysAgo(200), lastSeenAt: daysAgo(1) },
    "user-wisniewski": { tags: ["PROG-1-LA"], createdAt: daysAgo(200), lastSeenAt: daysAgo(3) },
    "user-nowak": { tags: ["PROG-1-LA"], createdAt: daysAgo(190), lastSeenAt: daysAgo(0) },
    "user-lis": {
        tags: [],
        createdAt: daysAgo(150),
        lastSeenAt: daysAgo(40),
        blockedAt: daysAgo(20),
        blockedReason: "Konto na wniosek uczestniczki",
    },
};

export const createUsers = (): ManagedUser[] => [
    ...MANAGED_USERS.map(user => ({
        id: user.id,
        username: user.username,
        name: user.name,
        email: user.email,
        tags: [],
        isTemporary: false,
        createdAt: daysAgo(300),
        grantCount: 0,
        ...KNOWN[user.id],
    })),
    {
        id: "user-contest-001",
        username: "contest-001",
        name: "Konto zawodów 001",
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
        name: "Konto zawodów 002",
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
        name: "Konto zawodów 017",
        tags: ["AMMPZ-2018", "temporary"],
        isTemporary: true,
        expiresAt: daysAgo(400),
        createdAt: daysAgo(430),
        lastSeenAt: daysAgo(401),
        grantCount: 0,
    },
];
