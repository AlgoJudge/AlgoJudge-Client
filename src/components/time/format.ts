import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * What a form needs, and the durations.
 *
 * The display half lives in `zones.ts` and is re-exported here, so no call site
 * has to know about the split. It is a split for one reason: that half is pure
 * `Intl` and can be driven in Node by `check:time`, and this half cannot.
 */

export type { TimeFormat } from "./zones";
export {
    formatInZone, localeTag, offsetLabel, resolveZone, sameDayInZone, viewerZone, zonedLine,
} from "./zones";

/**
 * The two directions a form needs, in the activity's zone rather than the
 * browser's. A manager sets "18:00" meaning the activity's clock; reading it
 * back as the browser's would move the contest by an hour for anyone abroad.
 */
export const toZonedInput = (value: string | undefined, timeZone: string): string =>
    value ? dayjs(value).tz(timeZone).format("YYYY-MM-DDTHH:mm") : "";

export const fromZonedInput = (value: string, timeZone: string): string | undefined =>
    value ? dayjs.tz(value, timeZone).toISOString() : undefined;

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * A duration as a countdown. Days push seconds off the display: a three-day
 * countdown ticking every second is noise, and it repaints the page for nothing.
 */
export const formatDuration = (ms: number, t: (key: string) => string): string => {
    const total = Math.floor(ms / 1000);
    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;

    if (days > 0) return `${days} ${t("d")} ${hours} ${t("h")}`;
    if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`;
    return `${minutes}:${pad(seconds)}`;
};

/**
 * A number of minutes as a clock: `118` → `1:58`, `312` → `5:12`, `1500` → `25:00`.
 *
 * Hours are neither capped nor padded and minutes always are, so a contest's
 * penalty reads as a duration rather than as a count nobody converts in their
 * head. Past a day it simply keeps counting hours — a scoreboard's numbers are
 * compared with each other, and a day component would break that.
 */
export const minutesAsClock = (minutes: number): string => {
    const whole = Math.max(0, Math.round(minutes));
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
};
