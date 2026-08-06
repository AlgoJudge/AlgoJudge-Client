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
}

export type SeriesState =
    /** Its start has not passed. Nothing about it is disclosed. */
    | "upcoming"
    /** Running: readable, and accepting submissions. */
    | "open"
    /** A manager stopped it. Readable unless they also hid it; accepting nothing. */
    | "paused"
    /** Its end has passed. Readable for ever; accepting nothing. */
    | "ended";

export const seriesState = (series: SeriesTiming, now = Date.now()): SeriesState => {
    if (series.endDate !== undefined && Date.parse(series.endDate) <= now) return "ended";
    if (series.pausedAt !== undefined) return "paused";
    if (series.startDate !== undefined && Date.parse(series.startDate) > now) return "upcoming";
    return "open";
};

/**
 * Whether the problems may be read.
 *
 * Withheld before the start, and while a pause that took them away is in force —
 * which is `isOpen` gone false on a paused series, and the whole of what "hide
 * the statements" means. An ended series stays readable: it is over, not secret.
 */
export const mayReadProblems = (series: SeriesTiming, now = Date.now()): boolean => {
    const state = seriesState(series, now);
    if (state === "upcoming") return false;
    if (state === "paused" && !series.isOpen) return false;
    return true;
};

/** Whether anything may be submitted. Only while it is actually running. */
export const maySubmit = (series: SeriesTiming, now = Date.now()): boolean =>
    seriesState(series, now) === "open";
