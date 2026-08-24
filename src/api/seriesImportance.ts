/**
 * How much a round outranks the rest while it runs.
 *
 * **The wire value is the number, and this file only names it.** The ordering is
 * what the list means — while a round runs, anything of a lower rank is locked —
 * so the Server compares numbers and the Client supplies words. A rank no entry
 * here matches renders as its own number rather than as nothing, which means the
 * two sides can disagree about a *label* and never about an order.
 *
 * Mirrors `Services/SeriesImportance` on the Server. Gaps of ten are deliberate:
 * a level inserted between two of these is a new entry, never a renumbering of
 * rows already stored.
 *
 * **Names are not here.** `check:i18n` reads only translation calls written
 * out in full, so a table of keys assembled from a rank would be a set of
 * translations nothing checks — the screen that offers them names them, in
 * calls it can see.
 */
export const SERIES_IMPORTANCE_RANKS = [0, 10, 20, 30, 40, 50] as const;

export const NORMAL_IMPORTANCE = 0;

/**
 * How far a rank reaches while its round runs.
 *
 * `activity` displaces the other rounds of the same activity and nothing else;
 * `installation` displaces every activity the reader takes part in. A round
 * starts as `activity` — the wider reach is opted into, because it is the one
 * whose consequences a manager is least likely to predict.
 */
export type SeriesImportanceScope = "activity" | "installation";

export const SERIES_IMPORTANCE_SCOPES: readonly SeriesImportanceScope[] =
    ["activity", "installation"] as const;

export const DEFAULT_IMPORTANCE_SCOPE: SeriesImportanceScope = "activity";
