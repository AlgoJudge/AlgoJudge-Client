import { FC, ReactNode, useEffect } from "react";
import { useApi } from "./apiContext";
import { useAuth } from "./authContext";

/**
 * Holds the event connection open for as long as there is a session.
 *
 * The socket is authenticated by the same cookie as every request, so opening
 * one before anybody has signed in only earns a refused handshake, and leaving
 * one open after signing out would keep a connection the Server has stopped
 * sending anything to.
 *
 * It provides nothing: the screens read the three dispatchers, as they always
 * have, and the connection is what fills them. Against the fake it does nothing
 * at all — the fake dispatches its own events directly.
 */
export const EventsProvider: FC<{ children: ReactNode }> = ({ children }) => {
    const api = useApi();
    const { status } = useAuth();

    useEffect(() => {
        if (status !== "authenticated") return;
        api.events.start();
        // Stopped on sign-out and on unmount alike: both mean this tab has no
        // session to carry events for.
        return () => api.events.stop();
    }, [api, status]);

    return <>{children}</>;
};
