import { FC, ReactNode, useEffect, useState } from "react";
import { ServiceUnavailableError } from "../api/ApiError";
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
            .catch((error: unknown) => {
                if (controller.signal.aborted) return;
                // **An outage is not a sign-out.** `getSession` answers
                // `undefined` when nobody is signed in; a Server that is away
                // answers nothing at all, and calling that "anonymous" sends a
                // signed-in person to a login form that cannot work either.
                // The gate above has already replaced the screen, and this
                // provider mounts again — and asks again — when it lifts.
                if (error instanceof ServiceUnavailableError) return;
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

    /**
     * Ends the session, and leaves for the front page.
     *
     * **The leaving belongs here and not to the caller.** `RequireSession`
     * renders a redirect to `/login` the instant the status turns anonymous, and
     * an installation that sets `signInRedirectProvider` sends `/login` straight
     * on to the provider — which still holds a session of its own and hands the
     * same person back. A caller navigating after `signOut` resolves is racing
     * that guard and loses, so on such an installation there was no way to sign
     * out at all. Reported from production on 2026-09-08; three of the four
     * callers had written that losing race.
     *
     * **A document load, not a router navigation, and `replace` not `assign`.**
     * The one moment where dropping everything this person's session left in
     * memory is the point is this one, and the room is often shared. `replace`
     * because Back would otherwise return to a guarded screen, which is the trap
     * again with one more step.
     *
     * The status is deliberately not cleared first: this document is going away
     * and the next one starts anonymous, while clearing it would give the guard
     * a frame in which to render the redirect this exists to avoid.
     */
    const signOut = async (): Promise<void> => {
        const controller = new AbortController();
        try {
            await api.authApi.logout(controller.signal);
        } finally {
            // Left whatever the Server answered: a failed logout that stayed on
            // a signed-in screen would be the worse of the two.
            window.location.replace("/");
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
