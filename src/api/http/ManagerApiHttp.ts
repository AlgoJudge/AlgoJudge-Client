import { InstanceDocumentKind, InstanceDocumentRef, InstanceInfo } from "../CoreApi";
import {
    ActivityGroup,
    ActivityGroupInput,
    ActivityInput,
    DeletionRequest,
    DeletionRequestFilter,
    Grant,
    IdentityProvider,
    IdentityProviderInput,
    GrantFilter,
    GrantInput,
    ManagedActivity,
    ManagedActivityFilter,
    ManagedActivitySummary,
    ManagedProblem,
    ManagedProblemVersion,
    ManagedSeries,
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
    ManagedUserSummary,
    ManagerApi,
    NewTrial,
    ProblemFilter,
    ProblemInput,
    ProblemVersionInput,
    ProblemVisibility,
    PermissionDefinition,
    PermissionTemplate,
    PermissionTemplateInput,
    PauseInput,
    ResumeInput,
    SeriesInput,
    Trial,
    SeriesProblemInput,
    UserInput,
    InstanceLogoInput,
    AccessKey,
    AccessKeyValue,
    ExternalContent,
    InstanceSettingsInput,
    NewStatement,
    UserSession,
    UserUpdateInput,
} from "../ManagerApi";
import { StatementRef, UploadedFile } from "../FileApi";
import { ActivityDocumentKind, ActivityDocumentRef, Page } from "../ParticipantApi";
import { ManagerEventDispatcherImpl } from "../impl/ManagerEventDispatcher";
import { HttpClient } from "./HttpClient";

/**
 * The manager API over REST, on the decided contract: resource-oriented,
 * versioned in the path, filtering by query parameter.
 *
 * **These endpoints do not exist on the Server yet**, so every call answers 404
 * until they do and the fake is what the screens run against.
 */
export class ManagerApiHttp implements ManagerApi {
    readonly eventDispatcher = new ManagerEventDispatcherImpl();

    constructor(private readonly http: HttpClient) { }

    getPermissionCatalogue(signal: AbortSignal): Promise<PermissionDefinition[]> {
        return this.http.request<PermissionDefinition[]>("/permissions", "GET", { signal });
    }

    getMyPermissions(activityId: string | undefined, signal: AbortSignal): Promise<string[]> {
        return this.http.request<string[]>("/permissions/mine", "GET", {
            signal,
            query: activityId ? { activityId } : {},
        });
    }

    getMyAccess(signal: AbortSignal): Promise<string[]> {
        return this.http.request<string[]>("/permissions/mine/anywhere", "GET", { signal });
    }

    getPermissionTemplates(signal: AbortSignal): Promise<PermissionTemplate[]> {
        return this.http.request<PermissionTemplate[]>("/permission-templates", "GET", { signal });
    }

    createPermissionTemplate(input: PermissionTemplateInput, signal: AbortSignal): Promise<PermissionTemplate> {
        return this.http.request<PermissionTemplate>("/permission-templates", "POST", { signal, body: input });
    }

    updatePermissionTemplate(id: string, input: PermissionTemplateInput, signal: AbortSignal): Promise<PermissionTemplate> {
        // PUT rather than POST: the input is the whole template, so this
        // replaces it. Every update below reads the same way.
        return this.http.request<PermissionTemplate>(
            `/permission-templates/${encodeURIComponent(id)}`, "PUT", { signal, body: input });
    }

    async deletePermissionTemplate(id: string, signal: AbortSignal): Promise<void> {
        await this.http.request<void>(`/permission-templates/${encodeURIComponent(id)}`, "DELETE", { signal });
    }

    getGrants(filter: GrantFilter, signal: AbortSignal): Promise<Page<Grant>> {
        const query: Record<string, string | number> = {};
        if (filter.page !== undefined) query.page = filter.page;
        if (filter.pageSize !== undefined) query.pageSize = filter.pageSize;
        if (filter.userId) query.userId = filter.userId;
        if (filter.activityId) query.activityId = filter.activityId;
        if (filter.scope) query.scope = filter.scope;
        return this.http.request<Page<Grant>>("/grants", "GET", { signal, query });
    }

