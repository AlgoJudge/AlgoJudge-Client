import { createContext, useContext } from "react";

/**
 * What the Server is doing, when it is not serving.
 *
 * `undefined` for `level` means the Server could not be reached at all — a dead
 * proxy, a lost network, a browser that is offline. That is a different sentence
 * to show somebody than a planned window, and the only way to tell them apart is
 * whether anything answered.
 */
export interface ServerAway {
    /** `draining` | `closed`, or absent when nothing answered. */
    level?: string;
    /** What the operator typed, where they typed anything. */
    reason?: string;
}

/**
 * `undefined` while the Server is serving, which is the ordinary state.
 *
 * Exposed as a context even though the gate renders the page itself: the state
 * belongs to the shell, and a banner that wants to say "maintenance at 22:00"
 * later should read it rather than grow a second source.
 */
export const MaintenanceContext = createContext<ServerAway | undefined>(undefined);

export const useServerAway = (): ServerAway | undefined => useContext(MaintenanceContext);
