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

/**
 * Minutes from the round's start, which is what a penalty counts in.
 *
 * **Floored, not rounded.** A submission at twenty minutes and thirty seconds is
 * in the twentieth minute, and that is what every board this one gets compared
 * against says. Rounding said twenty-one — half a minute nobody spent, on every
 * solved problem, and enough to swap two teams that were level.
 */
const minuteOf = (result: ContestantResult, startDate: string | undefined): number => {
    if (startDate === undefined) return 0;
    return Math.max(0, Math.floor((Date.parse(result.submittedAt) - Date.parse(startDate)) / 60000));
};

/** A judged result worth full marks. */
const accepted = (result: ContestantResult, maxPoints: number): boolean =>
    result.frozen !== true && result.state === "completed" && (result.points ?? 0) >= maxPoints;

/**
 * Judged, and not worth full marks — the only thing ICPC charges for.
 *
 * Written as the mirror of `accepted` on purpose: between them they cover every
 * result somebody actually got an answer to, and what neither matches is a
 * submission nobody has an answer for. That one is charged nothing.
 */
const rejected = (result: ContestantResult, maxPoints: number): boolean =>
    result.frozen !== true && result.state === "completed" && (result.points ?? 0) < maxPoints;

/**
 * Why a cell has no outcome to show: withheld, still being judged, or never
 * judged at all. Both boards render it, so both say the same thing about it.
 */
export type Pending = "frozen" | "judging" | "unjudged";

/**
 * Which of those a cell's submissions amount to, or `undefined` where it has an
 * outcome.
 *
 * A freeze is a decision to withhold; judging is a wait; an evaluation that
 * **failed or was cancelled** is neither — nothing further is coming for it
 * unless a manager rejudges it or rules it out. Three different things to be
 * told, and one label over all of them said *submitted during the freeze* above
 * cells no freeze had touched.
 *
 * The last two sit here rather than among the rejections because neither is a
 * wrong answer. The Runner sends **no score at all** for a failure, so that a
 * zero cannot read as one on a board; charging twenty minutes for it does that
 * anyway. So the board treats a submission nobody judged the way it treats one
 * nobody has judged **yet**.
 */
const pendingOf = (results: ContestantResult[]): Pending | undefined => {
    if (results.some(result => result.frozen === true)) return "frozen";
    if (results.some(result => result.state === "queued" || result.state === "running")) return "judging";
    if (results.some(result => result.state === "failed" || result.state === "cancelled")) return "unjudged";
    return undefined;
};

/**
 * Places the rows, and **gives rows that tie the same place**.
 *
 * Two contestants level on everything the board sorts by are equal, not first
 * and second. Numbering by position invented an order the arithmetic does not
 * have — and the order it invented was whatever sequence the Server happened to
 * send the contestants in, which is stable, arbitrary, and reads as a ruling.
 * The place after a shared one is the position, so two firsts are followed by a
 * third.
 *
 * Left unplaced under `participantOnly`, where the Server sends the reader's own
 * results and nobody else's: a standing among people whose scores you may not
 * see is not a standing, and a "1" against a table of one is a claim the data
 * does not support.
 */
const place = <T extends { rank?: number }>(
    rows: T[],
    ranked: boolean,
    level: (above: T, row: T) => boolean,
): T[] => {
    if (!ranked) return rows;
    let rank = 0;
    return rows.map((row, index) => {
        if (index === 0 || !level(rows[index - 1], row)) rank = index + 1;
        return { ...row, rank };
    });
};

// ────────────────────────────────────────────────────────────────────── ICPC

export interface IcpcCell {
    /** How many times they submitted. All of them, judged or not. */
    attempts: number;
    /**
     * Judged rejections before the accepted submission — what the twenty minutes
     * are charged for, and the `+2` a solved cell prints.
     *
     * **Not `attempts - 1`.** That counted everything standing in front of the
     * accepted run, a submission the judge never returned a verdict for
     * included.
     */
    rejected: number;
    /** Minutes from the round's start, at the first accepted submission. */
    acceptedAt?: number;
    /** Why there is nothing to show — see {@link Pending}. */
    pending?: Pending;
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
 * Two counts, and they are deliberately not the same number: what was sent, and
 * what it cost. **Nothing after the accepted submission is either** — ICPC stops
 * charging once a problem is solved, and somebody who submits again out of habit
 * is not penalised for it.
 *
 * Before it, only the **judged rejections** are charged. Counting positions
 * instead was the same arithmetic for as long as every submission came back with
 * a verdict, and wrong the moment one did not.
 */
const icpcCell = (
    mine: ContestantResult[],
    maxPoints: number,
    startDate: string | undefined,
): IcpcCell => {
    const ordered = [...mine].sort((a, b) => Date.parse(a.submittedAt) - Date.parse(b.submittedAt));
    const winner = ordered.findIndex(result => accepted(result, maxPoints));
    const before = winner >= 0 ? ordered.slice(0, winner) : ordered;
    const charged = before.filter(result => rejected(result, maxPoints)).length;

    if (winner >= 0) {
        return {
            attempts: ordered.length,
            rejected: charged,
            acceptedAt: minuteOf(ordered[winner], startDate),
        };
    }
    const pending = pendingOf(ordered);
    return { attempts: ordered.length, rejected: charged, ...(pending ? { pending } : {}) };
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
                penalty += cell.acceptedAt + cell.rejected * PENALTY_PER_REJECTION;
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

    // Most solved first, then least time. Level on both is level: there is no
    // further tiebreak here, so the board says so rather than picking one.
    rows.sort((a, b) => b.solved - a.solved || a.penalty - b.penalty);
    return place(rows, ranked,
        (above, row) => above.solved === row.solved && above.penalty === row.penalty);
};

// ──────────────────────────────────────────────────────────────────── points

export interface PointsCell {
    points?: number;
    /** Why there is nothing to show — see {@link Pending}. */
    pending?: Pending;
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
                const pending = pendingOf(mine);
                byProblem[problem.slug] = {
                    points: best,
                    ...(pending ? { pending } : {}),
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

    // Same total, same place — the board sorts by one number and has no second
    // one to separate two people who tie on it.
    rows.sort((a, b) => b.total - a.total);
    return place(rows, ranked, (above, row) => above.total === row.total);
};
