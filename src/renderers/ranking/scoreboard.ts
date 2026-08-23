import { ActivityResults, ContestantResult, ResultProblem } from "../../api/ParticipantApi";

/**
 * Turning results into a standing.
 *
 * The Server sends **results, not a ranking**: which board they add up to is the
 * activity's `rankingType`, and a Server computing an ICPC penalty would be
 * encoding the semantics of one ranking type — the thing it is not supposed to
 * know. So the arithmetic lives here, beside the renderers that use it, and a
 * new ranking type is a new function and a new renderer rather than a Server
 * release.
 *
 * What the Server keeps is disclosure, not arithmetic: the window decides
 * whether there is an answer, the freeze withholds outcomes, and
 * `scoreVisibility` decides whose results are in it. Nothing here can recover
 * what was withheld, which is the point.
 */

/** ICPC's charge for a rejected attempt before the accepted one. */
const PENALTY_PER_REJECTION = 20;

export interface BoardColumn extends ResultProblem {
    seriesId: string;
    /**
     * Its round is frozen, so this column is not settled.
     *
     * Marked in the header rather than left to look ordinary: a combined board
     * mixes rounds, and one that put withheld columns beside finished ones
     * without saying so would read as a standing when it is not one.
     */
    frozen: boolean;
}

/** Every problem the given rounds hold, in the order the rounds run. */
export const columnsOf = (results: ActivityResults): BoardColumn[] =>
    results.series.flatMap(series => series.problems.map(problem => ({
        ...problem,
        seriesId: series.id,
        frozen: series.frozen,
    })));

/** Whether anything the reader is looking at is frozen, and until when. */
export const freezeOf = (results: ActivityResults): { frozen: boolean; revealAt?: string } => {
    const frozen = results.series.find(series => series.frozen);
    return { frozen: frozen !== undefined, revealAt: frozen?.revealAt };
};

/**
 * The rounds the reader chose, as a feed of their own.
 *
 * The screen asks for every round once and narrows here, rather than asking
 * again per tab: the combined board already carries everything the reader may
 * see, so a second request would fetch what is already in hand.
 */
export const narrow = (results: ActivityResults, seriesId: string | undefined): ActivityResults => {
    if (seriesId === undefined) return results;
    return {
        ...results,
        series: results.series.filter(series => series.id === seriesId),
        results: results.results.filter(result => result.seriesId === seriesId),
    };
};

/** Minutes from the round's start, which is what a penalty counts in. */
const minuteOf = (result: ContestantResult, startDate: string | undefined): number => {
    if (startDate === undefined) return 0;
    return Math.max(0, Math.round((Date.parse(result.submittedAt) - Date.parse(startDate)) / 60000));
};

/** A judged result worth full marks. Anything else is a rejection. */
const accepted = (result: ContestantResult, maxPoints: number): boolean =>
    result.frozen !== true && result.state === "completed" && (result.points ?? 0) >= maxPoints;

/** Nothing has come back for it yet — being judged, or withheld by a freeze. */
const unresolved = (result: ContestantResult): boolean =>
    result.frozen === true || result.state === "queued" || result.state === "running";

/**
 * Places the rows.
 *
 * Left unplaced under `participantOnly`, where the Server sends the reader's own
 * results and nobody else's: a standing among people whose scores you may not
 * see is not a standing, and a "1" against a table of one is a claim the data
 * does not support.
 */
const place = <T extends { rank?: number }>(rows: T[], ranked: boolean): T[] =>
    rows.map((row, index) => ranked ? { ...row, rank: index + 1 } : row);

// ────────────────────────────────────────────────────────────────────── ICPC

export interface IcpcCell {
    attempts: number;
    /** Minutes from the round's start, at the first accepted submission. */
    acceptedAt?: number;
    /** Something is still out: being judged, or withheld by the freeze. */
    pending?: boolean;
}

export interface IcpcRow {
    rank?: number;
    contestantId: string;
    name: string;
    /**
     * A group's short line and its roster, when the activity prints one.
     *
     * Carried on the row rather than looked up while drawing, so both boards
     * render a group the same way without either knowing where it came from.
     */
    description?: string;
    members?: string[];
    solved: number;
    penalty: number;
    cells: Record<string, IcpcCell>;
}

