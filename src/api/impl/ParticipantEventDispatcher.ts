import { ActivityCreatedEvent, ActivityDeletedEvent, ActivityUpdatedEvent, ParticipantEventDispatcher } from "../ParticipantApi";
import { EventDispatcher } from "./EventDispatcher";

type EventType = "ActivityCreatedEvent" | "ActivityUpdatedEvent" | "ActivityDeletedEvent";

export class ParticipantEventDispatcherImpl implements ParticipantEventDispatcher {
    private readonly eventDispatcher: EventDispatcher<EventType> = new EventDispatcher();
    addActivityCreatedEventListener(listener: (evt: ActivityCreatedEvent) => void, signal: AbortSignal): void {
        this.eventDispatcher.addEventListener("ActivityCreatedEvent", listener, signal);
    }
    dispatchActivityCreatedEvent(evt: ActivityCreatedEvent): void {
        this.eventDispatcher.dispatchEvent("ActivityCreatedEvent", evt);
    }
    addActivityUpdatedEventListener(listener: (evt: ActivityUpdatedEvent) => void, signal: AbortSignal): void {
        this.eventDispatcher.addEventListener("ActivityUpdatedEvent", listener, signal);
    }
    dispatchActivityUpdatedEvent(evt: ActivityUpdatedEvent): void {
        this.eventDispatcher.dispatchEvent("ActivityUpdatedEvent", evt);
    }
    addActivityDeletedEventListener(listener: (evt: ActivityDeletedEvent) => void, signal: AbortSignal): void {
        this.eventDispatcher.addEventListener("ActivityDeletedEvent", listener, signal);
    }
    dispatchActivityDeletedEvent(evt: ActivityCreatedEvent): void {
        this.eventDispatcher.dispatchEvent("ActivityDeletedEvent", evt);
    }
}