    // ── groups ──────────────────────────────────────────────────────────────
    //
    // Under the activity rather than under `/groups`, matching the Server: a
    // group has no meaning outside one.

    getGroups(activityId: string, signal: AbortSignal): Promise<ActivityGroup[]> {
        return this.http.request<ActivityGroup[]>(
            `/activities/${encodeURIComponent(activityId)}/groups`, "GET", { signal });
    }

    createGroup(activityId: string, input: ActivityGroupInput, signal: AbortSignal): Promise<ActivityGroup> {
        return this.http.request<ActivityGroup>(
            `/activities/${encodeURIComponent(activityId)}/groups`, "POST", { signal, body: input });
    }

    updateGroup(activityId: string, groupId: string, input: ActivityGroupInput, signal: AbortSignal): Promise<ActivityGroup> {
        return this.http.request<ActivityGroup>(
            `/activities/${encodeURIComponent(activityId)}/groups/${encodeURIComponent(groupId)}`,
            "PUT", { signal, body: input });
    }

    async deleteGroup(activityId: string, groupId: string, signal: AbortSignal): Promise<void> {
        await this.http.request<void>(
            `/activities/${encodeURIComponent(activityId)}/groups/${encodeURIComponent(groupId)}`,
            "DELETE", { signal });
    }

    setParticipantGroup(activityId: string, userId: string, groupId: string | undefined, signal: AbortSignal): Promise<Grant> {
        return this.http.request<Grant>(
            `/activities/${encodeURIComponent(activityId)}/participants/${encodeURIComponent(userId)}/group`,
            "PUT", { signal, body: { groupId: groupId ?? null } });
    }

    setGrant(input: GrantInput, signal: AbortSignal): Promise<Grant> {
        return this.http.request<Grant>("/grants", "POST", { signal, body: input });
    }

    async revokeGrant(id: string, signal: AbortSignal): Promise<void> {
        // Revoking removes the row — a grant has no revoked state, only
        // `invited` and `active` — so it is a delete rather than an action.
        await this.http.request<void>(`/grants/${encodeURIComponent(id)}`, "DELETE", { signal });
    }

    searchUsers(query: string, signal: AbortSignal): Promise<ManagedUserSummary[]> {
        return this.http.request<ManagedUserSummary[]>("/users", "GET", { signal, query: { q: query } });
    }

    getIdentityProviders(signal: AbortSignal): Promise<IdentityProvider[]> {
        return this.http.request<IdentityProvider[]>("/identity/providers", "GET", { signal });
    }

    createIdentityProvider(input: IdentityProviderInput, signal: AbortSignal): Promise<IdentityProvider> {
        return this.http.request<IdentityProvider>("/identity/providers", "POST", { signal, body: input });
    }

    updateIdentityProvider(
        id: string, input: IdentityProviderInput, signal: AbortSignal,
    ): Promise<IdentityProvider> {
        return this.http.request<IdentityProvider>(
            `/identity/providers/${encodeURIComponent(id)}`, "PUT", { signal, body: input });
    }

    async deleteIdentityProvider(id: string, signal: AbortSignal): Promise<void> {
        await this.http.request<void>(
            `/identity/providers/${encodeURIComponent(id)}`, "DELETE", { signal });
    }

    getDeletionRequests(
        filter: DeletionRequestFilter, signal: AbortSignal,
    ): Promise<Page<DeletionRequest>> {
        const query: Record<string, string | number> = {};
        if (filter.page !== undefined) query.page = filter.page;
        if (filter.pageSize !== undefined) query.pageSize = filter.pageSize;
        if (filter.state) query.state = filter.state;
        return this.http.request<Page<DeletionRequest>>(
            "/account-deletion-requests", "GET", { signal, query });
    }

    haltDeletionRequest(id: string, signal: AbortSignal): Promise<DeletionRequest> {
        return this.http.request<DeletionRequest>(
            `/account-deletion-requests/${encodeURIComponent(id)}/halt`, "POST", { signal, body: {} });
    }

    getRunners(filter: ManagedRunnerFilter, signal: AbortSignal): Promise<Page<ManagedRunner>> {
        const query: Record<string, string | number> = {};
        if (filter.page !== undefined) query.page = filter.page;
        if (filter.pageSize !== undefined) query.pageSize = filter.pageSize;
        if (filter.state) query.state = filter.state;
        if (filter.search) query.search = filter.search;
        return this.http.request<Page<ManagedRunner>>("/runners", "GET", { signal, query });
    }

