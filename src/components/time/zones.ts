import i18n from "i18next";

/**
 * Turning an instant into text: the zone, the offset and the locale.
 *
 * **Held apart from `format.ts` so that a check can drive it in Node.** The
 * entry conversions beside it need dayjs and its plugins, which resolve under
 * Vite and not under bare Node; everything here is `Intl` and nothing else, so
 * `check:time` compiles this one file and asserts the offsets no browser check
 * can reach — a half-hour zone, a negative half-hour one, zero, and an
 * identifier the runtime rejects.
 *
 * Instants travel as UTC ISO 8601 and are turned into text only here.
 *
 * **They are shown in the reader's own zone**, because that is the clock they
 * are going to act on: a participant abroad should not do arithmetic to know
 * whether a round has opened. The activity's zone has not stopped mattering —
 * it is what a manager *types*, and it is the first line of the tooltip on
 * every instant that belongs to an activity — but it is no longer what the
 * screen shows.
 *
 * That reverses the rule of 2026-08-03, "times display in the activity's zone
 * with a visible label". What replaces the label is the tooltip: the same two
 * facts, named rather than abbreviated, and the inline offset stays for exactly
 * the case the label was for — a reader whose zone is not the activity's.
 */

export type TimeFormat = "datetime" | "date" | "time";

const FIELDS: Record<TimeFormat, Intl.DateTimeFormatOptions> = {
    datetime: { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" },
    date: { year: "numeric", month: "2-digit", day: "2-digit" },
    time: { hour: "2-digit", minute: "2-digit" },
};

/**
 * One BCP-47 tag per interface language, derived rather than passed through.
 *
 * `i18n.language` is not usable here. It is `pl`, `pl-PL`, `en`, `en-GB` **or
 * `en-US`** depending on how the language was set — the detector hands back the
 * browser's full tag, a manual switch sets the base one, and an LTI launch
 * strips the region. `en-US` would bring back both a 12-hour clock and the word
 * GMT, which is half of what this file exists to prevent.
 */
export const localeTag = (): string =>
    (i18n.resolvedLanguage ?? i18n.language ?? "en").startsWith("pl") ? "pl-PL" : "en-GB";

/**
 * The zone the reader is in.
 *
 * A browser that answers nothing would otherwise blank every date on the page,
 * so an unanswered question falls back to UTC — wrong by an hour or two, rather
 * than absent.
 */
export const viewerZone = (): string =>
    Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

const known = new Map<string, boolean>();

/**
 * The zone to actually format in.
 *
 * **An identifier the runtime does not know throws**, and a throw during render
 * unmounts the React root — a white page with no message and no route. Measured:
 * `Intl.DateTimeFormat(undefined, { timeZone: "Mars/Olympus" })` raises
 * `RangeError`, and there is no error boundary anywhere in this application.
 *
 * A zone reaches here from the Server and, through the exchange bundle and the
 * ZawodyWeb converter, from a file somebody wrote. Falling back to the reader's
 * own zone shows a time that is wrong by an offset; throwing shows nothing at
 * all, on every page that has a date on it.
 */
export const resolveZone = (timeZone: string): string => {
    const cached = known.get(timeZone);
    if (cached === false) return viewerZone();
    if (cached) return timeZone;

    try {
        new Intl.DateTimeFormat(undefined, { timeZone });
        known.set(timeZone, true);
        return timeZone;
    } catch {
        known.set(timeZone, false);
        return viewerZone();
    }
};

/**
 * An instant as text, in the given zone and the interface's language.
 *
 * The locale's own separator between date and time is dropped: `Intl` writes
 * `21.10.2026, 00:00` and the agreed format has no comma. Everything else —
 * the order of the fields, the dots or the slashes — is the locale's, which is
 * why this is `Intl` rather than a pattern somebody has to translate.
 */
export const formatInZone = (
    value: string,
    timeZone: string,
    format: TimeFormat = "datetime",
): string =>
    new Intl.DateTimeFormat(localeTag(), { ...FIELDS[format], timeZone: resolveZone(timeZone), hour12: false })
        .formatToParts(new Date(value))
        .map(part => (part.type === "literal" && part.value.includes(",") ? " " : part.value))
        .join("")
        .replace(/\s+/g, " ")
        .trim();

/**
 * The zone's offset at that instant, as `UTC+2`, `UTC−4`, `UTC+5:30`.
 *
 * **Computed rather than asked for.** Every `Intl` answer says GMT — `short`,
 * `shortOffset` and `longOffset` alike — and dayjs's `z` token is worse: it
 * builds its own formatter with `en-US` hard-coded inside the library, so a
 * Polish screen said `GMT+2` as well, while America/New_York said `EDT` and
 * Asia/Kolkata said `GMT+5:30`. One of those three is not like the others.
 *
 * The sign is U+2212, the minus sign, not a hyphen.
 *
 * Minutes appear only when a zone has them, which several do: `Asia/Kolkata` is
 * `UTC+5:30`, `America/St_Johns` is `UTC−3:30`, `Pacific/Chatham` is
 * `UTC+13:45`.
 */
export const offsetLabel = (value: string, timeZone: string): string => {
    const instant = new Date(value);
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: resolveZone(timeZone),
        hourCycle: "h23",
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(instant);

    const field = (type: Intl.DateTimeFormatPartTypes): number =>
        Number(parts.find(part => part.type === type)?.value ?? 0);

    // The same instant read as if the zone's wall clock were UTC. The gap
    // between that and the instant itself is the offset, which is what no API
    // will hand over as a number.
    const asIfUtc = Date.UTC(
        field("year"), field("month") - 1, field("day"),
        field("hour"), field("minute"), field("second"));

    const minutes = Math.round((asIfUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60000);
    const magnitude = Math.abs(minutes);
    const hours = Math.floor(magnitude / 60);
    const rest = magnitude % 60;

    // Zero offset is written `UTC`, not `UTC+0`. It is the one zone whose name
    // and whose offset are the same word, and `UTC+0 (UTC)` reads as a stutter.
    if (minutes === 0) return "UTC";

    return `UTC${minutes < 0 ? "−" : "+"}${hours}${rest ? `:${String(rest).padStart(2, "0")}` : ""}`;
};

/**
 * Whether two instants fall on the same day **in a named zone**.
 *
 * Here rather than in the component that needs it so that a check can drive it:
 * the case it exists for is one where two zones disagree about the date, which
 * a browser suite can only reach by sitting on midnight.
 *
 * The rule it encodes is `compare in the zone the row is drawn in`. Getting the
 * two out of step is a real defect with a date on it — 2026-08-30, a submission
 * a minute old drawn `30.08.2026 01:56` where `01:56` was expected, because the
 * comparison ran in UTC and the text was rendered in Warsaw.
 */
export const sameDayInZone = (a: string, b: string, timeZone: string): boolean =>
    formatInZone(a, timeZone, "date") === formatInZone(b, timeZone, "date");

/**
 * `21.10.2026 00:00 UTC+2 (Europe/Warsaw)` — one line of a time tooltip.
 *
 * The zone is named after resolving it, so a line cannot claim an identifier
 * the time beside it was not computed in.
 */
export const zonedLine = (value: string, timeZone: string): string => {
    const zone = resolveZone(timeZone);
    return `${formatInZone(value, zone)} ${offsetLabel(value, zone)} (${zone})`;
};
