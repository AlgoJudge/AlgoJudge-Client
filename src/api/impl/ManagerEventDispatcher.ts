import { ManagerEvent, ManagerEventDispatcher, ManagerEventType } from "../ManagerApi";
import { EventDispatcher } from "./EventDispatcher";

export class ManagerEventDispatcherImpl implements ManagerEventDispatcher {
    private readonly eventDispatcher: EventDispatcher = new EventDispatcher();
    addEventListener<T extends ManagerEventType, V>(type: T, listener: (evt: ManagerEvent<T, V>) => void, signal: AbortSignal): void {
        this.eventDispatcher.addEventListener(type, listener, signal);
    }
    dispatchEvent<T extends ManagerEventType, V>(evt: ManagerEvent<T, V>): void {
        this.eventDispatcher.dispatchEvent(evt);
    }
}
