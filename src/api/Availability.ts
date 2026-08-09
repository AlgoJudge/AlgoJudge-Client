import { ServiceUnavailableError } from "./ApiError";

/**
 * Whether the Server is answering at all.
 *
 * **Its own member on the API rather than an event on a dispatcher.** The three
 * dispatchers carry what the *Server* said, and their names are diffed against
 * the catalogue the Server commits — synthesising `maintenanceChanged` here
 * would mean claiming the Server announced a window when what actually happened
 * was a proxy refusing a connection. Those are different facts and only one of
 * them is the Server's.
 *
 * One listener in practice: the gate above the router. It exists as a
 * subscription anyway because the transport cannot import a React context, and
 * because the fake has to implement the same surface without pretending to have
 * a network.
 */
export interface Availability {
    /**
     * Told whenever a call failed because the Server was away. Returns the
     * unsubscribe.
     *
     * Called on **every** such failure, not only the first: a screen with six
     * requests in flight produces six, and whoever listens is expected to be
     * idempotent about it.
     */
    onUnavailable(listener: (error: ServiceUnavailableError) => void): () => void;
}

/** The plain implementation: a set of listeners and nothing else. */
export class AvailabilitySignal implements Availability {
    private readonly listeners = new Set<(error: ServiceUnavailableError) => void>();

    onUnavailable(listener: (error: ServiceUnavailableError) => void): () => void {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    }

    /** Called by the transport. */
    report(error: ServiceUnavailableError): void {
        for (const listener of this.listeners) listener(error);
    }
}

/**
 * The fake's. It has no network to lose, so nothing ever fires — a window is
 * reached there through `?fakeMaintenance=`, which the health call answers.
 */
export class NoAvailabilitySignal implements Availability {
    onUnavailable(): () => void {
        return () => { };
    }
}
