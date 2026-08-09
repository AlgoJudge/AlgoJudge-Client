import { FC, ReactNode, useEffect, useState } from "react";
import MaintenancePage from "../pages/error/MaintenancePage";
import { useApi } from "./apiContext";
import { MaintenanceContext, ServerAway } from "./maintenanceContext";

/** The same shape the event socket backs off with, for the same reason. */
const FIRST_RETRY_MS = 1000;
const MAX_RETRY_MS = 30000;

const same = (a: ServerAway | undefined, b: ServerAway | undefined): boolean =>
    a === b || (!!a && !!b && a.level === b.level && a.reason === b.reason);

/**
 * Stands the interface aside while the Server is away, and puts it back when it
 * returns.
 *
 * **Above the session on purpose.** The login screen is part of what an outage
 * breaks: a Server that cannot answer `/account` cannot answer
 * `/identity/login` either, so bouncing somebody to a form that will also fail
 * is the worst available answer. Sitting above `AuthProvider` means the page
 * needs no session and replaces the sign-in screen as well as the application.
 *
 * **Replacing rather than covering** also does the recovery for free: the tree
 * below is unmounted while the Server is away, so when it comes back every
 * screen mounts fresh and asks again. Nothing has to be told to refetch, and
 * nothing is left showing what was true before the window.
 *
 * It learns from three places, which is one more than it looks. The transport
 * says a call was refused. The socket says an operator threw the switch, which
 * is what reaches a tab that happens to be asking for nothing. And `/health` is
 * what decides it is over — the only endpoint that keeps answering, and
 * therefore the only one that can say so.
 */
export const MaintenanceProvider: FC<{ children: ReactNode }> = ({ children }) => {
    const api = useApi();
    const [away, setAway] = useState<ServerAway | undefined>(undefined);
    const blocked = away !== undefined;

    // ── what the Server, or the lack of one, says ───────────────────────────
    useEffect(() => {
        const controller = new AbortController();

        // A refused call. **Nothing is claimed about why**: a 503 from an edge
        // proxy carries no level and no reason, and inventing one would put a
        // sentence on the screen the Server never said. The poll below fills in
        // what is actually known.
        const stopListening = api.availability.onUnavailable(() => {
            setAway(current => current ?? {});
        });

        // The socket, which is how a tab that is **asking for nothing** finds
        // out — a reader left on a problem statement would otherwise learn at
        // the next thing they clicked.
        //
        // It puts a Client **into** the page and cannot be what takes it out:
        // blocking unmounts the tree below, the socket with it, and at `closed`
        // the Server refuses the handshake anyway. Coming back is the poll's
        // job, and only the poll's.
        api.authApi.eventDispatcher.addEventListener("maintenanceChanged", evt => {
            const maintenance = evt.data?.maintenance;
            setAway(maintenance && maintenance.level !== "open"
                ? { level: maintenance.level, reason: maintenance.reason }
                : undefined);
        }, controller.signal);

        return () => {
            stopListening();
            controller.abort();
        };
    }, [api]);

    // ── asking whether it is over ──────────────────────────────────────────
    //
    // Asked once when the application loads, so a browser that arrives during a
    // window sees the page rather than a screenful of failures — and then in a
    // loop for as long as it is away, and not at all while it is not. An open
    // installation costs one request per load and nothing after it.
    useEffect(() => {
        const controller = new AbortController();
        let timer: ReturnType<typeof setTimeout> | undefined;
        let waitMs = FIRST_RETRY_MS;

        const ask = async () => {
            let answer: ServerAway | undefined;

            try {
                const maintenance = (await api.authApi.getHealth(controller.signal)).maintenance;
                // A level this build has never heard of is **not open**. The
                // safe reading of an unknown word is that the Server has
                // withdrawn further than this Client knows about, not that it is
                // fine.
                answer = maintenance && maintenance.level !== "open"
                    ? { level: maintenance.level, reason: maintenance.reason }
                    : undefined;
            } catch {
                if (controller.signal.aborted) return;
                // Health failing is itself an answer: away, and not even
                // answering the one endpoint that stays up during a window.
                answer = {};
            }

            setAway(current => same(current, answer) ? current : answer);
            if (controller.signal.aborted) return;

            // Only while away. When it is over this effect is torn down by the
            // state it just set, and nothing polls an installation that is
            // working.
            if (answer) {
                waitMs = Math.min(waitMs * 2, MAX_RETRY_MS);
                timer = setTimeout(() => void ask(), waitMs);
            }
        };

        void ask();

        return () => {
            controller.abort();
            if (timer !== undefined) clearTimeout(timer);
        };
        // `blocked` rather than `away`: the loop has to start when the transport
        // or the socket says the Server has gone, and it must not restart on
        // every answer that says the same thing again.
    }, [api, blocked]);

    return (
        <MaintenanceContext.Provider value={away}>
            {away ? <MaintenancePage away={away} /> : children}
        </MaintenanceContext.Provider>
    );
};
