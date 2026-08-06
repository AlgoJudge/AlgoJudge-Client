/**
 * When a participant may see the standings.
 *
 * A window rather than a switch, because "from the start until the results are
 * announced" is what an organiser says. Absent bounds are open ones: no `from`
 * means the activity's own start, and no start either means from the beginning;
 * no `to` means for ever.
 *
 * Beside `seriesState.ts` and for the same reason — one rule, applied by the
 * screen to decide what to draw and by the fake to decide what to answer, as the
 * Server must apply it to decide what to serve.
 */

export interface RankingWindowOf {
    startDate?: string;
    rankingVisibleFrom?: string;
    rankingVisibleTo?: string;
}

export interface RankingWindow {
    visible: boolean;
    /** When it opens, where that is later than now. */
    from?: string;
    /** When it closed, where that is earlier than now. */
    to?: string;
}

export const rankingWindow = (activity: RankingWindowOf, now = Date.now()): RankingWindow => {
    // The activity's start is the sensible default: a ranking of a contest that
    // has not begun is a table of zeroes.
    const from = activity.rankingVisibleFrom ?? activity.startDate;
    const to = activity.rankingVisibleTo;

    if (from !== undefined && Date.parse(from) > now) return { visible: false, from };
    if (to !== undefined && Date.parse(to) <= now) return { visible: false, to };
    return { visible: true };
};
