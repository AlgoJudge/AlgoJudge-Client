import { CoreEventType } from "../CoreApi";
import { EventConnection } from "../EventConnection";
import { CoreEventDispatcherImpl } from "../impl/CoreEventDispatcherImpl";
import { ManagerEventDispatcherImpl } from "../impl/ManagerEventDispatcher";
import { ParticipantEventDispatcherImpl } from "../impl/ParticipantEventDispatcher";
import { ManagerEventType } from "../ManagerApi";
import { ParticipantEventType } from "../ParticipantApi";

/**
 * Which dispatcher an event belongs to.
 *
 * Written out as records rather than arrays so the compiler checks them: adding
 * a type to one of the unions and forgetting it here fails to build, instead of
 * producing an event that arrives and is silently dropped.
 */
const CORE: Record<CoreEventType, true> = {
    systemMessage: true,
    sessionExpired: true,
};

const PARTICIPANT: Record<ParticipantEventType, true> = {
    activityCreated: true,
    activityUpdated: true,
    activityDeleted: true,
    activityTimesChanged: true,
    sectionOpened: true,
    problemStatusChanged: true,
    submissionStateChanged: true,
    rankingChanged: true,
    questionAnswered: true,
    questionPublished: true,
    announcementPublished: true,
};

const MANAGER: Record<ManagerEventType, true> = {
    permissionTemplateChanged: true,
    grantChanged: true,
    problemChanged: true,
    activityChanged: true,
    seriesChanged: true,
    submissionChanged: true,
    questionChanged: true,
    userChanged: true,
    runnerChanged: true,
};

// Membership in one of the three records is what decides where an event goes,
// and these say so to the compiler as well as at run time.
const isCore = (type: string): type is CoreEventType => type in CORE;
const isParticipant = (type: string): type is ParticipantEventType => type in PARTICIPANT;
const isManager = (type: string): type is ManagerEventType => type in MANAGER;

/** What the Server sends: the Client's own `Event`, and nothing wrapped around it. */
interface Frame {
    type?: unknown;
    data?: unknown;
}

const FIRST_RETRY_MS = 1000;
const MAX_RETRY_MS = 30000;

/**
 * The one socket, feeding the three dispatchers.
 *
 * **The Server does not serve this yet.** Until it does, the socket fails its
 * handshake, backs off and retries, and every screen carries on reading REST —
 * which is the arrangement every other contract in this repository already has.
 */
export class WebSocketEvents implements EventConnection {
    private socket: WebSocket | undefined;
    private retryMs = FIRST_RETRY_MS;
    private timer: ReturnType<typeof setTimeout> | undefined;
    private wanted = false;
    /** True once a connection has been open and lost, so the next one is a return. */
    private wasConnected = false;
    private readonly restored = new Set<() => void>();

    constructor(
        private readonly url: string,
        private readonly core: CoreEventDispatcherImpl,
        private readonly participant: ParticipantEventDispatcherImpl,
        private readonly manager: ManagerEventDispatcherImpl,
    ) { }

    start(): void {
        if (this.wanted) return;
        this.wanted = true;
        this.open();
    }

    onRestored(listener: () => void): () => void {
        this.restored.add(listener);
        return () => this.restored.delete(listener);
    }

    stop(): void {
        this.wanted = false;
        // A connection taken down on purpose is not one that was lost: starting
        // again is a first connection, not a return, and must not make every
        // screen refetch.
        this.wasConnected = false;
        clearTimeout(this.timer);
        this.timer = undefined;
        // Detached before closing: the close handler exists to reopen, and this
        // close is the one time that is not wanted.
        const socket = this.socket;
        this.socket = undefined;
        socket?.close();
    }

    private open(): void {
        if (!this.wanted || this.socket) return;
        let socket: WebSocket;
        try {
            socket = new WebSocket(this.url);
        } catch {
            // A malformed address, or a document that may not open one. Backing
            // off is still right: nothing here is worth failing a screen for.
            this.reopenLater();
            return;
        }
        this.socket = socket;

        socket.addEventListener("open", () => {
            this.retryMs = FIRST_RETRY_MS;
            // A return, not a first connection: nothing was replayed while the
            // socket was down, so whoever is showing something has to ask again.
            if (this.wasConnected) for (const listener of this.restored) listener();
            this.wasConnected = true;
        });
        socket.addEventListener("message", event => { this.receive(event.data); });
        socket.addEventListener("close", () => {
            if (this.socket !== socket) return;
            this.socket = undefined;
            this.reopenLater();
        });
        // `error` is always followed by `close`, so reopening is left to that
        // one handler rather than raced between two.
    }

    /**
     * Backs off, and never gives up while a session lasts.
     *
     * Doubling to half a minute: a Server restart is over in seconds and a
     * network that is properly gone should not be asked every second for an
     * hour. Reconnecting is cheap because there is nothing to replay — a screen
     * that has missed events refetches, since REST is the state.
     */
    private reopenLater(): void {
        if (!this.wanted || this.timer) return;
        const wait = this.retryMs;
        this.retryMs = Math.min(this.retryMs * 2, MAX_RETRY_MS);
        this.timer = setTimeout(() => {
            this.timer = undefined;
            this.open();
        }, wait);
    }

    private receive(raw: unknown): void {
        if (typeof raw !== "string") return;
        let frame: Frame;
        try {
            frame = JSON.parse(raw) as Frame;
        } catch {
            // A Server sending something that is not JSON is a fault, and not
            // one worth taking a screen down for.
            return;
        }
        const type = frame.type;
        if (typeof type !== "string") return;

        // `data` is passed through untouched. The payloads are declared beside
        // their event types and the Server is what fills them; re-checking their
        // shape here would be a second, quietly different contract.
        const data = frame.data as never;
        if (isCore(type)) this.core.dispatchEvent({ type, data });
        else if (isParticipant(type)) this.participant.dispatchEvent({ type, data });
        else if (isManager(type)) this.manager.dispatchEvent({ type, data });
        // An unknown type is ignored on purpose: a newer Server may send events
        // this build has never heard of, and that must not break the tab.
    }
}

/**
 * The socket's address, from the API's.
 *
 * `https://api.example.com/api/v1` gives `wss://api.example.com/api/v1/ws`, and
 * the relative `/api/v1` gives the same host the application came from — which
 * is the case one domain serving both produces.
 */
export const eventUrl = (baseUrl: string): string => {
    const absolute = new URL(baseUrl, window.location.origin);
    absolute.protocol = absolute.protocol === "https:" ? "wss:" : "ws:";
    absolute.pathname = `${absolute.pathname.replace(/\/+$/, "")}/ws`;
    return absolute.toString();
};