    approveRunner(id: string, signal: AbortSignal): Promise<ManagedRunner> {
        return this.http.request<ManagedRunner>(`/runners/${encodeURIComponent(id)}/approve`, "POST", { signal });
    }

    revokeRunner(id: string, reason: string | undefined, signal: AbortSignal): Promise<ManagedRunner> {
        return this.http.request<ManagedRunner>(`/runners/${encodeURIComponent(id)}/revoke`, "POST", {
            signal, body: { reason },
        });
    }

    setRunnerTags(id: string, tags: string[], signal: AbortSignal): Promise<ManagedRunner> {
        return this.http.request<ManagedRunner>(`/runners/${encodeURIComponent(id)}/tags`, "POST", {
            signal, body: { tags },
        });
    }

    async forgetRunner(id: string, signal: AbortSignal): Promise<void> {
        await this.http.request<void>(`/runners/${encodeURIComponent(id)}`, "DELETE", { signal });
    }

    getUsers(filter: ManagedUserFilter, signal: AbortSignal): Promise<Page<ManagedUser>> {
        const query: Record<string, string | number | boolean> = {};
        if (filter.page !== undefined) query.page = filter.page;
        if (filter.pageSize !== undefined) query.pageSize = filter.pageSize;
        if (filter.search) query.search = filter.search;
        if (filter.includeBlocked) query.includeBlocked = true;
        if (filter.temporaryOnly) query.temporaryOnly = true;
        return this.http.request<Page<ManagedUser>>("/users/managed", "GET", { signal, query });
    }

    createUser(input: UserInput, signal: AbortSignal): Promise<CreatedCredential> {
        return this.http.request<CreatedCredential>("/users", "POST", { signal, body: input });
    }

    createTemporaryUsers(input: BulkUserInput, signal: AbortSignal): Promise<CreatedCredential[]> {
        return this.http.request<CreatedCredential[]>("/users/temporary", "POST", { signal, body: input });
    }

    setUserBlocked(id: string, blocked: boolean, reason: string | undefined, signal: AbortSignal): Promise<ManagedUser> {
        return this.http.request<ManagedUser>(`/users/${encodeURIComponent(id)}/blocked`, "POST", {
            signal, body: { blocked, reason },
        });
    }

    resetUserPassword(id: string, signal: AbortSignal): Promise<CreatedCredential> {
        return this.http.request<CreatedCredential>(`/users/${encodeURIComponent(id)}/password`, "POST", { signal });
    }

    updateUser(id: string, input: UserUpdateInput, signal: AbortSignal): Promise<ManagedUser> {
        return this.http.request<ManagedUser>(`/users/${encodeURIComponent(id)}`, "PUT", { signal, body: input });
    }

    approveUser(id: string, signal: AbortSignal): Promise<ManagedUser> {
        return this.http.request<ManagedUser>(`/users/${encodeURIComponent(id)}/approve`, "POST", { signal });
    }

    getUserSessions(userId: string, signal: AbortSignal): Promise<UserSession[]> {
        return this.http.request<UserSession[]>(`/users/${encodeURIComponent(userId)}/sessions`, "GET", { signal });
    }

    getManagedActivities(signal: AbortSignal): Promise<ManagedActivitySummary[]> {
        return this.http.request<ManagedActivitySummary[]>("/manager/activities/summary", "GET", { signal });
    }

    updateInstanceSettings(input: InstanceSettingsInput, signal: AbortSignal): Promise<InstanceInfo> {
        return this.http.request<InstanceInfo>("/instance", "PUT", { signal, body: input });
    }

    requestAccessKey(name: string, signal: AbortSignal): Promise<AccessKeyValue> {
        return this.http.request<AccessKeyValue>(
            `/instance/access-keys/${encodeURIComponent(name)}/value`, "GET", { signal });
    }

    fetchFile(url: string, signal: AbortSignal): Promise<UploadedFile> {
        return this.http.request<UploadedFile>("/files/fetch", "POST", { signal, body: { url } });
    }

