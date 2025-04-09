import { CoreEventDispatcher, SystemMessageEvent } from "../CoreApi";
import { EventDispatcher } from "./EventDispatcher";

type EventType = "SystemMessageEvent";

export class CoreEventDispatcherImpl implements CoreEventDispatcher {
    private readonly eventDispatcher: EventDispatcher<EventType> = new EventDispatcher();
    addSystemMessageEventListener(listener: (evt: SystemMessageEvent) => void, signal: AbortSignal): void {
        this.eventDispatcher.addEventListener("SystemMessageEvent", listener, signal);
    }
    dispatchSystemMessageEvent(evt: SystemMessageEvent): void {
        this.eventDispatcher.dispatchEvent("SystemMessageEvent", evt);
    }
}
