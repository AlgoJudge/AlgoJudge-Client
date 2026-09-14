import { Text, TextProps } from "@mantine/core";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatDuration } from "./format";

/**
 * Counts up from an instant, and does not stop.
 *
 * The sibling of `Countdown`, which counts down to a target and halts at zero —
 * the shape is deliberately the same, and so is the one rule that matters:
 * **the span is recomputed from the clock on every tick rather than
 * incremented**, so it cannot drift when the tab is backgrounded and timers are
 * throttled. That is exactly what happens to the page somebody leaves open while
 * they wait for a verdict, which is the only place this is used.
 */
export interface ElapsedProps extends TextProps {
    /** UTC ISO 8601. */
    since: string;
}

/**
 * Clamped at zero on purpose. Nothing in this Client corrects for a browser
 * clock running behind the Server's, so a machine a few seconds slow would
 * otherwise render a negative duration the moment an instant arrives.
 */
const sinceMs = (since: string): number =>
    Math.max(0, Date.now() - Date.parse(since));

export default function Elapsed({ since, ...props }: ElapsedProps) {
    const { t } = useTranslation();
    const [passed, setPassed] = useState(() => sinceMs(since));

    useEffect(() => {
        setPassed(sinceMs(since));

        // Rescheduled rather than a `setInterval`, as `Countdown` does it: one
        // timer outstanding at a time, so a slow frame cannot queue a backlog of
        // ticks that all fire at once when the tab comes forward.
        let timer: ReturnType<typeof setTimeout>;
        const tick = () => {
            setPassed(sinceMs(since));
            timer = setTimeout(tick, 1000);
        };
        timer = setTimeout(tick, 1000);
        return () => clearTimeout(timer);
    }, [since]);

    return <Text component="span" {...props}>{formatDuration(passed, t)}</Text>;
}
