import { Api } from "./Api";
import { FileApi, StatementRef, UploadedFile } from "./FileApi";
import { InstanceDocumentKind, InstanceDocumentRef } from "./CoreApi";
import {
    CoreApi,
    CoreEvent,
    CoreEventDispatcher,
    CoreEventType,
    Health,
    InstanceInfo,
    MaintenanceChangedEvent,
    ProfileInput,
    RegisterInput,
    Session,
    SessionExpiredEvent,
    SystemMessageEvent,
} from "./CoreApi";
import {
    ActivityChangedEvent,
    ActivityInput,
    Grant,
    GrantChangedEvent,
    GrantFilter,
    GrantInput,
    NewTrial,
    ManagedActivity,
    ManagedActivityFilter,
    ManagedActivitySummary,
    ManagedProblem,
    ManagedProblemVersion,
    ManagedSeries,
    ManagedUserSummary,
    ManagerApi,
    ProblemFilter,
    ProblemInput,
    ProblemVersionInput,
    ProblemVisibility,
    ManagerEvent,
    ManagerEventDispatcher,
    ManagerEventType,
    PermissionDefinition,
    PermissionTemplate,
    PermissionTemplateChangedEvent,
    PermissionTemplateInput,
    AnnouncementInput,
    AnswerInput,
    BulkUserInput,
    CreatedCredential,
    ManagedQuestion,
    ManagedQuestionFilter,
    ManagedSubmission,
    ManagedSubmissionDetail,
    ManagedSubmissionFilter,
    ManagedRunner,
    ManagedRunnerFilter,
    ManagedUser,
    ManagedUserFilter,
    ProblemChangedEvent,
    QuestionChangedEvent,
    SeriesChangedEvent,
    SubmissionChangedEvent,
    RunnerChangedEvent,
    InstanceChangedEvent,
    PauseInput,
    ResumeInput,
    SeriesInput,
    SeriesProblemInput,
    UserChangedEvent,
    UserInput,
    InstanceLogoInput,
    InstanceSettingsInput,
    NewStatement,
    UserSession,
    UserUpdateInput,
    Trial,
} from "./ManagerApi";
import {
    Activity,
    ActivityResults,
    ActivityCreatedEvent,
    ActivityDeletedEvent,
    ActivityDocumentKind,
    ActivityDocumentRef,
    ActivityFilter,
    ActivityTimesChangedEvent,
    ActivityUpdatedEvent,
    AnnouncementPublishedEvent,
    AskQuestionInput,
    EnrolInput,
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
    // Both APIs have one, and they are different events: the manager's carries a
    // `ManagedSeries` and the participant's carries what changed.
    SeriesChangedEvent as ParticipantSeriesChangedEvent,
    Series,
    SubmissionDetail,
    SubmissionFilter,
    SubmissionStateChangedEvent,
    SubmissionSummary,
    SubmitPayload,
} from "./ParticipantApi";

/**
 * One method of an API, with its trailing AbortSignal taken off.
 *
 * `getUsers(filter, signal)` becomes `getUsers(filter)`; anything that is not a
 * method is left as it is.
 */
type WithoutSignal<T> = T extends (...args: [...infer Args, AbortSignal]) => infer Result
    ? (...args: Args) => Result
    : T;

/** Every method of an API, scoped. The dispatcher is scoped separately. */
type Scoped<T> = { [K in keyof T]: WithoutSignal<T[K]> };

/**
 * Fails to compile when a scoped class has drifted from the API it mirrors.
 *
 * These classes are written by hand, so a method added to `ManagerApi` and
 * forgotten here used to compile and simply be missing — the screens could not
 * call it and nothing said why. Assignability says it now.
 */
export type Ensure<Actual extends Expected, Expected> = Actual;

/**
 * Binds one AbortSignal to every call, so a view never has to pass one around.
 * Purely mechanical: each method forwards to the same method on the underlying
 * API with the signal appended, and must not drift from it.
 */
export class ScopedApi {
    authApi: ScopedCoreApi;
    participantApi: ScopedParticipantApi;
    managerApi: ScopedManagerApi;
    fileApi: ScopedFileApi;
    constructor(private api: Api, private signal: AbortSignal) {
        this.authApi = new ScopedCoreApi(this.api.authApi, this.signal);
        this.participantApi = new ScopedParticipantApi(this.api.participantApi, this.signal);
        this.managerApi = new ScopedManagerApi(this.api.managerApi, this.signal);
        this.fileApi = new ScopedFileApi(this.api.fileApi, this.signal);
    }
}

