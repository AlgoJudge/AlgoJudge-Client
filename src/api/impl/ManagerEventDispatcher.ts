import { ManagerEvent, ManagerEventDispatcher, ManagerEventType } from "../ManagerApi";
import { ManagerFeedGate } from "../ManagerFeed";
import { EventDispatcher } from "./EventDispatcher";

/**
 * The manager audience, and the one place its delivery can be held.
 *
 * **The gate is here rather than in the transport**, because the transport is
 * not where events come from under the fake: `ManagerApiFake` dispatches
 * straight into this object at nineteen call sites and `WebSocketEvents` is
 * never constructed, so a gate there would be dead for the whole of `check:ui`
 * and every local session. It is not in `EventDispatcher` either — that base is
 * shared with the core and participant audiences, and a switch that can reach
 * `sessionExpired` is one that eventually will.
 *
 * Here the type signature *is* the audience: `dispatchEvent` accepts only a
 * `ManagerEventType`, and the three routing records in `WebSocketEvents` are
 * disjoint and compiler-checked. "Manager only" is unreachability, not a
 * convention.
 */
export class ManagerEventDispatcherImpl implements ManagerEventDispatcher {
    private readonly eventDispatcher: EventDispatcher = new EventDispatcher();

    // Defaulted so `new ManagerEventDispatcherImpl()` still works: that is how
    // `scripts/check-events.mjs` builds one, in Node, with no React and no DOM.
    constructor(readonly feed: ManagerFeedGate = new ManagerFeedGate()) { }

    addEventListener<T extends ManagerEventType, V>(type: T, listener: (evt: ManagerEvent<T, V>) => void, signal: AbortSignal): void {
        this.eventDispatcher.addEventListener(type, listener, signal);
    }
    dispatchEvent<T extends ManagerEventType, V>(evt: ManagerEvent<T, V>): void {
        // Dropped, never queued. What survives is that something of this kind
        // arrived; the frame does not, because replaying it later could write an
        // older row over one a manager's own action has since refetched.
        if (!this.feed.admits(evt.type)) {
            this.feed.suppress(evt.type);
            return;
        }
        this.eventDispatcher.dispatchEvent(evt);
    }
}
