import { TextInput, TextInputProps } from "@mantine/core";
import { fromZonedInput, toZonedInput } from "./format";

/**
 * Enters an instant in the activity's zone.
 *
 * The native control speaks naive local time, which is exactly the wrong thing
 * here: a manager in one zone must be able to set a contest that opens at 18:00
 * in the activity's. The conversion happens on both edges, and the zone is named
 * on the field so nobody has to assume which clock they are reading.
 */
export interface ZonedDateTimeInputProps extends Omit<TextInputProps, "value" | "onChange" | "type"> {
    /** UTC ISO 8601, or undefined for an empty field. */
    value?: string;
    timeZone: string;
    onChange: (value: string | undefined) => void;
}

export default function ZonedDateTimeInput({ value, timeZone, onChange, description, ...props }: ZonedDateTimeInputProps) {
    return (
        <TextInput
            type="datetime-local"
            value={toZonedInput(value, timeZone)}
            onChange={e => onChange(fromZonedInput(e.currentTarget.value, timeZone))}
            description={description ?? timeZone}
            {...props}
        />
    );
}
