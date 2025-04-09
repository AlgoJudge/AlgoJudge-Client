import { Api } from "./Api";
import { CoreApi, CoreEventDispatcher, SystemMessageEvent, User } from "./CoreApi";
import { Activity, ActivityCreatedEvent, ActivityDeletedEvent, ActivityUpdatedEvent, ParticipantApi, ParticipantEventDispatcher } from "./ParticipantApi";

export class ScopedApi {
    authApi: ScopedCoreApi;
    participantApi: ScopedParticipantApi;
    constructor(private api: Api, private signal: AbortSignal) {
        this.authApi = new ScopedCoreApi(this.api.authApi, this.signal);
        this.participantApi = new ScopedParticipantApi(this.api.participantApi, this.signal);
    }
}

export class ScopedCoreEventDispatcher {
    constructor(private eventDispatcher: CoreEventDispatcher, private signal: AbortSignal) {}
    addSystemMessageEventListener(listener: (evt: SystemMessageEvent) => void): void {
        return this.eventDispatcher.addSystemMessageEventListener(listener, this.signal);
    }
}

export class ScopedCoreApi {
    readonly eventDispatcher: ScopedCoreEventDispatcher;
    constructor(private coreApi: CoreApi, private signal: AbortSignal) {
        this.eventDispatcher = new ScopedCoreEventDispatcher(this.coreApi.eventDispatcher, this.signal);
    }
    login(email: string, password: string): Promise<void> {
        return this.coreApi.login(email, password, this.signal);
    }
    register(email: string, password: string): Promise<void> {
        return this.coreApi.register(email, password, this.signal);
    }
    getUser(): User | undefined {
        return this.coreApi.getUser();
    }
}

export class ScopedParticipantEventDispatcher {
    constructor(private eventDispatcher: ParticipantEventDispatcher, private signal: AbortSignal) {}
    addActivityCreatedEventListener(listener: (evt: ActivityCreatedEvent) => void): void {
        return this.eventDispatcher.addActivityCreatedEventListener(listener, this.signal);
    }

    addActivityUpdatedEventListener(listener: (evt: ActivityUpdatedEvent) => void): void {
        return this.eventDispatcher.addActivityUpdatedEventListener(listener, this.signal);
    }

    addActivityDeletedEventListener(listener: (evt: ActivityDeletedEvent) => void): void {
        return this.eventDispatcher.addActivityDeletedEventListener(listener, this.signal);
    }
}

export class ScopedParticipantApi {
    readonly eventDispatcher: ScopedParticipantEventDispatcher;
    constructor(private participantApi: ParticipantApi, private signal: AbortSignal) {
        this.eventDispatcher = new ScopedParticipantEventDispatcher(this.participantApi.eventDispatcher, this.signal);
    }
    getActivities(): Promise<Activity[]> {
        return this.participantApi.getActivities(this.signal);
    }
    getActivity(id: string): Promise<Activity> {
        return this.participantApi.getActivity(id, this.signal);
    }
}
