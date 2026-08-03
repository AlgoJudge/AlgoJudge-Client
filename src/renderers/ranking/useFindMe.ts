import { RefObject, useRef } from "react";

/**
 * Scrolls the signed-in participant's own row into view.
 *
 * Participants asked for this explicitly: on a board of several hundred rows,
 * finding your own is otherwise a scroll and a squint.
 */
export const useFindMe = (): [RefObject<HTMLTableRowElement | null>, () => void] => {
    const row = useRef<HTMLTableRowElement | null>(null);
    const scroll = () => row.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    return [row, scroll];
};
