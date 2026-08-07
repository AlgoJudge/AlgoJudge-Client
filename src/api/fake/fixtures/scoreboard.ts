import { Series } from "../../ParticipantApi";
import { rankingWindow } from "../../rankingWindow";
import { SeedActivity, SeedAttempt, SeedSeries, displayName, meOf } from "./world";

/**
 * The standings, computed from the attempts.
 *
 * A board used to be written beside the submissions that produced it, and the
 * two disagreed: a row claimed a penalty of 331 that its own cells did not add
 * up to, and a problem's summary claimed five attempts where the list held two.
 * A board is not a fact an organiser states — it is what the submissions come
 * to — so it is computed here, from the same attempts the submissions list is
 * built from.
 *
 * Beside `seriesState.ts` and `rankingWindow.ts`, and for the same reason: one
 * rule, applied by the fake to decide what to answer as the Server must apply it
 * to decide what to serve. The **Server** assembles the real one; this exists so
 * the screens can be watched against something that cannot lie.
 */

/** ICPC's charge for a rejected attempt before the accepted one. */
const PENALTY_PER_REJECTION = 20;

/** What a problem is worth where its assignment does not say otherwise. */
const MAX_SCORE = 100;

/** A finished attempt scoring full marks. Anything else is a rejection. */
const accepted = (attempt: SeedAttempt, maxScore: number): boolean =>
    attempt.state === "completed" && (attempt.score ?? 0) >= maxScore;

/** Still being judged, so it is neither a solve nor yet a rejection. */
const unresolved = (attempt: SeedAttempt): boolean =>
    attempt.state === "queued" || attempt.state === "running";

/**
 * One round's contribution to a board.
 *
 * The dates come from the **live** series, because a manager moves a round and
 * the board has to follow: `startDate` decides what a penalty minute counts
 * from, and the window decides whether the round is on the combined board at
 * all. The freeze comes from the seed, because a participant is never told when
 * the freeze is — the Server withholds what it covers, and an instant sent to
 * the Client would announce exactly what it is hiding.
 */
export interface BoardPart {
    seed: SeedSeries;
    live: Series;
}

/** Whether a round is inside its freeze right now. */
const isFrozen = (part: BoardPart, now: number): boolean => {
    const { rankingFreezeAt, rankingRevealAt } = part.seed;
    if (!rankingFreezeAt) return false;
    if (Date.parse(rankingFreezeAt) > now) return false;
    return rankingRevealAt === undefined || Date.parse(rankingRevealAt) > now;
};

/**
 * The minute the freeze begins, counted as the attempts are.
 *
 * Attempts carry minutes from their round's start, so the freeze has to be
 * expressed the same way before the two can be compared.
 */
const freezeMinute = (part: BoardPart): number | undefined => {
    const { rankingFreezeAt } = part.seed;
    if (!rankingFreezeAt || !part.live.startDate) return undefined;
    return (Date.parse(rankingFreezeAt) - Date.parse(part.live.startDate)) / 60000;
};

/** The rounds a participant may see the standings of, in order. */
export const openWindows = (parts: BoardPart[], now: number): BoardPart[] =>
    parts.filter(part => rankingWindow(part.live, now).visible);

// ────────────────────────────────────────────────────────────────── ICPC

interface IcpcCell {
    attempts: number;
    acceptedAt?: number;
    pending?: boolean;
}

/**
 * One team's cell for one problem.
 *
 * Attempts after the accepted one are not counted: ICPC stops charging once a
 * problem is solved, and a team that submits again out of habit is not penalised
 * for it.
 */
const icpcCell = (attempts: SeedAttempt[], maxScore: number, frozenFrom: number | undefined): IcpcCell => {
    const ordered = [...attempts].sort((a, b) => a.at - b.at);
    const visible = frozenFrom === undefined
        ? ordered
        : ordered.filter(attempt => attempt.at <= frozenFrom);
    const hidden = ordered.length - visible.length;

    const winner = visible.findIndex(attempt => accepted(attempt, maxScore));
    if (winner >= 0) {
        return { attempts: winner + 1, acceptedAt: visible[winner].at };
    }
    // Something is still out — during a freeze, or with a judge still running.
    // Either way the cell is unresolved rather than failed, and says so.
    const pending = hidden > 0 || visible.some(unresolved);
    return { attempts: ordered.length, ...(pending ? { pending: true } : {}) };
};

/**
 * The ICPC board over one round or several.
 *
 * Several is the combined board: the columns of each round in order, and the
 * penalties added. A problem's slug is unique across the whole activity, so the
 * cells stay keyed by slug and nothing has to be qualified.
 */
