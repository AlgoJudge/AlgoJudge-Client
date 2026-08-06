import { createContext, useContext } from "react";

/**
 * How many times the event connection has come back after being lost.
 *
 * A number rather than a flag, because what a screen needs is to notice a
 * change: `useApiEffect` carries it in its dependency list, so every call site
 * refetches on a reconnect without a line of its own. Nothing else reads it.
 *
 * Zero until something is lost, which is the ordinary case and the one where no
 * screen should refetch anything.
 */
export const ConnectionContext = createContext<number>(0);

export const useConnectionGeneration = (): number => useContext(ConnectionContext);
