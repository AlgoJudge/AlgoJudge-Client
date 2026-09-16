import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Keeping a list on screen up to date when a change arrives for it.
 *
 * **Every one of these events is sent on creation as well as on change.** The
 * Server has one `...Changed` per subject — a submission that has just been
 * made and one that has just been judged arrive on the same event, carrying the
 * same projection — so a handler that only patches what it already has is a
 * handler that discards half of what it is sent. That is how a participant
 * watched their own submissions list and never saw the row they had just made.
 */

/**
 * A number for an effect's dependency list, and the way to ask for another run.
 *
 * **Debounced, because the reason to ask is an event.** A hundred and fifty
 * submissions accepted in four minutes are one refetch, not a hundred and
 * fifty; the first miss schedules it and the rest ride along, because by the
 * time it runs they are all in the answer anyway.
 */
export const useReload = (delayMs = 400): [number, () => void] => {
    const [generation, setGeneration] = useState(0);
    const pending = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    // A screen left while a refetch was scheduled would otherwise set state on
    // a component nobody is looking at.
    useEffect(() => () => {
        if (pending.current !== undefined) clearTimeout(pending.current);
    }, []);

    const again = useCallback(() => {
        if (pending.current !== undefined) return;
        pending.current = setTimeout(() => {
            pending.current = undefined;
            setGeneration(n => n + 1);
        }, delayMs);
    }, [delayMs]);

    return [generation, again];
};

/**
 * A row that arrived, applied to the page on screen.
 *
 * Patched in place when the page holds it — a rejudge walking through queued
 * and running must not reload the page three times under somebody reading it.
 *
 * **And a refetch when it does not**, rather than an insertion: what is on
 * screen is one page of an order and a set of filters the Server decided, and a
 * row put at the top by the Client would be in the wrong place as often as the
 * right one. Asking again is the only answer that cannot be wrong.
 *
 * Safe to call from inside a `setState` updater: `absent` only schedules.
 */
export const applied = <T extends { id: string }>(
    current: T[] | undefined,
    row: T,
    absent: () => void,
): T[] | undefined => {
    if (!current) return current;
    if (!current.some(one => one.id === row.id)) {
        absent();
        return current;
    }
    return current.map(one => (one.id === row.id ? row : one));
};
