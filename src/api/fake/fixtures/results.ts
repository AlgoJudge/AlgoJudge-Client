import {
    ActivityResults, Contestant, ContestantResult, ResultSeries, Series,
} from "../../ParticipantApi";
import { rankingWindow } from "../../rankingWindow";
import {
    SeedActivity, SeedAttempt, SeedSeries,
    attemptId, attemptTime, displayName, maxPointsOf, meOf, pointsOf,
} from "./world";

/**
 * The results feed, as the Server will have to serve it.
 *
 * The fake computes no ranking — neither does the Server. What it does do is the
 * part that cannot be moved: **deciding what leaves**. A board is assembled in
 * the Client, so anything sent here has already been disclosed, and a fake that
 * sent everything would let the screens be built against a rule nothing
 * enforces.
 *
 * Three filters, in this order:
 *
 * 1. the **window** — a round whose ranking window is shut contributes nothing;
 * 2. `scoreVisibility` — `participantOnly` reduces it to the reader;
 * 3. the **freeze** — an outcome after the freeze is withheld, but the fact that
 *    somebody submitted is not.
 */

/**
 * The feed says `points` where the rest of the model says `score`.
 *
 * They are the same number on the **assignment's** scale — what the problem is
 * worth in its round, which is what a board adds up. The rescaling is `world.ts`'s
 * so that the submissions list, the problem list and the board cannot disagree
 * about what a run was worth.
 */

/**
 * Whether a round's board is inside its freeze, for this caller.
 *
 * `unfrozen` is `ranking:read:unfrozen`: whoever holds it is never inside a
 * freeze, which is what the permission means.
 */
export const isFrozen = (seed: SeedSeries, now: number, unfrozen: boolean): boolean => {
    if (unfrozen) return false;
    const { rankingFreezeAt, rankingRevealAt } = seed;
    if (!rankingFreezeAt) return false;
    if (Date.parse(rankingFreezeAt) > now) return false;
    return rankingRevealAt === undefined || Date.parse(rankingRevealAt) > now;
};

/** Whether one attempt falls inside the part of the round that is withheld. */
const withheld = (seed: SeedSeries, attempt: SeedAttempt, now: number, unfrozen: boolean): boolean =>
    isFrozen(seed, now, unfrozen)
    && Date.parse(attemptTime(seed, attempt)) >= Date.parse(seed.rankingFreezeAt!);

/**
 * One attempt as it leaves the Server.
 *
 * A withheld one keeps its identity, its problem and its time and loses
 * everything about how it went. Omitting it entirely would leave a board unable
 * to tell "did not try" from "tried, and you may not know yet" — and the second
 * is exactly what the `?` cell of a frozen ICPC board means.
 */
export const resultOf = (
    seed: SeedSeries,
    attempt: SeedAttempt,
    now: number,
    unfrozen: boolean,
): ContestantResult | undefined => {
    const assignment = seed.assignments.find(a => a.slug === attempt.problem);
    if (!assignment) return undefined;
    const base = {
        id: attemptId(seed.id, attempt),
        contestantId: attempt.contestant,
        seriesId: seed.id,
        problemId: `problem-${assignment.slug}`,
        problemSlug: assignment.slug,
        submittedAt: attemptTime(seed, attempt),
    };
    // `extra` goes with the outcome, not beside it: it is measured from the same
    // run, so a metric that survived a freeze would leak what the freeze hides.
    if (withheld(seed, attempt, now, unfrozen)) return { ...base, frozen: true };
    return { ...base, points: pointsOf(assignment, attempt.score), state: attempt.state, extra: attempt.extra };
};

const seriesOf = (seed: SeedSeries, live: Series, now: number, unfrozen: boolean): ResultSeries => ({
    id: seed.id,
    name: live.name,
    startDate: live.startDate,
    frozen: isFrozen(seed, now, unfrozen),
    // The reveal is disclosed, the freeze instant is not: "the board comes back
    // at six" is a promise to keep, while when it stopped moving is the thing
    // being withheld.
    revealAt: seed.rankingRevealAt,
    problems: seed.assignments.map(assignment => ({
        id: `problem-${assignment.slug}`,
        slug: assignment.slug,
        name: displayName(assignment),
        maxPoints: maxPointsOf(assignment),
    })),
});

export interface ResultsQuery {
    seed: SeedActivity;
    /** The live series, so a round a manager just moved is counted from where it now is. */
    live: Series[];
    /** Narrows the feed to one round. Absent asks for every round on offer. */
    seriesId?: string;
    scoreVisibility: string;
    /**
     * Whether the caller holds `ranking:read:unfrozen` here.
     *
     * It bypasses **both** withholdings, which is what the permission is for: an
     * organiser has to see the board before releasing it. Applied here rather
     * than by the screen — a screen that drew what it was not sent produced a
     * table of five contestants, no columns and a penalty of zero for everyone,
     * which is how this came to be checked in the right place.
     */
    unfrozen: boolean;
    now: number;
}

export const activityResults = (
    { seed, live, seriesId, scoreVisibility, unfrozen, now }: ResultsQuery,
): ActivityResults => {
    const me = meOf(seed);

    // 1. The window. A round whose board is not on offer contributes nothing —
    //    not its columns, not its results, not the fact that it exists.
    const offered = seed.series
        .map(part => ({ seed: part, live: live.find(s => s.id === part.id) }))
        .filter((part): part is { seed: SeedSeries; live: Series } => part.live !== undefined)
        .filter(part => seriesId === undefined || part.seed.id === seriesId)
        .filter(part => unfrozen || rankingWindow(part.live, now).visible);

    // 2. Who has a row. `managersOnly` reaches here with nothing to show, and
    //    `participantOnly` reduces to the reader — sending everybody's rows with
    //    the places stripped would disclose exactly what the setting withholds.
    const everyone: Contestant[] = (seed.contestants ?? [])
        .map(contestant => ({ id: contestant.id, name: contestant.name }));
    const contestants = scoreVisibility === "everyone"
        ? everyone
        : everyone.filter(contestant => contestant.id === me?.id);

    const visible = new Set(contestants.map(contestant => contestant.id));

    // 3. The freeze, applied per attempt as it leaves.
    const results: ContestantResult[] = offered.flatMap(part =>
        (part.seed.attempts ?? [])
            .filter(attempt => visible.has(attempt.contestant))
            .flatMap(attempt => resultOf(part.seed, attempt, now, unfrozen) ?? []));

    return {
        series: offered.map(part => seriesOf(part.seed, part.live, now, unfrozen)),
        contestants,
        results,
        me: me?.id,
    };
};