    getAccessKeys(signal: AbortSignal): Promise<AccessKey[]> {
        return this.http.request<AccessKey[]>("/instance/access-keys", "GET", { signal });
    }

    setAccessKey(name: string, value: string, signal: AbortSignal): Promise<AccessKey[]> {
        return this.http.request<AccessKey[]>(
            `/instance/access-keys/${encodeURIComponent(name)}`, "PUT", { signal, body: { value } });
    }

    getExternalContent(signal: AbortSignal): Promise<ExternalContent> {
        return this.http.request<ExternalContent>("/instance/external-content", "GET", { signal });
    }

    setExternalContentHosts(hosts: string[], signal: AbortSignal): Promise<ExternalContent> {
        return this.http.request<ExternalContent>(
            "/instance/external-content", "PUT", { signal, body: { hosts } });
    }

    setInstanceLogo(input: InstanceLogoInput, signal: AbortSignal): Promise<InstanceInfo> {
        return this.http.request<InstanceInfo>("/instance/logo", "PUT", { signal, body: input });
    }

    publishInstanceDocument(kind: InstanceDocumentKind, statements: NewStatement[], signal: AbortSignal): Promise<InstanceInfo> {
        return this.http.request<InstanceInfo>(
            `/instance/documents/${encodeURIComponent(kind)}`, "POST", { signal, body: { statements } });
    }

    unpublishInstanceDocument(kind: InstanceDocumentKind, signal: AbortSignal): Promise<InstanceInfo> {
        return this.http.request<InstanceInfo>(
            `/instance/documents/${encodeURIComponent(kind)}`, "DELETE", { signal });
    }

    getInstanceDocumentHistory(kind: InstanceDocumentKind, signal: AbortSignal): Promise<InstanceDocumentRef[]> {
        return this.http.request<InstanceDocumentRef[]>(
            `/instance/documents/${encodeURIComponent(kind)}`, "GET", { signal });
    }

    getActivities(filter: ManagedActivityFilter, signal: AbortSignal): Promise<Page<ManagedActivity>> {
        const query: Record<string, string | number | boolean> = {};
        if (filter.page !== undefined) query.page = filter.page;
        if (filter.pageSize !== undefined) query.pageSize = filter.pageSize;
        if (filter.search) query.search = filter.search;
        if (filter.includeArchived) query.includeArchived = true;
        return this.http.request<Page<ManagedActivity>>("/manager/activities", "GET", { signal, query });
    }

    getActivity(idOrSlug: string, signal: AbortSignal): Promise<ManagedActivity> {
        return this.http.request<ManagedActivity>(
            `/manager/activities/${encodeURIComponent(idOrSlug)}`, "GET", { signal });
    }

    createActivity(input: ActivityInput, signal: AbortSignal): Promise<ManagedActivity> {
        return this.http.request<ManagedActivity>("/activities", "POST", { signal, body: input });
    }

    updateActivity(id: string, input: ActivityInput, signal: AbortSignal): Promise<ManagedActivity> {
        return this.http.request<ManagedActivity>(`/activities/${encodeURIComponent(id)}`, "PUT", { signal, body: input });
    }

    setActivityArchived(id: string, archived: boolean, signal: AbortSignal): Promise<ManagedActivity> {
        return this.http.request<ManagedActivity>(`/activities/${encodeURIComponent(id)}/archived`, "POST", {
            signal, body: { archived },
        });
    }

    setActivityPublished(
        id: string, published: boolean, signal: AbortSignal): Promise<ManagedActivity> {
        return this.http.request<ManagedActivity>(
            `/activities/${encodeURIComponent(id)}/published`, "POST", {
                signal,
                body: { published },
            });
    }

    duplicateActivity(
        id: string, slug: string, startsAt: string,
        signal: AbortSignal): Promise<ManagedActivity> {
        return this.http.request<ManagedActivity>(
            `/activities/${encodeURIComponent(id)}/duplicate`, "POST", {
                signal,
                body: { slug, startsAt },
            });
    }

    async deleteActivity(id: string, signal: AbortSignal): Promise<void> {
        await this.http.request<void>(`/activities/${encodeURIComponent(id)}`, "DELETE", { signal });
    }

