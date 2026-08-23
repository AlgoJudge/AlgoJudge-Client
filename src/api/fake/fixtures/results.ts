import {
    ActivityResults, Contestant, ContestantResult, ResultSeries, Series,
} from "../../ParticipantApi";
import { rankingWindow } from "../../rankingWindow";
import {
    SeedActivity, SeedAttempt, SeedSeries,
    attemptId, attemptTime, displayName, fractionOf, maxPointsOf, meOf, pointsOf,
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
    /**
     * The row this attempt belongs to — the sender's group, where they have
     * one. Defaulted so every other caller reads as it did.
     */
    contestantId: string = attempt.contestant,
): ContestantResult | undefined => {
    const assignment = seed.assignments.find(a => a.slug === attempt.problem);
    if (!assignment) return undefined;
    const base = {
        id: attemptId(seed.id, attempt),
        contestantId,
        seriesId: seed.id,
        problemId: `problem-${assignment.slug}`,
        problemSlug: assignment.slug,
        submittedAt: attemptTime(seed, attempt),
    };
    // `extra` goes with the outcome, not beside it: it is measured from the same
    // run, so a metric that survived a freeze would leak what the freeze hides.
    if (withheld(seed, attempt, now, unfrozen)) return { ...base, frozen: true };
    return {
        ...base,
        points: pointsOf(assignment, fractionOf(attempt), attempt.maxScore),
        state: attempt.state,
        extra: attempt.extra,
    };
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
        // The scale every entry in this column sits on. Where the assignment
        // states no point value it is the package's own, which is knowable only
        // from an attempt — so it is read off the attempts rather than assumed.
        // A column and its entries computing this differently is a board whose
        // rows do not add up to its header.
        maxPoints: maxPointsOf(
            assignment,
            (seed.attempts ?? [])
                .find(a => a.problem === assignment.slug && a.maxScore !== undefined)?.maxScore),
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
    /**
     * Who competes as whom, and whether the roster is printed.
     *
     * Passed in rather than read off the seed, because membership is a field on
     * a **grant** — which the manager screens write during a visit — and a board
     * built from the seed alone would not notice a group made a moment ago.
     */
    groups?: {
        /** Contestant id → the group they compete as. */
        of: Map<string, { id: string; name: string; description?: string; isSystem: boolean }>;
        showMembers: boolean;
    };
    /**
     * Submission ids a manager has ruled out.
     *
     * Passed in for the reason `groups` is: a ruling made during this visit is
     * not in the seed, and a board built from the seed alone would keep scoring
     * a submission a manager removed a moment ago.
     */
    excluded?: (submissionId: string) => boolean;
}

export const activityResults = (
    { seed, live, seriesId, scoreVisibility, unfrozen, now, groups, excluded }: ResultsQuery,
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
    // **A group is a contestant, and so its members are not.** Somebody in a
    // group has no row of their own; the group has one, fed by every member's
    // work. A system group contributes nothing at all — the rule that keeps
    // staff out of a ranking, one level up.
    const seeded = seed.contestants ?? [];
    const grouped = new Map<string, Contestant>();
    const alone: Contestant[] = [];

    for (const contestant of seeded) {
        const group = groups?.of.get(contestant.id);
        if (group === undefined) {
            alone.push({ id: contestant.id, name: contestant.name, kind: "user" });
            continue;
        }
        if (group.isSystem) continue;

        const row = grouped.get(group.id) ?? {
            id: group.id,
            name: group.name,
            kind: "group" as const,
            description: group.description,
            members: [],
        };
        if (groups?.showMembers) row.members = [...(row.members ?? []), contestant.name];
        grouped.set(group.id, row);
    }

    const everyone: Contestant[] = [...grouped.values(), ...alone];

    // **The reader is not a contestant where they are in a group — the group
    // is.** Their own row would never highlight otherwise.
    const rowOfMe = me === undefined ? undefined : groups?.of.get(me.id)?.id ?? me.id;
    const contestants = scoreVisibility === "everyone"
        ? everyone
        : everyone.filter(contestant => contestant.id === rowOfMe);

    const visible = new Set(contestants.map(contestant => contestant.id));

    /** A person's row is their group's, where they have one. */
    const rowOf = (contestantId: string): string =>
        groups?.of.get(contestantId)?.id ?? contestantId;

    /** The seed's own ruling, or one a manager made during this visit. */
    const ruledOut = (part: SeedSeries, attempt: SeedAttempt): boolean =>
        attempt.excluded === true || (excluded?.(attemptId(part.id, attempt)) ?? false);

    // 3. The freeze, applied per attempt as it leaves. An excluded attempt goes
    //    first and differently: a freeze keeps the row and withholds the
    //    outcome, this leaves no row at all, because it counts for nothing.
    const results: ContestantResult[] = offered.flatMap(part =>
        (part.seed.attempts ?? [])
            .filter(attempt => !ruledOut(part.seed, attempt))
            .filter(attempt => visible.has(rowOf(attempt.contestant)))
            .flatMap(attempt =>
                resultOf(part.seed, attempt, now, unfrozen, rowOf(attempt.contestant)) ?? []));

    return {
        series: offered.map(part => seriesOf(part.seed, part.live, now, unfrozen)),
        contestants,
        results,
        // Their group, where they are in one, or their own row never highlights.
        me: rowOfMe,
    };
};