export class ScopedFileApi {
    constructor(private fileApi: FileApi, private signal: AbortSignal) {}
    upload(file: File | Blob, name: string, sha256: string): Promise<UploadedFile> {
        return this.fileApi.upload(file, name, sha256, this.signal);
    }
    getText(id: string): Promise<string> {
        return this.fileApi.getText(id, this.signal);
    }
    getBlob(id: string): Promise<Blob> {
        return this.fileApi.getBlob(id, this.signal);
    }
    /** An address rather than a request, so the signal has nothing to bind to. */
    url(id: string): string {
        return this.fileApi.url(id);
    }
}

export class ScopedCoreEventDispatcher {
    constructor(private eventDispatcher: CoreEventDispatcher, private signal: AbortSignal) {}
    addEventListener(type: "systemMessage", listener: (evt: SystemMessageEvent) => void): void;
    addEventListener(type: "sessionExpired", listener: (evt: SessionExpiredEvent) => void): void;
    addEventListener(type: "maintenanceChanged", listener: (evt: MaintenanceChangedEvent) => void): void;
    addEventListener<T extends CoreEventType, V>(type: T, listener: (evt: CoreEvent<T, V>) => void): void {
        return this.eventDispatcher.addEventListener(type, listener, this.signal);
    }
}

export class ScopedCoreApi {
    readonly eventDispatcher: ScopedCoreEventDispatcher;
    constructor(private coreApi: CoreApi, private signal: AbortSignal) {
        this.eventDispatcher = new ScopedCoreEventDispatcher(this.coreApi.eventDispatcher, this.signal);
    }
    getInstanceInfo(): Promise<InstanceInfo> {
        return this.coreApi.getInstanceInfo(this.signal);
    }
    getHealth(): Promise<Health> {
        return this.coreApi.getHealth(this.signal);
    }
    getSession(): Promise<Session | undefined> {
        return this.coreApi.getSession(this.signal);
    }
    login(login: string, password: string): Promise<Session> {
        return this.coreApi.login(login, password, this.signal);
    }
    logout(): Promise<void> {
        return this.coreApi.logout(this.signal);
    }
    register(input: RegisterInput): Promise<void> {
        return this.coreApi.register(input, this.signal);
    }
    updateProfile(input: ProfileInput): Promise<Session> {
        return this.coreApi.updateProfile(input, this.signal);
    }
    changePassword(currentPassword: string, newPassword: string): Promise<void> {
        return this.coreApi.changePassword(currentPassword, newPassword, this.signal);
    }
    exportData(): Promise<Blob> {
        return this.coreApi.exportData(this.signal);
    }
    deleteAccount(password: string): Promise<void> {
        return this.coreApi.deleteAccount(password, this.signal);
    }
}