    publishActivityDocument(activityId: string, kind: ActivityDocumentKind, statements: NewStatement[], signal: AbortSignal): Promise<ManagedActivity> {
        return this.http.request<ManagedActivity>(
            `/activities/${encodeURIComponent(activityId)}/documents/${encodeURIComponent(kind)}`,
            "POST", { signal, body: { statements } });
    }

    unpublishActivityDocument(activityId: string, kind: ActivityDocumentKind, signal: AbortSignal): Promise<ManagedActivity> {
        return this.http.request<ManagedActivity>(
            `/activities/${encodeURIComponent(activityId)}/documents/${encodeURIComponent(kind)}`,
            "DELETE", { signal });
    }

    getActivityDocumentHistory(activityId: string, kind: ActivityDocumentKind, signal: AbortSignal): Promise<ActivityDocumentRef[]> {
        return this.http.request<ActivityDocumentRef[]>(
            `/activities/${encodeURIComponent(activityId)}/documents/${encodeURIComponent(kind)}`,
            "GET", { signal });
    }

    getSeries(activityId: string, signal: AbortSignal): Promise<ManagedSeries[]> {
        return this.http.request<ManagedSeries[]>(
            `/manager/activities/${encodeURIComponent(activityId)}/series`, "GET", { signal });
    }

    createSeries(activityId: string, input: SeriesInput, signal: AbortSignal): Promise<ManagedSeries> {
        return this.http.request<ManagedSeries>(
            `/activities/${encodeURIComponent(activityId)}/series`, "POST", { signal, body: input });
    }

    updateSeries(seriesId: string, input: SeriesInput, signal: AbortSignal): Promise<ManagedSeries> {
        return this.http.request<ManagedSeries>(`/series/${encodeURIComponent(seriesId)}`, "PUT", { signal, body: input });
    }

    shiftSeries(seriesId: string, minutes: number, signal: AbortSignal): Promise<ManagedSeries> {
        // A delta, not two dates: two managers moving the same delayed round by
        // ten minutes would otherwise both compute +10 from what they read.
        return this.http.request<ManagedSeries>(
            `/series/${encodeURIComponent(seriesId)}/shift`, "POST", { signal, body: { minutes } });
    }

    pauseSeries(seriesId: string, input: PauseInput, signal: AbortSignal): Promise<ManagedSeries> {
        return this.http.request<ManagedSeries>(
            `/series/${encodeURIComponent(seriesId)}/pause`, "POST", { signal, body: input });
    }

    resumeSeries(seriesId: string, input: ResumeInput, signal: AbortSignal): Promise<ManagedSeries> {
        return this.http.request<ManagedSeries>(
            `/series/${encodeURIComponent(seriesId)}/resume`, "POST", { signal, body: input });
    }

    async deleteSeries(seriesId: string, signal: AbortSignal): Promise<void> {
        await this.http.request<void>(`/series/${encodeURIComponent(seriesId)}`, "DELETE", { signal });
    }

    reorderSeries(activityId: string, orderedIds: string[], signal: AbortSignal): Promise<ManagedSeries[]> {
        return this.http.request<ManagedSeries[]>(
            `/activities/${encodeURIComponent(activityId)}/series/order`, "POST", { signal, body: { orderedIds } });
    }

    attachProblem(seriesId: string, input: SeriesProblemInput, signal: AbortSignal): Promise<ManagedSeries> {
        return this.http.request<ManagedSeries>(
            `/series/${encodeURIComponent(seriesId)}/problems`, "POST", { signal, body: input });
    }

    updateSeriesProblem(seriesProblemId: string, input: SeriesProblemInput, signal: AbortSignal): Promise<ManagedSeries> {
        return this.http.request<ManagedSeries>(
            `/series-problems/${encodeURIComponent(seriesProblemId)}`, "PUT", { signal, body: input });
    }

    detachProblem(seriesProblemId: string, signal: AbortSignal): Promise<ManagedSeries> {
        // Detaching removes the assignment, so it is a delete. The series comes
        // back in the response because that is what the screen redraws.
        return this.http.request<ManagedSeries>(
            `/series-problems/${encodeURIComponent(seriesProblemId)}`, "DELETE", { signal });
    }

