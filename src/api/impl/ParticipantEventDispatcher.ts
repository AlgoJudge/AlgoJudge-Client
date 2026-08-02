import { ParticipantEvent, ParticipantEventDispatcher, ParticipantEventType } from "../ParticipantApi";
import { EventDispatcher } from "./EventDispatcher";

export class ParticipantEventDispatcherImpl implements ParticipantEventDispatcher {
    private readonly eventDispatcher: EventDispatcher = new EventDispatcher();
    addEventListener<T extends ParticipantEventType, V>(type: T, listener: (evt: ParticipantEvent<T, V>) => void, signal: AbortSignal): void {
        this.eventDispatcher.addEventListener(type, listener, signal);
    }
    dispatchEvent<T extends ParticipantEventType, V>(evt: ParticipantEvent<T, V>): void {
        this.eventDispatcher.dispatchEvent(evt);
    }
}
