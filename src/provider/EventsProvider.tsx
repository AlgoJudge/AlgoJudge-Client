import { FC, ReactNode, useEffect, useState } from "react";
import { useApi } from "./apiContext";
import { useAuth } from "./authContext";
import { ConnectionContext } from "./connectionContext";

/**
 * Holds the event connection open for as long as there is a session, and counts
 * the times it has come back.
 *
 * The socket is authenticated by the same cookie as every request, so opening
 * one before anybody has signed in only earns a refused handshake, and leaving
 * one open after signing out would keep a connection the Server has stopped
 * sending anything to.
 *
 * The screens read the three dispatchers, as they always have, and the
 * connection is what fills them. What this provides is the count: nothing is
 * replayed after a reconnect, so `useApiEffect` carries it and every screen
 * asks again. Against the fake it does nothing at all — the fake dispatches its
 * own events directly and never loses a connection it never had.
 */
export const EventsProvider: FC<{ children: ReactNode }> = ({ children }) => {
    const api = useApi();
    const { status } = useAuth();
    const [generation, setGeneration] = useState(0);

    useEffect(() => {
        if (status !== "authenticated") return;
        const unsubscribe = api.events.onRestored(() => setGeneration(n => n + 1));
        api.events.start();
        // Stopped on sign-out and on unmount alike: both mean this tab has no
        // session to carry events for.
        return () => {
            unsubscribe();
            api.events.stop();
        };
    }, [api, status]);

    return (
        <ConnectionContext.Provider value={generation}>
            {children}
        </ConnectionContext.Provider>
    );
};