    reorderSeriesProblems(seriesId: string, orderedIds: string[], signal: AbortSignal): Promise<ManagedSeries> {
        return this.http.request<ManagedSeries>(
            `/series/${encodeURIComponent(seriesId)}/problems/order`, "POST", { signal, body: { orderedIds } });
    }

    getQuestions(filter: ManagedQuestionFilter, signal: AbortSignal): Promise<Page<ManagedQuestion>> {
        const query: Record<string, string | number | boolean> = {};
        if (filter.page !== undefined) query.page = filter.page;
        if (filter.pageSize !== undefined) query.pageSize = filter.pageSize;
        if (filter.activityId) query.activityId = filter.activityId;
        if (filter.seriesId) query.seriesId = filter.seriesId;
        if (filter.kind) query.kind = filter.kind;
        if (filter.unansweredOnly) query.unansweredOnly = true;
        if (filter.search) query.search = filter.search;
        return this.http.request<Page<ManagedQuestion>>("/questions", "GET", { signal, query });
    }

    answerQuestion(id: string, input: AnswerInput, signal: AbortSignal): Promise<ManagedQuestion> {
        return this.http.request<ManagedQuestion>(
            `/questions/${encodeURIComponent(id)}/answer`, "POST", { signal, body: input });
    }

    setQuestionPublished(id: string, published: boolean, signal: AbortSignal): Promise<ManagedQuestion> {
        return this.http.request<ManagedQuestion>(
            `/questions/${encodeURIComponent(id)}/published`, "POST", { signal, body: { published } });
    }

    createAnnouncement(activityId: string, input: AnnouncementInput, signal: AbortSignal): Promise<ManagedQuestion> {
        return this.http.request<ManagedQuestion>(
            `/activities/${encodeURIComponent(activityId)}/announcements`, "POST", { signal, body: input });
    }

    async deleteAnnouncement(id: string, signal: AbortSignal): Promise<void> {
        await this.http.request<void>(`/questions/${encodeURIComponent(id)}`, "DELETE", { signal });
    }

    getSubmissions(filter: ManagedSubmissionFilter, signal: AbortSignal): Promise<Page<ManagedSubmission>> {
        const query: Record<string, string | number> = {};
        if (filter.page !== undefined) query.page = filter.page;
        if (filter.pageSize !== undefined) query.pageSize = filter.pageSize;
        if (filter.activityId) query.activityId = filter.activityId;
        if (filter.seriesId) query.seriesId = filter.seriesId;
        if (filter.seriesProblemId) query.seriesProblemId = filter.seriesProblemId;
        if (filter.userId) query.userId = filter.userId;
        if (filter.state) query.state = filter.state;
        if (filter.verdict) query.verdict = filter.verdict;
        if (filter.search) query.search = filter.search;
        return this.http.request<Page<ManagedSubmission>>("/submissions", "GET", { signal, query });
    }

    getSubmission(id: string, signal: AbortSignal): Promise<ManagedSubmissionDetail> {
        return this.http.request<ManagedSubmissionDetail>(`/submissions/${encodeURIComponent(id)}`, "GET", { signal });
    }


    rejudgeSubmission(id: string, signal: AbortSignal): Promise<ManagedSubmission> {
        return this.http.request<ManagedSubmission>(`/submissions/${encodeURIComponent(id)}/rejudge`, "POST", { signal });
    }

    rejudgeSeriesProblem(seriesProblemId: string, signal: AbortSignal): Promise<number> {
        return this.http.request<number>(
            `/series-problems/${encodeURIComponent(seriesProblemId)}/rejudge`, "POST", { signal });
    }

    rejudgeSeries(seriesId: string, signal: AbortSignal): Promise<number> {
        return this.http.request<number>(`/series/${encodeURIComponent(seriesId)}/rejudge`, "POST", { signal });
    }

    cancelAttempt(submissionId: string, attemptId: string, signal: AbortSignal): Promise<ManagedSubmissionDetail> {
        return this.http.request<ManagedSubmissionDetail>(
            `/submissions/${encodeURIComponent(submissionId)}/attempts/${encodeURIComponent(attemptId)}/cancel`,
            "POST", { signal });
    }