/**
 * One contestant's cell for one problem.
 *
 * Attempts after the accepted one are not counted: ICPC stops charging once a
 * problem is solved, and somebody who submits again out of habit is not
 * penalised for it.
 */
const icpcCell = (
    mine: ContestantResult[],
    maxPoints: number,
    startDate: string | undefined,
): IcpcCell => {
    const ordered = [...mine].sort((a, b) => Date.parse(a.submittedAt) - Date.parse(b.submittedAt));
    const winner = ordered.findIndex(result => accepted(result, maxPoints));
    if (winner >= 0) {
        return { attempts: winner + 1, acceptedAt: minuteOf(ordered[winner], startDate) };
    }
    return {
        attempts: ordered.length,
        ...(ordered.some(unresolved) ? { pending: true } : {}),
    };
};

export const icpcBoard = (results: ActivityResults, ranked: boolean): IcpcRow[] => {
    const columns = columnsOf(results);
    const startOf = new Map(results.series.map(series => [series.id, series.startDate]));

    const rows = results.contestants.map((contestant): IcpcRow => {
        const cells: Record<string, IcpcCell> = {};
        let solved = 0;
        let penalty = 0;

        for (const column of columns) {
            const mine = results.results.filter(result =>
                result.contestantId === contestant.id && result.problemId === column.id);
            const cell = icpcCell(mine, column.maxPoints, startOf.get(column.seriesId));
            if (cell.acceptedAt !== undefined) {
                solved += 1;
                penalty += cell.acceptedAt + (cell.attempts - 1) * PENALTY_PER_REJECTION;
            }
            cells[column.slug] = cell;
        }
        return {
            contestantId: contestant.id,
            name: contestant.name,
            description: contestant.description,
            members: contestant.members,
            solved,
            penalty,
            cells,
        };
    });

    // Most solved first, then least time.
    rows.sort((a, b) => b.solved - a.solved || a.penalty - b.penalty);
    return place(rows, ranked);
};

// ──────────────────────────────────────────────────────────────────── points

export interface PointsCell {
    points?: number;
    /** Withheld by a freeze, or still being judged. */
    pending?: boolean;
}

export interface PointsRow {
    rank?: number;
    contestantId: string;
    name: string;
    /**
     * A group's short line and its roster, when the activity prints one.
     *
     * Carried on the row rather than looked up while drawing, so both boards
     * render a group the same way without either knowing where it came from.
     */
    description?: string;
    members?: string[];
    solved: number;
    total: number;
    bySeries: Record<string, { total: number; byProblem: Record<string, PointsCell> }>;
}

export const pointsBoard = (results: ActivityResults, ranked: boolean): PointsRow[] => {
    const rows = results.contestants.map((contestant): PointsRow => {
        const bySeries: PointsRow["bySeries"] = {};
        let total = 0;
        let solved = 0;

        for (const series of results.series) {
            const byProblem: Record<string, PointsCell> = {};
            let roundTotal = 0;
            for (const problem of series.problems) {
                const mine = results.results.filter(result =>
                    result.contestantId === contestant.id && result.problemId === problem.id);
                if (mine.length === 0) continue;
                const scored = mine.filter(result => result.points !== undefined);
                // The best that was ever awarded, not the last: somebody who
                // scores 80 and then breaks it keeps the 80.
                const best = scored.length > 0
                    ? Math.max(...scored.map(result => result.points ?? 0))
                    : undefined;
                byProblem[problem.slug] = {
                    points: best,
                    ...(mine.some(unresolved) ? { pending: true } : {}),
                };
                roundTotal += best ?? 0;
                if ((best ?? 0) >= problem.maxPoints) solved += 1;
            }
            bySeries[series.id] = { total: roundTotal, byProblem };
            total += roundTotal;
        }
        return {
            contestantId: contestant.id,
            name: contestant.name,
            description: contestant.description,
            members: contestant.members,
            solved,
            total,
            bySeries,
        };
    });

    rows.sort((a, b) => b.total - a.total);
    return place(rows, ranked);
};
