import { ManagedUser, UserSession } from "../../ManagerApi";

/**
 * Sessions, as the administrator screen shows them.
 *
 * Derived from the account rather than invented per call: the same account gives
 * the same sessions every time the tab is opened, because a list that reshuffles
 * on every look teaches a reader to distrust it. Only the elapsed times move,
 * which is what really moves.
 *
 * The states worth having are the ones a screen gets wrong: signed in and
 * connected, signed in and **not** connected, two tabs on one session, and an
 * account with no session at all.
 */

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60000).toISOString();
const daysAhead = (days: number) => new Date(Date.now() + days * 86400000).toISOString();

const AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/151.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) Firefox/142.0",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5) Safari/605.1.15",
];

const PATHS = [
    "/api/v1/activities",
    "/api/v1/submissions?page=1",
    "/api/v1/problems/prob-graf",
    "/api/v1/account",
];

/** Stable per account, so the same person always gets the same sessions. */
const seedOf = (id: string) => [...id].reduce((n, c) => (n * 31 + c.charCodeAt(0)) % 9973, 7);

export const createSessions = (user: ManagedUser, isSignedInUser: boolean): UserSession[] => {
    // Nobody signs in while blocked, and an account that has never been seen has
    // nothing to show. Both are states the screen must be able to say plainly.
    if (user.blockedAt || !user.lastSeenAt) return [];

    const seed = seedOf(user.id);
    const seenMinutes = Math.round((Date.now() - Date.parse(user.lastSeenAt)) / 60000);
    // Somebody last seen days ago is not sitting there with a socket open.
    const stale = seenMinutes > 12 * 60;

    const sessions: UserSession[] = [{
        id: `${user.id}-s1`,
        // Two tabs for the signed-in manager: the count is there to be seen.
        connections: stale ? 0 : (isSignedInUser ? 2 : 1),
        startedAt: minutesAgo(stale ? seenMinutes : 40 + (seed % 90)),
        lastRequestAt: minutesAgo(stale ? seenMinutes : (seed % 3)),
        lastRequestPath: PATHS[seed % PATHS.length],
        ipAddress: `10.1.${seed % 200}.${(seed * 7) % 240}`,
        userAgent: AGENTS[seed % AGENTS.length],
        expiresAt: daysAhead(14),
        isCurrent: isSignedInUser,
    }];

    // A second device, signed in and not connected — the case the flag exists
    // for, and the one a "who is online" list gets wrong.
    if (!stale && seed % 3 !== 0) {
        sessions.push({
            id: `${user.id}-s2`,
            connections: 0,
            startedAt: minutesAgo(600 + (seed % 400)),
            lastRequestAt: minutesAgo(90 + (seed % 120)),
            lastRequestPath: PATHS[(seed + 2) % PATHS.length],
            ipAddress: `192.168.${seed % 12}.${(seed * 3) % 250}`,
            userAgent: AGENTS[(seed + 1) % AGENTS.length],
            expiresAt: daysAhead(9),
            isCurrent: false,
        });
    }

    return sessions;
};
