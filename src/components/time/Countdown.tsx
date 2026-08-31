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
    // Held rather than depended on: a new closure on every parent render would
    // restart the timer and it would never fire. Kept current so that
    // re-arming — which now happens on every tick — cannot pin the first one.
    const elapsed = useRef(onElapsed);
    elapsed.current = onElapsed;

    useEffect(() => {
        fired.current = false;
        setLeft(remainingMs(target));

        // Half a minute apart while the target is more than an hour away:
        // nothing on screen changes second by second at that distance.
        //
        // **Rescheduled rather than set once.** As a fixed interval the period
        // was chosen at mount and never revisited, so a countdown opened ninety
        // minutes early was still jumping thirty seconds at a time through the
        // final minute — and `onElapsed`, which is what tells a screen the round
        // has opened, fired up to thirty seconds after it had.
        let timer: ReturnType<typeof setTimeout>;

        const tick = () => {
            const next = remainingMs(target);
            setLeft(next);
            if (next === 0) {
                if (!fired.current) {
                    fired.current = true;
                    elapsed.current?.();
                }
                return;
            }
            timer = setTimeout(tick, next > 3600_000 ? 30_000 : 1000);
        };

        timer = setTimeout(tick, remainingMs(target) > 3600_000 ? 30_000 : 1000);
        return () => clearTimeout(timer);
    }, [target]);

    return <Text component="span" {...props}>{formatDuration(left, t)}</Text>;
}
