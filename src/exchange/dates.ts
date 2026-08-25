import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * Moving an imported activity to when it will actually run.
 *
 * **New dates are the point of the entry, not a courtesy.** An import that
 * silently keeps last term's deadlines is the failure §8 exists to prevent: it
 * looks like it worked, and the round it opens is the one that closed in March.
 *
 * **Measured on the activity's own wall clock, and that is the same rule the
 * Server applies when it duplicates one** (`ActivityService.ShiftBy`). A round
 * starting at 09:00 is expected to start at 09:00 in the copy, and a fixed
 * offset in absolute time moves it to 10:00 whenever the move crosses a
 * daylight-saving boundary — which a February import for October does. The two
 * implementations are in two languages and neither can check the other, so this
 * comment names its counterpart.
 */

/** The naive local time, as an instant, so two of them can be subtracted. */
const wallClock = (iso: string, zone: string): number =>
    dayjs.utc(dayjs(iso).tz(zone).format("YYYY-MM-DDTHH:mm:ss.SSS")).valueOf();

/**
 * The function that moves every instant, given where the import should begin.
 *
 * The anchor is the **earliest round start**, because that is what "when does
 * this begin" means to whoever is importing; the activity's own start stands in
 * where no round has one. With nothing dated at all there is nothing to move,
 * and every date stays absent.
 */
export const shiftTo = (
    anchor: string | undefined, startsAt: string, zone: string,
): ((value?: string) => string | undefined) => {
    if (!anchor) return () => undefined;

    const delta = wallClock(startsAt, zone) - wallClock(anchor, zone);

    return (value?: string) => {
        if (!value) return undefined;
        const moved = dayjs.utc(wallClock(value, zone) + delta).format("YYYY-MM-DDTHH:mm:ss.SSS");
        return dayjs.tz(moved, zone).toISOString();
    };
};

/** The earliest round start in an import, or the activity's own. */
export const anchorOf = (
    starts: (string | undefined)[], activityStart?: string,
): string | undefined =>
    starts.filter((d): d is string => Boolean(d)).sort()[0] ?? activityStart;
