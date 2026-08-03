import { Text, TextProps } from "@mantine/core";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatDuration } from "./format";

/**
 * Counts down to an instant and reports when it arrives.
 *
 * Remaining time is recomputed from the clock on every tick rather than
 * decremented, so it cannot drift when the tab is backgrounded and the interval
 * is throttled — which is exactly what happens to a page left open waiting for a
 * round to start.
 */
export interface CountdownProps extends TextProps {
    /** UTC ISO 8601. */
    target: string;
    /** Fired once, when the target is reached with the component mounted. */
    onElapsed?: () => void;
}

const remainingMs = (target: string): number =>
    Math.max(0, Date.parse(target) - Date.now());

export default function Countdown({ target, onElapsed, ...props }: CountdownProps) {
    const { t } = useTranslation();
    const [left, setLeft] = useState(() => remainingMs(target));
    const fired = useRef(false);

    useEffect(() => {
        fired.current = false;
        setLeft(remainingMs(target));

        const tick = () => {
            const next = remainingMs(target);
            setLeft(next);
            if (next === 0 && !fired.current) {
                fired.current = true;
                onElapsed?.();
            }
        };

        // A minute apart once the target is more than an hour away: nothing on
        // screen changes second by second at that distance.
        const interval = setInterval(tick, remainingMs(target) > 3600_000 ? 30_000 : 1000);
        return () => clearInterval(interval);
        // `onElapsed` is deliberately not a dependency: a new closure on every
        // parent render would restart the interval and it would never fire.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [target]);

    return <Text component="span" {...props}>{formatDuration(left, t)}</Text>;
}
