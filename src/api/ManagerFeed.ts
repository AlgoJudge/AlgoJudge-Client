import { ManagerEventType } from "./ManagerApi";

/**
 * Whether the manager panel's own events are being delivered right now.
 *
 * A manager reading a list during a contest is reading something that moves
 * under them, and sometimes the useful thing is for it to stop. This is what
 * stops it — **for the panel only**. The participant and core dispatchers are
 * separate objects and this is an instance field of the third, so a participant
 * never loses a verdict, a round change or a session ending because somebody
 * else pressed a switch.
 *
 * **Nothing is queued.** The product's rule is that a reconnect is a refetch —
 * no replay, no cursor, no catch-up buffer — and a pause is a small
 * disconnection. A held frame replayed later would also be *stale*: a manager's
 * own writes still refetch while paused, so replaying what was held would write
 * an older row over a newer one, which the live path cannot do.
 *
 * It lives beside `Availability` rather than in a React context for the reason
 * that one gives: the transport cannot import a context, and it must be
 * constructible in Node — `scripts/check-events.mjs` builds a dispatcher with
 * no window, no storage and no DOM.
 */
export interface FeedState {
    /** The switch. */
    readonly live: boolean;
    /** Open dialogs. A counter, so two dialogs are two holds. */
    readonly holds: number;
    /**
     * Which kinds of thing were withheld since the last catch-up.
     *
     * **Kinds, never a count of frames.** One rejudge is three
     * `submissionChanged` frames for one submission, and some frames concern
     * rows that are not on screen; "12 changes waiting" would be a number read
     * as a workload that is not one.
     */
    readonly kinds: readonly ManagerEventType[];
    /** When the first one was withheld, for "since 14:32". */
    readonly since: number | undefined;
}

export interface ManagerFeed {
    getSnapshot(): FeedState;
    subscribe(listener: () => void): () => void;
    setLive(live: boolean): void;
    /** Holds delivery until the returned release is called. Idempotent. */
    hold(): () => void;
    /** The backlog has been dealt with — usually by refetching. */
    clear(): void;
}

/**
 * Manager-audience names that are delivered even while the feed is held.
 *
 * `instanceChanged` is routed to the manager dispatcher but consumed by
 * `InstanceProvider`, which is the application shell — the footer, the nav, the
 * front page, for participants too. Holding it would stop an operator's new
 * logo reaching a paused manager's chrome and buy nothing, because no *panel
 * screen* reads it.
 *
 * `Partial<Record<…>>` rather than a string array so a typo does not compile.
 */
const ALWAYS: Partial<Record<ManagerEventType, true>> = {
    instanceChanged: true,
};

const IDLE: FeedState = { live: true, holds: 0, kinds: [], since: undefined };

export class ManagerFeedGate implements ManagerFeed {
    private state: FeedState = IDLE;
    private readonly listeners = new Set<() => void>();

    getSnapshot(): FeedState {
        return this.state;
    }

    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    /** Whether a frame of this kind may be delivered now. */
    admits(type: ManagerEventType): boolean {
        return ALWAYS[type] === true || (this.state.live && this.state.holds === 0);
    }

    /** Records that one was withheld. The frame itself is dropped. */
    suppress(type: ManagerEventType): void {
        const kinds = this.state.kinds.includes(type)
            ? this.state.kinds
            : [...this.state.kinds, type];
        if (kinds === this.state.kinds && this.state.since !== undefined) return;
        this.replace({ kinds, since: this.state.since ?? Date.now() });
    }

    setLive(live: boolean): void {
        if (this.state.live === live) return;
        this.replace({ live });
    }

    hold(): () => void {
        this.replace({ holds: this.state.holds + 1 });
        let released = false;
        return () => {
            // Idempotent: React's strict mode runs an effect's cleanup twice in
            // development, and a hold released twice would drop the count below
            // zero and hold nothing for ever.
            if (released) return;
            released = true;
            this.replace({ holds: Math.max(0, this.state.holds - 1) });
        };
    }

    clear(): void {
        if (this.state.kinds.length === 0 && this.state.since === undefined) return;
        this.replace({ kinds: [], since: undefined });
    }

    private replace(changes: Partial<FeedState>): void {
        this.state = { ...this.state, ...changes };
        for (const listener of this.listeners) listener();
    }
}
