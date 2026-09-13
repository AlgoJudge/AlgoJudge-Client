import { Text, TextProps, Tooltip } from "@mantine/core";
import { formatInZone, offsetLabel, resolveZone, TimeFormat, viewerZone, zonedLine } from "./format";

/**
 * Renders an instant in the reader's own time zone.
 *
 * **The tooltip is where the activity's clock lives now.** Hovering — or
 * tabbing to it — gives the activity's zone and the reader's, each with its
 * offset and its IANA identifier, so "when does this actually open" and "what
 * did the organiser mean" are both answerable without arithmetic.
 */
export interface ActivityTimeProps extends TextProps {
    /** UTC ISO 8601. */
    value: string;
    /**
     * The activity's IANA zone, e.g. `Europe/Warsaw`.
     *
     * **Absent where the instant belongs to no activity** — when an account was
     * created, when a Runner was last seen, when a session expires. Seventeen
     * call sites used to pass a hard-coded `"Europe/Warsaw"` for exactly those,
     * which was wrong for every reader outside Poland and is now simply not
     * passed.
     */
    timeZone?: string;
    format?: TimeFormat;
}

export default function ActivityTime({ value, timeZone, format = "datetime", ...props }: ActivityTimeProps) {
    const viewer = viewerZone();
    const shown = formatInZone(value, viewer, format);

    // **Two predicates, and they answer two questions.** The inline marker warns
    // that the clock on the screen is not the clock the activity is run on, so
    // it asks whether the *offsets* differ — Europe/Warsaw and Europe/Berlin
    // never do, and a warning there would be noise about nothing. The tooltip
    // names both zones, so it asks whether they are the same zone at all.
    const activity = timeZone === undefined ? undefined : resolveZone(timeZone);
    const elsewhere = activity !== undefined && activity !== viewer;
    const otherClock = elsewhere && offsetLabel(value, activity) !== offsetLabel(value, viewer);

    const label = elsewhere
        ? (
            <>
                <div>{zonedLine(value, activity)}</div>
                <div>{zonedLine(value, viewer)}</div>
            </>
        )
        : zonedLine(value, viewer);

    return (
        <Tooltip
            label={label}
            openDelay={400}
            // Mantine's defaults are `{ hover: true, focus: false, touch: false }`,
            // which every other tooltip in this repository runs on. Here that
            // would put the only copy of the zone identifiers behind a mouse:
            // unreachable by tap, unreachable by keyboard.
            events={{ hover: true, focus: true, touch: true }}
        >
            {/* **Focusable only where there is something behind it.** A tab
                stop on every date would add nearly forty of them to tables that
                are read rather than operated; where the two zones agree, the
                tooltip repeats what is already on the screen. */}
            <Text component="span" tabIndex={elsewhere ? 0 : undefined} data-testid="time" {...props}>
                {shown}{otherClock ? ` ${offsetLabel(value, viewer)}` : ""}
            </Text>
        </Tooltip>
    );
}
