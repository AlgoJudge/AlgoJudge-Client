import { FC, ReactNode, useEffect, useState } from "react";
import { Session } from "../api/CoreApi";
import { useApi } from "./apiContext";
import { AuthContext, AuthStatus } from "./authContext";

/**
 * The session comes from the API and nowhere else. This provider used to invent
 * one client-side while `CoreApi` held another, which is how a reload could sign
 * somebody out of the interface while their session was still perfectly valid.
 */
export const AuthProvider: FC<{ children: ReactNode }> = ({ children }) => {
    const api = useApi();
    const [status, setStatus] = useState<AuthStatus>("loading");
    const [session, setSessionState] = useState<Session | undefined>(undefined);

    useEffect(() => {
        const controller = new AbortController();

        // Asked once on load: the cookie is the truth, and the Client asks for it
        // rather than trusting anything it stored itself.
        api.authApi.getSession(controller.signal)
            .then(restored => {
                setSessionState(restored);
                setStatus(restored ? "authenticated" : "anonymous");
            })
            .catch(() => {
                if (controller.signal.aborted) return;
                setSessionState(undefined);
                setStatus("anonymous");
            });

        // A session that expires mid-visit ends here, so the guard can act on it
        // instead of leaving screens waiting on requests that will keep failing.
        api.authApi.eventDispatcher.addEventListener("sessionExpired", () => {
            setSessionState(undefined);
            setStatus("anonymous");
        }, controller.signal);

        return () => controller.abort();
    }, [api]);

    const signIn = async (login: string, password: string): Promise<Session> => {
        const controller = new AbortController();
        const created = await api.authApi.login(login, password, controller.signal);
        setSessionState(created);
        setStatus("authenticated");
        return created;
    };

    const signOut = async (): Promise<void> => {
        const controller = new AbortController();
        try {
            await api.authApi.logout(controller.signal);
        } finally {
            // Signed out locally whatever the Server answered: a failed logout
            // that left the interface signed in would be the worse of the two.
            setSessionState(undefined);
            setStatus("anonymous");
        }
    };

    const setSession = (updated: Session) => {
        setSessionState(updated);
        setStatus("authenticated");
    };

    return (
        <AuthContext.Provider value={{ status, session, signIn, signOut, setSession }}>
            {children}
        </AuthContext.Provider>
    );
};
