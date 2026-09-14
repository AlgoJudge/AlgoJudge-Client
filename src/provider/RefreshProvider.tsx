import { FC, ReactNode, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useApi } from "./apiContext";
import { LiveUpdates, LiveUpdatesContext, RefreshContext } from "./refreshContext";

const KEY = "aj.manager.live";

/**
 * Any open dialog holds the panel's refreshes.
 *
 * Read off the document rather than declared by each modal, because thirty-one
 * files open one and a rule thirty-one files have to remember is a rule the
 * thirty-second will not. The selector is ARIA rather than a Mantine class:
 * `aria-modal` is emitted by `ModalBase` and by nothing else in the library,
 * while `role="dialog"` alone is also on `Popover.Dropdown` and `HoverCard` —
 * which is why both halves are required. Measured in `@mantine/core` 2026-09-14.
 */
const DIALOG = '[role="dialog"][aria-modal="true"]';

/**
 * Guarded on every access, as `utils/deviceId.ts` is and for the same reason:
 * storage does not answer nothing where it is blocked, it throws — and this
 * provider sits above the router, so a throw here takes the whole application.
 *
 * **Live is the default and the answer to every failure.** A screen that updates
 * itself is the product working; the failure worth avoiding is a panel frozen
 * for a week by a setting nobody remembers making.
 */
const stored = (): boolean => {
    try {
        return sessionStorage.getItem(KEY) !== "off";
    } catch {
        return true;
    }
};

const store = (live: boolean): void => {
    try {
        sessionStorage.setItem(KEY, live ? "on" : "off");
    } catch {
        // It stops being remembered across a reload, which is odd rather than
        // broken, and is not worth failing a screen for.
    }
};

/**
 * Holds the manager panel's live-update posture, and the counter every screen
 * refetches on.
 *
 * Session storage rather than local: the decision is "I am reading this list
 * right now", not a preference about the product, so a new tab is a new
 * intention — and opening the panel in a new tab is the first recovery anybody
 * tries when a screen looks stuck.
 */
export const RefreshProvider: FC<{ children: ReactNode }> = ({ children }) => {
    const api = useApi();
    const feed = api.managerFeed;
    const [generation, setGeneration] = useState(0);

    const subscribe = useCallback((listener: () => void) => feed.subscribe(listener), [feed]);
    const snapshot = useCallback(() => feed.getSnapshot(), [feed]);
    const state = useSyncExternalStore(subscribe, snapshot, snapshot);

    // Seeded once, from the tab's own memory.
    useEffect(() => {
        feed.setLive(stored());
    }, [feed]);

    useEffect(() => {
        let release: (() => void) | undefined;
        const look = (): void => {
            const open = document.querySelector(DIALOG) !== null;
            if (open && !release) release = feed.hold();
            else if (!open && release) {
                release();
                release = undefined;
            }
        };
        const observer = new MutationObserver(look);
        observer.observe(document.body, { childList: true, subtree: true });
        look();
        return () => {
            observer.disconnect();
            release?.();
        };
    }, [feed]);

    // **The backlog applies the moment delivery becomes possible again.** One
    // rule covers both ways in: a dialog closing, and the switch going back on
    // — including the switch being moved while a dialog was still open, where
    // the catch-up waits for the dialog rather than racing it.
    useEffect(() => {
        if (!state.live || state.holds > 0 || state.kinds.length === 0) return;
        feed.clear();
        setGeneration(n => n + 1);
    }, [feed, state.live, state.holds, state.kinds]);

    const value = useMemo<LiveUpdates>(() => ({
        live: state.live,
        pending: state.kinds.length > 0,
        since: state.since,
        kinds: state.kinds,
        setLive: (live: boolean) => {
            store(live);
            feed.setLive(live);
        },
        refreshNow: () => {
            feed.clear();
            setGeneration(n => n + 1);
        },
        hold: () => feed.hold(),
    }), [feed, state.live, state.kinds, state.since]);

    return (
        <LiveUpdatesContext.Provider value={value}>
            <RefreshContext.Provider value={generation}>
                {children}
            </RefreshContext.Provider>
        </LiveUpdatesContext.Provider>
    );
};
