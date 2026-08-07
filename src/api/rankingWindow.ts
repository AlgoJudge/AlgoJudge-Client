/**
 * When a participant may see one round's standings.
 *
 * A window rather than a switch, because "from the start until the results are
 * announced" is what an organiser says — and **per round**, because a contest
 * publishes the first round's board while the second is still being fought.
 * Absent bounds are open ones: no `from` means the round's own start, and no
 * start either means from the beginning; no `to` means for ever.
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

export const rankingWindow = (series: RankingWindowOf, now = Date.now()): RankingWindow => {
    // The round's own start is the sensible default: a ranking of a round that
    // has not begun is a table of zeroes.
    const from = series.rankingVisibleFrom ?? series.startDate;
    const to = series.rankingVisibleTo;

    if (from !== undefined && Date.parse(from) > now) return { visible: false, from };
    if (to !== undefined && Date.parse(to) <= now) return { visible: false, to };
    return { visible: true };
};
