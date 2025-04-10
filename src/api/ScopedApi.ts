import { Api } from "./Api";
import { CoreApi, CoreEvent, CoreEventDispatcher, CoreEventType, SystemMessageEvent, User } from "./CoreApi";
import { Activity, ActivityCreatedEvent, ActivityDeletedEvent, ActivityUpdatedEvent, ParticipantApi, ParticipantEvent, ParticipantEventDispatcher, ParticipantEventType } from "./ParticipantApi";

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
    addEventListener(type: "systemMessage", listener: (evt: SystemMessageEvent) => void): void;
    addEventListener<T extends CoreEventType, V>(type: T, listener: (evt: CoreEvent<T, V>) => void): void {
        return this.eventDispatcher.addEventListener(type, listener, this.signal);
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
    addEventListener(type: "activityCreated", listener: (evt: ActivityCreatedEvent) => void): void;
    addEventListener(type: "activityUpdated", listener: (evt: ActivityUpdatedEvent) => void): void;
    addEventListener(type: "activityDeleted", listener: (evt: ActivityDeletedEvent) => void): void;
    addEventListener<T extends ParticipantEventType, V>(type: T, listener: (evt: ParticipantEvent<T, V>) => void): void {
        this.eventDispatcher.addEventListener(type, listener, this.signal);
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
