import { Api } from "./Api";
import { CoreApi, CoreEvent, CoreEventDispatcher, CoreEventType, SystemMessageEvent, User } from "./CoreApi";
import {
    Grant,
    GrantChangedEvent,
    GrantFilter,
    GrantInput,
    ManagedActivitySummary,
    ManagedUserSummary,
    ManagerApi,
    ManagerEvent,
    ManagerEventDispatcher,
    ManagerEventType,
    PermissionDefinition,
    PermissionTemplate,
    PermissionTemplateChangedEvent,
    PermissionTemplateInput,
} from "./ManagerApi";
import {
    Activity,
    ActivityCreatedEvent,
    ActivityDeletedEvent,
    ActivityFilter,
    ActivityTimesChangedEvent,
    ActivityUpdatedEvent,
    AnnouncementPublishedEvent,
    AskQuestionInput,
    Page,
    ParticipantApi,
    ParticipantEvent,
    ParticipantEventDispatcher,
    ParticipantEventType,
    ProblemDetail,
    ProblemStatusChangedEvent,
    Question,
    QuestionAnsweredEvent,
    QuestionFilter,
    QuestionPublishedEvent,
    RankingChangedEvent,
    SectionOpenedEvent,
    Series,
    SubmissionDetail,
    SubmissionFilter,
    SubmissionStateChangedEvent,
    SubmissionSummary,
    SubmitPayload,
} from "./ParticipantApi";

/**
 * Binds one AbortSignal to every call, so a view never has to pass one around.
 * Purely mechanical: each method forwards to the same method on the underlying
 * API with the signal appended, and must not drift from it.
 */
export class ScopedApi {
    authApi: ScopedCoreApi;
    participantApi: ScopedParticipantApi;
    managerApi: ScopedManagerApi;
    constructor(private api: Api, private signal: AbortSignal) {
        this.authApi = new ScopedCoreApi(this.api.authApi, this.signal);
        this.participantApi = new ScopedParticipantApi(this.api.participantApi, this.signal);
        this.managerApi = new ScopedManagerApi(this.api.managerApi, this.signal);
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
    addEventListener(type: "activityTimesChanged", listener: (evt: ActivityTimesChangedEvent) => void): void;
    addEventListener(type: "sectionOpened", listener: (evt: SectionOpenedEvent) => void): void;
    addEventListener(type: "problemStatusChanged", listener: (evt: ProblemStatusChangedEvent) => void): void;
    addEventListener(type: "submissionStateChanged", listener: (evt: SubmissionStateChangedEvent) => void): void;
    addEventListener(type: "rankingChanged", listener: (evt: RankingChangedEvent) => void): void;
    addEventListener(type: "questionAnswered", listener: (evt: QuestionAnsweredEvent) => void): void;
    addEventListener(type: "questionPublished", listener: (evt: QuestionPublishedEvent) => void): void;
    addEventListener(type: "announcementPublished", listener: (evt: AnnouncementPublishedEvent) => void): void;
    addEventListener<T extends ParticipantEventType, V>(type: T, listener: (evt: ParticipantEvent<T, V>) => void): void {
        this.eventDispatcher.addEventListener(type, listener, this.signal);
    }
}

export class ScopedParticipantApi {
    readonly eventDispatcher: ScopedParticipantEventDispatcher;
    constructor(private participantApi: ParticipantApi, private signal: AbortSignal) {
        this.eventDispatcher = new ScopedParticipantEventDispatcher(this.participantApi.eventDispatcher, this.signal);
    }

    getActivities(filter: ActivityFilter = {}): Promise<Page<Activity>> {
        return this.participantApi.getActivities(filter, this.signal);
    }
    getActivity(idOrSlug: string): Promise<Activity> {
        return this.participantApi.getActivity(idOrSlug, this.signal);
    }

    getSeries(activityId: string): Promise<Series[]> {
        return this.participantApi.getSeries(activityId, this.signal);
    }
    getProblem(activityId: string, problemSlug: string): Promise<ProblemDetail> {
        return this.participantApi.getProblem(activityId, problemSlug, this.signal);
    }

