import { Text, TextProps, Tooltip } from "@mantine/core";
import { formatInZone, TimeFormat, zoneLabel } from "./format";

/** Renders an instant in the activity's time zone, with the zone named. */
export interface ActivityTimeProps extends TextProps {
    /** UTC ISO 8601. */
    value: string;
    /** IANA zone, e.g. `Europe/Warsaw`. */
    timeZone: string;
    format?: TimeFormat;
    /** Hide the zone label where a heading already states it. */
    hideZone?: boolean;
}

export default function ActivityTime({ value, timeZone, format = "datetime", hideZone, ...props }: ActivityTimeProps) {
    const formatted = formatInZone(value, timeZone, format);
    const zone = zoneLabel(value, timeZone);
    return (
        <Tooltip label={`${formatted} ${zone} (${timeZone})`} openDelay={400}>
            <Text component="span" {...props}>
                {formatted}{hideZone ? "" : ` ${zone}`}
            </Text>
        </Tooltip>
    );
}