export class ScopedParticipantEventDispatcher {
    constructor(private eventDispatcher: ParticipantEventDispatcher, private signal: AbortSignal) {}
    addEventListener(type: "activityCreated", listener: (evt: ActivityCreatedEvent) => void): void;
    addEventListener(type: "activityUpdated", listener: (evt: ActivityUpdatedEvent) => void): void;
    addEventListener(type: "activityDeleted", listener: (evt: ActivityDeletedEvent) => void): void;
    addEventListener(type: "activityTimesChanged", listener: (evt: ActivityTimesChangedEvent) => void): void;
    addEventListener(type: "seriesChanged", listener: (evt: ParticipantSeriesChangedEvent) => void): void;
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
    enroll(idOrSlug: string, input: EnrolInput = {}): Promise<Activity> {
        return this.participantApi.enroll(idOrSlug, input, this.signal);
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
    submit(activityId: string, problemSlug: string, payload: SubmitPayload): Promise<SubmissionSummary> {
        return this.participantApi.submit(activityId, problemSlug, payload, this.signal);
    }

    getResults(activityId: string, seriesId?: string): Promise<ActivityResults> {
        return this.participantApi.getResults(activityId, seriesId, this.signal);
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
}

export class ScopedManagerEventDispatcher {
    constructor(private eventDispatcher: ManagerEventDispatcher, private signal: AbortSignal) {}
    addEventListener(type: "permissionTemplateChanged", listener: (evt: PermissionTemplateChangedEvent) => void): void;
    addEventListener(type: "grantChanged", listener: (evt: GrantChangedEvent) => void): void;
    addEventListener(type: "problemChanged", listener: (evt: ProblemChangedEvent) => void): void;
    addEventListener(type: "activityChanged", listener: (evt: ActivityChangedEvent) => void): void;
    addEventListener(type: "managerSeriesChanged", listener: (evt: SeriesChangedEvent) => void): void;
    addEventListener(type: "submissionChanged", listener: (evt: SubmissionChangedEvent) => void): void;
    addEventListener(type: "questionChanged", listener: (evt: QuestionChangedEvent) => void): void;
    addEventListener(type: "userChanged", listener: (evt: UserChangedEvent) => void): void;
    addEventListener(type: "runnerChanged", listener: (evt: RunnerChangedEvent) => void): void;
    // The implementation signature below is not one a caller can pick, so every
    // member of the union needs a line of its own here. `instanceChanged` had
    // none, which made it unreachable through a scoped dispatcher — the same
    // shape of defect as the one that hid `managerSeriesChanged`.
    addEventListener(type: "instanceChanged", listener: (evt: InstanceChangedEvent) => void): void;
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
    getMyAccess(): Promise<string[]> {
        return this.managerApi.getMyAccess(this.signal);
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

    getRunners(filter: ManagedRunnerFilter = {}): Promise<Page<ManagedRunner>> {
        return this.managerApi.getRunners(filter, this.signal);
    }
    approveRunner(id: string): Promise<ManagedRunner> {
        return this.managerApi.approveRunner(id, this.signal);
    }
    revokeRunner(id: string, reason?: string): Promise<ManagedRunner> {
        return this.managerApi.revokeRunner(id, reason, this.signal);
    }
    setRunnerTags(id: string, tags: string[]): Promise<ManagedRunner> {
        return this.managerApi.setRunnerTags(id, tags, this.signal);
    }
    getRunnerAttachment(runnerId: string, attachmentId: string): Promise<string> {
        return this.managerApi.getRunnerAttachment(runnerId, attachmentId, this.signal);
    }
    forgetRunner(id: string): Promise<void> {
        return this.managerApi.forgetRunner(id, this.signal);
    }

    getUsers(filter: ManagedUserFilter = {}): Promise<Page<ManagedUser>> {
        return this.managerApi.getUsers(filter, this.signal);
    }
    createUser(input: UserInput): Promise<CreatedCredential> {
        return this.managerApi.createUser(input, this.signal);
    }
    createTemporaryUsers(input: BulkUserInput): Promise<CreatedCredential[]> {
        return this.managerApi.createTemporaryUsers(input, this.signal);
    }
    setUserBlocked(id: string, blocked: boolean, reason?: string): Promise<ManagedUser> {
        return this.managerApi.setUserBlocked(id, blocked, reason, this.signal);
    }
    resetUserPassword(id: string): Promise<CreatedCredential> {
        return this.managerApi.resetUserPassword(id, this.signal);
    }
    updateUser(id: string, input: UserUpdateInput): Promise<ManagedUser> {
        return this.managerApi.updateUser(id, input, this.signal);
    }
    approveUser(id: string): Promise<ManagedUser> {
        return this.managerApi.approveUser(id, this.signal);
    }
    getUserSessions(userId: string): Promise<UserSession[]> {
        return this.managerApi.getUserSessions(userId, this.signal);
    }
    getManagedActivities(): Promise<ManagedActivitySummary[]> {
        return this.managerApi.getManagedActivities(this.signal);
    }
    updateInstanceSettings(input: InstanceSettingsInput): Promise<InstanceInfo> {
        return this.managerApi.updateInstanceSettings(input, this.signal);
    }
    setInstanceLogo(input: InstanceLogoInput): Promise<InstanceInfo> {
        return this.managerApi.setInstanceLogo(input, this.signal);
    }
    publishInstanceDocument(kind: InstanceDocumentKind, statements: NewStatement[]): Promise<InstanceInfo> {
        return this.managerApi.publishInstanceDocument(kind, statements, this.signal);
    }
    unpublishInstanceDocument(kind: InstanceDocumentKind): Promise<InstanceInfo> {
        return this.managerApi.unpublishInstanceDocument(kind, this.signal);
    }
    getInstanceDocumentHistory(kind: InstanceDocumentKind): Promise<InstanceDocumentRef[]> {
        return this.managerApi.getInstanceDocumentHistory(kind, this.signal);
    }

    getActivities(filter: ManagedActivityFilter = {}): Promise<Page<ManagedActivity>> {
        return this.managerApi.getActivities(filter, this.signal);
    }
    getActivity(idOrSlug: string): Promise<ManagedActivity> {
        return this.managerApi.getActivity(idOrSlug, this.signal);
    }
    createActivity(input: ActivityInput): Promise<ManagedActivity> {
        return this.managerApi.createActivity(input, this.signal);
    }
    updateActivity(id: string, input: ActivityInput): Promise<ManagedActivity> {
        return this.managerApi.updateActivity(id, input, this.signal);
    }
    setActivityArchived(id: string, archived: boolean): Promise<ManagedActivity> {
        return this.managerApi.setActivityArchived(id, archived, this.signal);
    }
    deleteActivity(id: string): Promise<void> {
        return this.managerApi.deleteActivity(id, this.signal);
    }

    publishActivityDocument(activityId: string, kind: ActivityDocumentKind, statements: NewStatement[]): Promise<ManagedActivity> {
        return this.managerApi.publishActivityDocument(activityId, kind, statements, this.signal);
    }
    unpublishActivityDocument(activityId: string, kind: ActivityDocumentKind): Promise<ManagedActivity> {
        return this.managerApi.unpublishActivityDocument(activityId, kind, this.signal);
    }
    getActivityDocumentHistory(activityId: string, kind: ActivityDocumentKind): Promise<ActivityDocumentRef[]> {
        return this.managerApi.getActivityDocumentHistory(activityId, kind, this.signal);
    }

    getSeries(activityId: string): Promise<ManagedSeries[]> {
        return this.managerApi.getSeries(activityId, this.signal);
    }
    createSeries(activityId: string, input: SeriesInput): Promise<ManagedSeries> {
        return this.managerApi.createSeries(activityId, input, this.signal);
    }
    updateSeries(seriesId: string, input: SeriesInput): Promise<ManagedSeries> {
        return this.managerApi.updateSeries(seriesId, input, this.signal);
    }
    deleteSeries(seriesId: string): Promise<void> {
        return this.managerApi.deleteSeries(seriesId, this.signal);
    }
    shiftSeries(seriesId: string, minutes: number): Promise<ManagedSeries> {
        return this.managerApi.shiftSeries(seriesId, minutes, this.signal);
    }
    pauseSeries(seriesId: string, input: PauseInput): Promise<ManagedSeries> {
        return this.managerApi.pauseSeries(seriesId, input, this.signal);
    }
    resumeSeries(seriesId: string, input: ResumeInput): Promise<ManagedSeries> {
        return this.managerApi.resumeSeries(seriesId, input, this.signal);
    }
    reorderSeries(activityId: string, orderedIds: string[]): Promise<ManagedSeries[]> {
        return this.managerApi.reorderSeries(activityId, orderedIds, this.signal);
    }

    attachProblem(seriesId: string, input: SeriesProblemInput): Promise<ManagedSeries> {
        return this.managerApi.attachProblem(seriesId, input, this.signal);
    }
    updateSeriesProblem(seriesProblemId: string, input: SeriesProblemInput): Promise<ManagedSeries> {
        return this.managerApi.updateSeriesProblem(seriesProblemId, input, this.signal);
    }
    detachProblem(seriesProblemId: string): Promise<ManagedSeries> {
        return this.managerApi.detachProblem(seriesProblemId, this.signal);
    }
    reorderSeriesProblems(seriesId: string, orderedIds: string[]): Promise<ManagedSeries> {
        return this.managerApi.reorderSeriesProblems(seriesId, orderedIds, this.signal);
    }

    getQuestions(filter: ManagedQuestionFilter = {}): Promise<Page<ManagedQuestion>> {
        return this.managerApi.getQuestions(filter, this.signal);
    }
    answerQuestion(id: string, input: AnswerInput): Promise<ManagedQuestion> {
        return this.managerApi.answerQuestion(id, input, this.signal);
    }
    setQuestionPublished(id: string, published: boolean): Promise<ManagedQuestion> {
        return this.managerApi.setQuestionPublished(id, published, this.signal);
    }
    createAnnouncement(activityId: string, input: AnnouncementInput): Promise<ManagedQuestion> {
        return this.managerApi.createAnnouncement(activityId, input, this.signal);
    }
    deleteAnnouncement(id: string): Promise<void> {
        return this.managerApi.deleteAnnouncement(id, this.signal);
    }

    getSubmissions(filter: ManagedSubmissionFilter = {}): Promise<Page<ManagedSubmission>> {
        return this.managerApi.getSubmissions(filter, this.signal);
    }
    getSubmission(id: string): Promise<ManagedSubmissionDetail> {
        return this.managerApi.getSubmission(id, this.signal);
    }
    rejudgeSubmission(id: string): Promise<ManagedSubmission> {
        return this.managerApi.rejudgeSubmission(id, this.signal);
    }
    rejudgeSeriesProblem(seriesProblemId: string): Promise<number> {
        return this.managerApi.rejudgeSeriesProblem(seriesProblemId, this.signal);
    }
    rejudgeSeries(seriesId: string): Promise<number> {
        return this.managerApi.rejudgeSeries(seriesId, this.signal);
    }
    cancelAttempt(submissionId: string, attemptId: string): Promise<ManagedSubmissionDetail> {
        return this.managerApi.cancelAttempt(submissionId, attemptId, this.signal);
    }

    getProblems(filter: ProblemFilter = {}): Promise<Page<ManagedProblem>> {
        return this.managerApi.getProblems(filter, this.signal);
    }
    getProblem(id: string): Promise<ManagedProblem> {
        return this.managerApi.getProblem(id, this.signal);
    }
    createProblem(input: ProblemInput): Promise<ManagedProblem> {
        return this.managerApi.createProblem(input, this.signal);
    }
    updateProblem(id: string, input: ProblemInput): Promise<ManagedProblem> {
        return this.managerApi.updateProblem(id, input, this.signal);
    }
    duplicateProblem(id: string): Promise<ManagedProblem> {
        return this.managerApi.duplicateProblem(id, this.signal);
    }
    setProblemVisibility(id: string, visibility: ProblemVisibility, sharedWith: string[]): Promise<ManagedProblem> {
        return this.managerApi.setProblemVisibility(id, visibility, sharedWith, this.signal);
    }
    setProblemArchived(id: string, archived: boolean): Promise<ManagedProblem> {
        return this.managerApi.setProblemArchived(id, archived, this.signal);
    }
    deleteProblem(id: string): Promise<void> {
        return this.managerApi.deleteProblem(id, this.signal);
    }

    getProblemVersions(problemId: string): Promise<ManagedProblemVersion[]> {
        return this.managerApi.getProblemVersions(problemId, this.signal);
    }
    getProblemContent(problemId: string, versionId: string): Promise<StatementRef[]> {
        return this.managerApi.getProblemContent(problemId, versionId, this.signal);
    }
    createProblemVersion(problemId: string, input: ProblemVersionInput): Promise<ManagedProblemVersion> {
        return this.managerApi.createProblemVersion(problemId, input, this.signal);
    }

    requestTrial(input: NewTrial): Promise<Trial> {
        return this.managerApi.requestTrial(input, this.signal);
    }

    getTrial(trialId: string): Promise<Trial> {
        return this.managerApi.getTrial(trialId, this.signal);
    }

    getProblemPackage(problemId: string, versionId: string): Promise<Blob | undefined> {
        return this.managerApi.getProblemPackage(problemId, versionId, this.signal);
    }
}

/**
 * The drift checks. Each says "this scoped class covers that API", and the file
 * stops compiling the day one of them stops being true.
 *
 * The dispatcher is excluded from all three: it is scoped by its own class,
 * which takes the signal off `addEventListener` rather than off the API.
 */
export type EnsuresCoreApi = Ensure<ScopedCoreApi, Scoped<Omit<CoreApi, "eventDispatcher">>>;
export type EnsuresFileApi = Ensure<ScopedFileApi, Scoped<FileApi>>;
export type EnsuresParticipantApi = Ensure<ScopedParticipantApi, Scoped<Omit<ParticipantApi, "eventDispatcher">>>;
export type EnsuresManagerApi = Ensure<ScopedManagerApi, Scoped<Omit<ManagerApi, "eventDispatcher">>>;