    getSubmissions(activityId: string, filter: SubmissionFilter = {}): Promise<Page<SubmissionSummary>> {
        return this.participantApi.getSubmissions(activityId, filter, this.signal);
    }
    getSubmission(activityId: string, submissionId: string): Promise<SubmissionDetail> {
        return this.participantApi.getSubmission(activityId, submissionId, this.signal);
    }
    getSubmissionFile(activityId: string, submissionId: string, name: string): Promise<string> {
        return this.participantApi.getSubmissionFile(activityId, submissionId, name, this.signal);
    }
    submit(activityId: string, problemSlug: string, payload: SubmitPayload): Promise<SubmissionSummary> {
        return this.participantApi.submit(activityId, problemSlug, payload, this.signal);
    }

    getRanking(activityId: string): Promise<unknown> {
        return this.participantApi.getRanking(activityId, this.signal);
    }

    getQuestions(activityId: string, filter: QuestionFilter = {}): Promise<Page<Question>> {
        return this.participantApi.getQuestions(activityId, filter, this.signal);
    }
    askQuestion(activityId: string, input: AskQuestionInput): Promise<Question> {
        return this.participantApi.askQuestion(activityId, input, this.signal);
    }
    markQuestionRead(activityId: string, questionId: string): Promise<void> {
        return this.participantApi.markQuestionRead(activityId, questionId, this.signal);
    }

    getRules(activityId: string): Promise<unknown> {
        return this.participantApi.getRules(activityId, this.signal);
    }
}

export class ScopedManagerEventDispatcher {
    constructor(private eventDispatcher: ManagerEventDispatcher, private signal: AbortSignal) {}
    addEventListener(type: "permissionTemplateChanged", listener: (evt: PermissionTemplateChangedEvent) => void): void;
    addEventListener(type: "grantChanged", listener: (evt: GrantChangedEvent) => void): void;
    addEventListener<T extends ManagerEventType, V>(type: T, listener: (evt: ManagerEvent<T, V>) => void): void {
        this.eventDispatcher.addEventListener(type, listener, this.signal);
    }
}

export class ScopedManagerApi {
    readonly eventDispatcher: ScopedManagerEventDispatcher;
    constructor(private managerApi: ManagerApi, private signal: AbortSignal) {
        this.eventDispatcher = new ScopedManagerEventDispatcher(this.managerApi.eventDispatcher, this.signal);
    }

    getPermissionCatalogue(): Promise<PermissionDefinition[]> {
        return this.managerApi.getPermissionCatalogue(this.signal);
    }
    getMyPermissions(activityId?: string): Promise<string[]> {
        return this.managerApi.getMyPermissions(activityId, this.signal);
    }

    getPermissionTemplates(): Promise<PermissionTemplate[]> {
        return this.managerApi.getPermissionTemplates(this.signal);
    }
    createPermissionTemplate(input: PermissionTemplateInput): Promise<PermissionTemplate> {
        return this.managerApi.createPermissionTemplate(input, this.signal);
    }
    updatePermissionTemplate(id: string, input: PermissionTemplateInput): Promise<PermissionTemplate> {
        return this.managerApi.updatePermissionTemplate(id, input, this.signal);
    }
    deletePermissionTemplate(id: string): Promise<void> {
        return this.managerApi.deletePermissionTemplate(id, this.signal);
    }

    getGrants(filter: GrantFilter = {}): Promise<Page<Grant>> {
        return this.managerApi.getGrants(filter, this.signal);
    }
    setGrant(input: GrantInput): Promise<Grant> {
        return this.managerApi.setGrant(input, this.signal);
    }
    revokeGrant(id: string): Promise<void> {
        return this.managerApi.revokeGrant(id, this.signal);
    }

    searchUsers(query: string): Promise<ManagedUserSummary[]> {
        return this.managerApi.searchUsers(query, this.signal);
    }
    getManagedActivities(): Promise<ManagedActivitySummary[]> {
        return this.managerApi.getManagedActivities(this.signal);
    }
}
