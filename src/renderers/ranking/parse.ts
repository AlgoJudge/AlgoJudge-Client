import { ActivityResults } from "../../api/ParticipantApi";

/**
 * What every ranking renderer is handed.
 *
 * The **results**, not a ranking: one shape for every ranking type, because what
 * differs between them is the arithmetic, not the data it runs on. This used to
 * be an opaque document each renderer parsed for itself, which was right while
 * the Server assembled the board — it no longer does, so there is nothing left
 * to guess at and the type says so.
 *
 * A ranking type needing more than this should read it from the activity or the
 * series rather than have it smuggled through the results: the feed is what
 * everybody submitted, and it stays that.
 */
export interface RankingProps {
    results: ActivityResults;
    timeZone: string;
    /**
     * Whether the rows get places.
     *
     * False under `scoreVisibility: "participantOnly"`, where the reader is sent
     * their own results and nobody else's: a standing among people whose scores
     * you may not see is not a standing.
     */
    ranked: boolean;
}