    setSubmissionExcluded(
        id: string, excluded: boolean, reason: string | undefined, signal: AbortSignal,
    ): Promise<ManagedSubmissionDetail> {
        return this.http.request<ManagedSubmissionDetail>(
            `/submissions/${encodeURIComponent(id)}/excluded`,
            "POST", { signal, body: { excluded, reason } });
    }

    getProblems(filter: ProblemFilter, signal: AbortSignal): Promise<Page<ManagedProblem>> {
        const query: Record<string, string | number | boolean> = {};
        if (filter.page !== undefined) query.page = filter.page;
        if (filter.pageSize !== undefined) query.pageSize = filter.pageSize;
        if (filter.search) query.search = filter.search;
        if (filter.mineOnly) query.mineOnly = true;
        if (filter.includeArchived) query.includeArchived = true;
        return this.http.request<Page<ManagedProblem>>("/problems", "GET", { signal, query });
    }

    getProblem(id: string, signal: AbortSignal): Promise<ManagedProblem> {
        return this.http.request<ManagedProblem>(`/problems/${encodeURIComponent(id)}`, "GET", { signal });
    }

    createProblem(input: ProblemInput, signal: AbortSignal): Promise<ManagedProblem> {
        return this.http.request<ManagedProblem>("/problems", "POST", { signal, body: input });
    }

    updateProblem(id: string, input: ProblemInput, signal: AbortSignal): Promise<ManagedProblem> {
        return this.http.request<ManagedProblem>(`/problems/${encodeURIComponent(id)}`, "PUT", { signal, body: input });
    }

    duplicateProblem(id: string, signal: AbortSignal): Promise<ManagedProblem> {
        return this.http.request<ManagedProblem>(`/problems/${encodeURIComponent(id)}/duplicate`, "POST", { signal });
    }

    setProblemVisibility(id: string, visibility: ProblemVisibility, sharedWith: string[], signal: AbortSignal): Promise<ManagedProblem> {
        return this.http.request<ManagedProblem>(`/problems/${encodeURIComponent(id)}/visibility`, "POST", {
            signal, body: { visibility, sharedWith },
        });
    }

    setProblemArchived(id: string, archived: boolean, signal: AbortSignal): Promise<ManagedProblem> {
        return this.http.request<ManagedProblem>(`/problems/${encodeURIComponent(id)}/archived`, "POST", {
            signal, body: { archived },
        });
    }

    async deleteProblem(id: string, signal: AbortSignal): Promise<void> {
        await this.http.request<void>(`/problems/${encodeURIComponent(id)}`, "DELETE", { signal });
    }

    getProblemVersions(problemId: string, signal: AbortSignal): Promise<ManagedProblemVersion[]> {
        return this.http.request<ManagedProblemVersion[]>(
            `/problems/${encodeURIComponent(problemId)}/versions`, "GET", { signal });
    }

    getProblemContent(problemId: string, versionId: string, signal: AbortSignal): Promise<StatementRef[]> {
        return this.http.request<StatementRef[]>(
            `/problems/${encodeURIComponent(problemId)}/versions/${encodeURIComponent(versionId)}/content`,
            "GET", { signal });
    }

    createProblemVersion(problemId: string, input: ProblemVersionInput, signal: AbortSignal): Promise<ManagedProblemVersion> {
        // Plain JSON. It was multipart until the files became references: the
        // bytes are uploaded first, so what is published is a statement and a
        // list of ids — and a version is still published whole, in one request.
        return this.http.request<ManagedProblemVersion>(
            `/problems/${encodeURIComponent(problemId)}/versions`, "POST", { signal, body: input });
    }

    async getProblemPackage(problemId: string, versionId: string, signal: AbortSignal): Promise<Blob | undefined> {
        try {
            return await this.http.download(
                `/problems/${encodeURIComponent(problemId)}/versions/${encodeURIComponent(versionId)}/package`,
                signal);
        } catch {
            // A version without a package is not a failure; it is a version
            // nobody has finished preparing.
            return undefined;
        }
    }

    requestTrial(input: NewTrial, signal: AbortSignal): Promise<Trial> {
        return this.http.request<Trial>("/trials", "POST", { body: input, signal });
    }

    getTrial(trialId: string, signal: AbortSignal): Promise<Trial> {
        return this.http.request<Trial>(`/trials/${encodeURIComponent(trialId)}`, "GET", { signal });
    }
}
