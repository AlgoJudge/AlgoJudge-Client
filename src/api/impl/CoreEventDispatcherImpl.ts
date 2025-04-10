import { CoreEvent, CoreEventDispatcher, CoreEventType } from "../CoreApi";
import { EventDispatcher } from "./EventDispatcher";

export class CoreEventDispatcherImpl implements CoreEventDispatcher {
    private readonly eventDispatcher: EventDispatcher = new EventDispatcher();
    addEventListener<T extends CoreEventType, V>(type: T, listener: (evt: CoreEvent<T, V>) => void, signal: AbortSignal): void {
        this.eventDispatcher.addEventListener(type, listener, signal);
    }
    dispatchEvent<T extends CoreEventType, V>(evt: CoreEvent<T, V>): void {
        this.eventDispatcher.dispatchEvent(evt);
    }
}
