/**
 * The live half of the API.
 *
 * REST is the source of persistent state; this only says that something
 * changed. Every screen has to be correct with it permanently down — which is
 * how they all worked until it existed — so nothing here returns data and
 * nothing waits for it.
 *
 * One connection per tab, carrying core, participant and manager events
 * together: they are three dispatchers because the audiences differ, not because
 * the transports do. See `docs/protocols/SERVER_CLIENT_EVENTS.md`.
 */
export interface EventConnection {
    /**
     * Opens it, or does nothing if it is already open.
     *
     * Called when a session exists, because the socket is authenticated by the
     * same cookie as everything else and a connection nobody is signed in for
     * would be refused at the handshake.
     */
    start(): void;

    /** Closes it and stops trying to reopen it. */
    stop(): void;
}

/**
 * What the fake uses: it dispatches its own events directly, so there is
 * nothing to connect to and nothing to pretend about.
 */
export class NullEventConnection implements EventConnection {
    start(): void { /* nothing to open */ }
    stop(): void { /* nothing to close */ }
}
