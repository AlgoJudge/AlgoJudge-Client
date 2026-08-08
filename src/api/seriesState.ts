/**
 * What may be done with a series, and when.
 *
 * Three questions used to be answered by one boolean. `isOpen` false meant "the
 * problems are absent", which is right **before** a series starts and wrong
 * after it ends: a round that finished is still readable — competitors go back
 * to what they were solving — and simply accepts nothing more.
 *
 * One rule, here, applied by the screens to decide what to offer and by the fake
 * to decide what to answer, as the Server must apply it to decide what to serve.
 * A refusal only the Client performs is not a refusal.
 */

/** Everything the rule needs of a series, whoever it came from. */
export interface SeriesTiming {
    startDate?: string;
    endDate?: string;
    /** Whether the Server currently has it open. */
    isOpen: boolean;
    /** Since when a manager has it stopped. */
    pausedAt?: string;
    /**
     * Whether the pause took the statements with it.
     *
     * Only the fake supplies this, from its seed: no response carries it,
     * because the Server does not need the Client's help to withhold — it
     * simply leaves `problems` out. See {@link mayReadProblems}.
     */
    hideProblemsWhilePaused?: boolean;
}

/**
 * What the scheduler would decide from the clock alone.
 *
 * **Not for screens.** A screen reads {@link seriesState}, which trusts the
 * stored answer. This is the rule that *produces* that answer, and it exists so
 * the fake can stand in for the scheduler when it builds a series from a seed
 * that states dates and no flag.
 *
 * Mirrors the Server's `ManagerWriteService.Reconcile`, including its treatment
 * of a series with no start: an untimed activity is running, not pending, and
 * the forms accept one rather than demanding a date.
 */
export const openByClock = (
    series: Pick<SeriesTiming, "startDate" | "endDate" | "pausedAt">,
    now = Date.now(),
): boolean => {
    // A paused round is shut by the pause, whatever the clock says.
    if (series.pausedAt !== undefined) return false;

    const started = series.startDate === undefined || Date.parse(series.startDate) <= now;
    const ended = series.endDate !== undefined && Date.parse(series.endDate) <= now;
    return started && !ended;
};

export type SeriesState =
    /** Its start has not passed. Nothing about it is disclosed. */
    | "upcoming"
    /** Running: readable, and accepting submissions. */
    | "open"
    /** A manager stopped it. Readable unless they also hid it; accepting nothing. */
    | "paused"
    /** Its end has passed. Readable for ever; accepting nothing. */
    | "ended";

/**
 * Whether a round is running is a fact the Server **holds**, not one its dates
 * imply (decided 2026-08-08). `Workers/SeriesScheduler.cs` owns every
 * transition, so between a deadline passing and the scheduler's next pass the
 * stored answer is the true one — and recomputing it here would disagree with
 * the Server in exactly the minute that matters, offering a Submit button to a
 * round that has closed or withholding one from a round that has opened.
 *
 * The dates are still read, but only to say **which kind of shut** a shut round
 * is, which is a label rather than a permission.
 */
export const seriesState = (series: SeriesTiming, now = Date.now()): SeriesState => {
    // A pause is asked about first. The Server closes a round as it pauses it,
    // so the two can only disagree if something upstream broke that rule — and
    // then "paused" is the safer of the two answers, because it offers nothing.
    if (series.pausedAt !== undefined) return "paused";
    if (series.isOpen) return "open";
    if (series.endDate !== undefined && Date.parse(series.endDate) <= now) return "ended";
    return "upcoming";
};

/**
 * Whether the problems may be read.
 *
 * **The fake's rule, not a screen's.** No screen calls this and none should: the
 * Server withholds by leaving `problems` out of the response, so a screen that
 * asked this question would be second-guessing an answer it already has. The
 * fake calls it because the fake is standing in for the Server.
 *
 * Mirrors `Services/SeriesGate.cs`. An ended series stays readable by default —
 * it is over, not secret, and a competitor goes back to what they were solving —
 * and an activity may say otherwise for a course reusing its problems next year.
 * A pause hides them only when the manager said so as they paused.
 */
export const mayReadProblems = (
    series: SeriesTiming,
    activity: { hideEndedSeriesProblems?: boolean } = {},
    now = Date.now(),
): boolean => {
    if (series.isOpen) return true;

    if (series.pausedAt !== undefined) return series.hideProblemsWhilePaused !== true;
    if (series.endDate !== undefined && Date.parse(series.endDate) <= now) {
        return activity.hideEndedSeriesProblems !== true;
    }
    // Never opened: a series that has not started does not disclose what it holds.
    return false;
};

/**
 * Whether anything may be submitted.
 *
 * Mirrors `SeriesGate.MaySubmit` — `isOpen && pausedAt is null` — rather than
 * asking {@link seriesState}. The two agree today because a pause closes the
 * round, and stating it the Server's way means they keep agreeing if that ever
 * stops being true.
 *
 * Takes no `now`: it reads a stored answer, so there is no clock to read it
 * against.
 */
export const maySubmit = (series: SeriesTiming): boolean =>
    series.isOpen && series.pausedAt === undefined;