export const icpcBoard = (activity: SeedActivity, parts: BoardPart[], now: number): unknown => {
    const me = meOf(activity);
    const frozen = parts.some(part => isFrozen(part, now));

    const problems = parts.flatMap(part => part.seed.assignments.map(assignment => ({
        id: `problem-${assignment.slug}`,
        slug: assignment.slug,
        name: displayName(assignment),
    })));

    const rows = (activity.contestants ?? []).map(contestant => {
        const cells: Record<string, IcpcCell> = {};
        let solved = 0;
        let penalty = 0;

        for (const part of parts) {
            const frozenFrom = isFrozen(part, now) ? freezeMinute(part) : undefined;
            for (const assignment of part.seed.assignments) {
                const mine = (part.seed.attempts ?? []).filter(attempt =>
                    attempt.contestant === contestant.id && attempt.problem === assignment.slug);
                const cell = icpcCell(mine, assignment.maxScore ?? MAX_SCORE, frozenFrom);
                cells[assignment.slug] = cell;
                if (cell.acceptedAt !== undefined) {
                    solved += 1;
                    penalty += cell.acceptedAt + (cell.attempts - 1) * PENALTY_PER_REJECTION;
                }
            }
        }
        return { id: contestant.id, name: contestant.name, solved, penalty, cells };
    });

    // Most solved first, then least time. Ranked here rather than by the
    // renderer: a place is a fact about the whole board, and a table that sorted
    // its own rows would number them differently the moment one was withheld.
    rows.sort((a, b) => b.solved - a.solved || a.penalty - b.penalty);

    return {
        format: "icpc",
        frozen,
        // Only the reveal is disclosed: "the board comes back at six" is a
        // promise to keep, while the instant it stopped moving is the thing
        // being withheld.
        revealAt: parts.find(part => isFrozen(part, now))?.seed.rankingRevealAt,
        startedAt: parts[0]?.live.startDate,
        me: me?.id,
        problems,
        rows: rows.map((row, index) => ({ rank: index + 1, ...row })),
    };
};

// ──────────────────────────────────────────────────────────────── points

/**
 * The points board over one round or several.
 *
 * No time enters it: only the best score each problem was ever awarded, which is
 * what a course counts. A round is a column that expands to its problems, so
 * "one round" and "the whole course" are the same table with one entry or many.
 */
export const pointsBoard = (activity: SeedActivity, parts: BoardPart[], now: number): unknown => {
    const me = meOf(activity);

    const series = parts.map(part => ({
        id: part.seed.id,
        name: part.live.name,
        problems: part.seed.assignments.map(assignment => ({
            slug: assignment.slug,
            name: displayName(assignment),
            maxScore: assignment.maxScore ?? MAX_SCORE,
        })),
    }));

    const rows = (activity.contestants ?? []).map(contestant => {
        const bySeries: Record<string, { total: number; byProblem: Record<string, number> }> = {};
        let total = 0;
        let solved = 0;

        for (const part of parts) {
            const byProblem: Record<string, number> = {};
            let roundTotal = 0;
            for (const assignment of part.seed.assignments) {
                const mine = (part.seed.attempts ?? []).filter(attempt =>
                    attempt.contestant === contestant.id && attempt.problem === assignment.slug);
                if (mine.length === 0) continue;
                // The best that was ever awarded, not the last: a student who
                // scores 80 and then breaks it keeps the 80.
                const best = Math.max(...mine.map(attempt => attempt.score ?? 0));
                byProblem[assignment.slug] = best;
                roundTotal += best;
                if (best >= (assignment.maxScore ?? MAX_SCORE)) solved += 1;
            }
            bySeries[part.seed.id] = { total: roundTotal, byProblem };
            total += roundTotal;
        }
        return { id: contestant.id, name: contestant.name, solved, total, bySeries };
    });

    rows.sort((a, b) => b.total - a.total);

    return {
        format: "points",
        frozen: parts.some(part => isFrozen(part, now)),
        me: me?.id,
        series,
        // The round being worked on right now opens by default; a course
        // watches the current week, not the first one.
        activeSeriesId: parts.find(part => part.live.isOpen)?.seed.id ?? parts[parts.length - 1]?.seed.id,
        rows: rows.map((row, index) => ({ rank: index + 1, ...row })),
    };
};

/**
 * The board for one round, or the combined one when no round is named.
 *
 * The combined board is the rounds whose window is open — which is why it is
 * assembled on the call rather than once at load: an hour from now a round's
 * window opens, and a board prepared this morning would still not contain it.
 */
export const board = (
    activity: SeedActivity,
    parts: BoardPart[],
    seriesId: string | undefined,
    now: number,
): unknown => {
    const chosen = seriesId !== undefined
        ? parts.filter(part => part.seed.id === seriesId)
        : openWindows(parts, now);
    return activity.rankingType === "icpc"
        ? icpcBoard(activity, chosen, now)
        : pointsBoard(activity, chosen, now);
};
