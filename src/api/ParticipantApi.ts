export interface Activity {
    id: string,
    type: string,
    isActive: boolean,
    short: string,
    name: string,
    props: {key: string, value: string}[]
}

export interface ActivityCreatedEvent {
    activity: Activity;
}

export interface ActivityUpdatedEvent {
    activity: Activity;
}

export interface ActivityDeletedEvent {
    activityId: string;
}

export interface ParticipantEventDispatcher {
    addActivityCreatedEventListener(listener: (evt: ActivityCreatedEvent) => void, signal: AbortSignal): void;
    addActivityUpdatedEventListener(listener: (evt: ActivityUpdatedEvent) => void, signal: AbortSignal): void;
    addActivityDeletedEventListener(listener: (evt: ActivityDeletedEvent) => void, signal: AbortSignal): void;
}

export interface ParticipantApi {
    readonly eventDispatcher: ParticipantEventDispatcher;
    getActivities(signal: AbortSignal): Promise<Activity[]>;
    getActivity(id: string, signal: AbortSignal): Promise<Activity>;
}
