import { Event } from "./Event";

export interface Activity {
    id: string,
    type: string,
    isActive: boolean,
    short: string,
    name: string,
    props: {key: string, value: string}[]
}

export type ParticipantEventType = "activityCreated" | "activityUpdated" | "activityDeleted";
export type ParticipantEvent<T extends ParticipantEventType, V> = Event<T, V>;

export type ActivityCreatedEvent = ParticipantEvent<"activityCreated", {
    activity: Activity;
}>;

export type ActivityUpdatedEvent = ParticipantEvent<"activityUpdated", {
    activity: Activity;
}>;

export type ActivityDeletedEvent = ParticipantEvent<"activityDeleted", {
    activityId: string;
}>;

export interface ParticipantEventDispatcher {
    addEventListener(type: "activityCreated", listener: (evt: ActivityCreatedEvent) => void, signal: AbortSignal): void;
    addEventListener(type: "activityUpdated", listener: (evt: ActivityUpdatedEvent) => void, signal: AbortSignal): void;
    addEventListener(type: "activityDeleted", listener: (evt: ActivityDeletedEvent) => void, signal: AbortSignal): void;
    addEventListener<T extends ParticipantEventType, V>(type: T, listener: (evt: ParticipantEvent<T, V>) => void, signal: AbortSignal): void;
}

export interface ParticipantApi {
    readonly eventDispatcher: ParticipantEventDispatcher;
    getActivities(signal: AbortSignal): Promise<Activity[]>;
    getActivity(id: string, signal: AbortSignal): Promise<Activity>;
}
