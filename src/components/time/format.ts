import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import advancedFormat from "dayjs/plugin/advancedFormat";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(advancedFormat);

/**
 * Time formatting, kept out of the components that use it.
 *
 * Instants travel as UTC ISO 8601 and are turned into text only here, in the
 * activity's zone. A contest is announced in one zone and argued about in it, so
 * "18:00" has to mean the same thing to the organiser and to a participant
 * sitting elsewhere — and the zone is always shown, because an unlabelled clock
 * is what makes the two conventions indistinguishable.
 */

export type TimeFormat = "datetime" | "date" | "time";

const PATTERNS: Record<TimeFormat, string> = {
    datetime: "DD.MM.YYYY HH:mm",
    date: "DD.MM.YYYY",
    time: "HH:mm",
};

export const formatInZone = (value: string, timeZone: string, format: TimeFormat = "datetime"): string =>
    dayjs(value).tz(timeZone).format(PATTERNS[format]);

/** The zone's short name at that instant, so it follows daylight saving. */
export const zoneLabel = (value: string, timeZone: string): string =>
    dayjs(value).tz(timeZone).format("z");

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
