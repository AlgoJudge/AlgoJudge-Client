import { createContext, useContext, useEffect } from "react";
import { ManagerEventType } from "../api/ManagerApi";

/**
 * How many times somebody has asked for the screens to be read again.
 *
 * The twin of `ConnectionContext`, and deliberately a second number rather than
 * a second writer on that one. A reconnect and a manager pressing **Odśwież**
 * are different facts, and folding them into one counter leaves whoever debugs a
 * spurious refetch with two suspects and no way to tell them apart.
 *
 * `useApiEffect` carries it in every dependency list, so bumping it refetches
 * all forty-two call sites without one of them changing — which is also why
 * `lint:deps` never sees this: no call site's callback references it and no call
 * site's list declares it.
 */
export const RefreshContext = createContext<number>(0);

export const useRefreshGeneration = (): number => useContext(RefreshContext);

/** What the panel's live-update controls read and drive. */
export interface LiveUpdates {
    /** Whether manager events are being delivered. */
    live: boolean;
    /** Something was withheld since the last catch-up. */
    pending: boolean;
    /** When the first withheld thing arrived, for "since 14:32". */
    since: number | undefined;
    /** Which kinds were withheld. Kinds, never a count of frames. */
    kinds: readonly ManagerEventType[];
    setLive: (live: boolean) => void;
    /** Read everything on screen again, now. */
    refreshNow: () => void;
    /**
     * Holds delivery until the returned release is called.
     *
     * Carried on the context rather than reached through `useApi` so that
     * `useRefreshHold` below does not have to import `apiContext`, which imports
     * this. A cycle between the two would compile and then fail at run time in
     * whichever order the bundler happened to choose.
     */
    hold: () => () => void;
}

export const LiveUpdatesContext = createContext<LiveUpdates | undefined>(undefined);

export const useLiveUpdates = (): LiveUpdates => {
    const value = useContext(LiveUpdatesContext);
    if (!value) throw new Error("useLiveUpdates outside RefreshProvider");
    return value;
};

/**
 * Holds the panel's refreshes while `active` — a dialog that is open, a form
 * with something typed into it.
 *
 * The release is the effect's cleanup, which React runs on unmount including an
 * abrupt one, so a hold cannot outlive the component that took it; and the
 * release is idempotent, so strict mode's mount/cleanup/mount leaves the count
 * where it found it.
 */
export const useRefreshHold = (active: boolean): void => {
    const { hold } = useLiveUpdates();
    useEffect(() => {
        if (!active) return;
        return hold();
    }, [hold, active]);
};
