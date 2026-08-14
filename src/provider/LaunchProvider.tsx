import { FC, ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LaunchContext } from "../api/LtiApi";
import { useApi } from "./apiContext";
import {
    LaunchState,
    LaunchStateContext,
    readStoredLaunch,
    storeLaunch,
} from "./launchContext";

/**
 * Turns the ticket a launch redirected with into the state the interface renders
 * from.
 *
 * <b>The ticket is exchanged once, on the first render after the redirect.</b>
 * After that the answer lives in this tab, because a launch is a journey through
 * an activity rather than a single page — and re-claiming on every navigation
 * would need a ticket that is not single-use, which is the property that makes
 * it worth anything.
 *
 * §5.2's rule is what this implements: the confined presentation is entered
 * because of how the session was established. The ticket is the Server's word
 * that a launch happened; the address bar is not consulted for the mode, only
 * for the ticket itself.
 */
export const LaunchProvider: FC<{ children: ReactNode }> = ({ children }) => {
    const api = useApi();
    const { i18n } = useTranslation();
    const [state, setState] = useState<LaunchState>(() => {
        const stored = readStoredLaunch();
        return stored ? { status: "launched", launch: stored } : { status: "loading" };
    });

    useEffect(() => {
        const parameters = new URLSearchParams(window.location.search);
        const ticket = parameters.get("ticket");

        if (!ticket) {
            // Nothing to claim. Either this tab already holds a launch, or it
            // was never in one — both are settled states rather than a wait.
            setState(current =>
                current.status === "loading"
                    ? { status: readStoredLaunch() ? "launched" : "none",
                        launch: readStoredLaunch() }
                    : current);
            return;
        }

        const controller = new AbortController();

        // **One exchange per ticket, however many times this effect runs.**
        // React's StrictMode invokes an effect twice in development, and a
        // remount would do it in production: the first claim spends the ticket
        // and the second is refused, which is correct of the Server and fatal
        // here if both are treated as answers. Sharing the promise makes the
        // second caller wait for the first rather than ask again.
        const claim = claims.get(ticket)
            ?? api.ltiApi.claimLaunch(ticket, controller.signal);
        claims.set(ticket, claim);

        claim
            .then(launch => {
                storeLaunch(launch);
                setState({ status: "launched", launch });
                applyLocale(launch);
                // **The ticket leaves the address bar the moment it is spent.**
                // It is worth nothing afterwards, but a URL somebody copies out
                // of a shared screen should not carry one at all.
                stripTicket();
            })
            .catch((error: unknown) => {
                if (controller.signal.aborted) return;
                claims.delete(ticket);
                // **A refused claim never overwrites a launch already held.**
                // The commonest refusal is a second exchange of a ticket the
                // first one spent, and treating that as "no launch" throws away
                // the good answer that arrived a moment earlier — the interface
                // then leaves the confined mode for no reason a person could
                // explain.
                setState(current => current.status === "launched"
                    ? current
                    : { status: "failed" });
                stripTicket();
                void error;
            });

        return () => controller.abort();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [api]);

    const applyLocale = (launch: LaunchContext) => {
        // §5.4 — the platform knows what language the course is taken in, and it
        // is a better answer than the browser's for somebody taking a Polish
        // course on an English laptop. Only when the platform actually said so.
        if (launch.locale && i18n.language !== launch.locale) {
            void i18n.changeLanguage(launch.locale.split("-")[0]);
        }
    };

    return (
        <LaunchStateContext.Provider value={state}>
            {children}
        </LaunchStateContext.Provider>
    );
};

/**
 * Exchanges in flight, by ticket.
 *
 * Module-level rather than a ref, because the second caller may be a second
 * mount of this component rather than a second render of one — and a ref does
 * not survive that.
 */
const claims = new Map<string, Promise<LaunchContext>>();

/** Removes the ticket from the address without adding a history entry. */
const stripTicket = (): void => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("ticket")) return;
    url.searchParams.delete("ticket");
    window.history.replaceState(window.history.state, "", url.toString());
};
