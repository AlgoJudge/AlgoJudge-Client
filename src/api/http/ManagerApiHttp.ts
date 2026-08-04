import {
    ActivityInput,
    Grant,
    GrantFilter,
    GrantInput,
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
    PermissionDefinition,
    PermissionTemplate,
    PermissionTemplateInput,
    SeriesInput,
    SeriesProblemInput,
} from "../ManagerApi";
import { Page } from "../ParticipantApi";
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

    getPermissionTemplates(signal: AbortSignal): Promise<PermissionTemplate[]> {
        return this.http.request<PermissionTemplate[]>("/permission-templates", "GET", { signal });
    }

    createPermissionTemplate(input: PermissionTemplateInput, signal: AbortSignal): Promise<PermissionTemplate> {
        return this.http.request<PermissionTemplate>("/permission-templates", "POST", { signal, body: input });
    }

    updatePermissionTemplate(id: string, input: PermissionTemplateInput, signal: AbortSignal): Promise<PermissionTemplate> {
        // The transport speaks GET and POST only; a PUT verb would be the more
        // usual shape and can replace this once it does.
        return this.http.request<PermissionTemplate>(
            `/permission-templates/${encodeURIComponent(id)}`, "POST", { signal, body: input });
    }

    async deletePermissionTemplate(id: string, signal: AbortSignal): Promise<void> {
        await this.http.request<void>(
            `/permission-templates/${encodeURIComponent(id)}/delete`, "POST", { signal });
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

    setGrant(input: GrantInput, signal: AbortSignal): Promise<Grant> {
        return this.http.request<Grant>("/grants", "POST", { signal, body: input });
    }

    async revokeGrant(id: string, signal: AbortSignal): Promise<void> {
        await this.http.request<void>(`/grants/${encodeURIComponent(id)}/revoke`, "POST", { signal });
    }

    searchUsers(query: string, signal: AbortSignal): Promise<ManagedUserSummary[]> {
        return this.http.request<ManagedUserSummary[]>("/users", "GET", { signal, query: { q: query } });
    }

    getManagedActivities(signal: AbortSignal): Promise<ManagedActivitySummary[]> {
        return this.http.request<ManagedActivitySummary[]>("/manager/activities", "GET", { signal });
    }

    getActivities(filter: ManagedActivityFilter, signal: AbortSignal): Promise<Page<ManagedActivity>> {
        const query: Record<string, string | number | boolean> = {};
        if (filter.page !== undefined) query.page = filter.page;
        if (filter.pageSize !== undefined) query.pageSize = filter.pageSize;
        if (filter.search) query.search = filter.search;
        if (filter.includeArchived) query.includeArchived = true;
        return this.http.request<Page<ManagedActivity>>("/activities", "GET", { signal, query });
    }

    getActivity(idOrSlug: string, signal: AbortSignal): Promise<ManagedActivity> {
        return this.http.request<ManagedActivity>(`/activities/${encodeURIComponent(idOrSlug)}`, "GET", { signal });
    }

    createActivity(input: ActivityInput, signal: AbortSignal): Promise<ManagedActivity> {
        return this.http.request<ManagedActivity>("/activities", "POST", { signal, body: input });
    }

    updateActivity(id: string, input: ActivityInput, signal: AbortSignal): Promise<ManagedActivity> {
        return this.http.request<ManagedActivity>(`/activities/${encodeURIComponent(id)}`, "POST", { signal, body: input });
    }

    setActivityArchived(id: string, archived: boolean, signal: AbortSignal): Promise<ManagedActivity> {
        return this.http.request<ManagedActivity>(`/activities/${encodeURIComponent(id)}/archived`, "POST", {
            signal, body: { archived },
        });
    }

    async deleteActivity(id: string, signal: AbortSignal): Promise<void> {
        await this.http.request<void>(`/activities/${encodeURIComponent(id)}/delete`, "POST", { signal });
    }

    getSeries(activityId: string, signal: AbortSignal): Promise<ManagedSeries[]> {
        return this.http.request<ManagedSeries[]>(
            `/activities/${encodeURIComponent(activityId)}/series`, "GET", { signal });
    }

    createSeries(activityId: string, input: SeriesInput, signal: AbortSignal): Promise<ManagedSeries> {
        return this.http.request<ManagedSeries>(
            `/activities/${encodeURIComponent(activityId)}/series`, "POST", { signal, body: input });
    }

    updateSeries(seriesId: string, input: SeriesInput, signal: AbortSignal): Promise<ManagedSeries> {
        return this.http.request<ManagedSeries>(`/series/${encodeURIComponent(seriesId)}`, "POST", { signal, body: input });
    }

    async deleteSeries(seriesId: string, signal: AbortSignal): Promise<void> {
        await this.http.request<void>(`/series/${encodeURIComponent(seriesId)}/delete`, "POST", { signal });
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
            `/series-problems/${encodeURIComponent(seriesProblemId)}`, "POST", { signal, body: input });
    }

    detachProblem(seriesProblemId: string, signal: AbortSignal): Promise<ManagedSeries> {
        return this.http.request<ManagedSeries>(
            `/series-problems/${encodeURIComponent(seriesProblemId)}/detach`, "POST", { signal });
    }

    reorderSeriesProblems(seriesId: string, orderedIds: string[], signal: AbortSignal): Promise<ManagedSeries> {
        return this.http.request<ManagedSeries>(
            `/series/${encodeURIComponent(seriesId)}/problems/order`, "POST", { signal, body: { orderedIds } });
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
        return this.http.request<ManagedProblem>(`/problems/${encodeURIComponent(id)}`, "POST", { signal, body: input });
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
        await this.http.request<void>(`/problems/${encodeURIComponent(id)}/delete`, "POST", { signal });
    }

    getProblemVersions(problemId: string, signal: AbortSignal): Promise<ManagedProblemVersion[]> {
        return this.http.request<ManagedProblemVersion[]>(
            `/problems/${encodeURIComponent(problemId)}/versions`, "GET", { signal });
    }

    getProblemContent(problemId: string, versionId: string, signal: AbortSignal): Promise<unknown> {
        return this.http.request<unknown>(
            `/problems/${encodeURIComponent(problemId)}/versions/${encodeURIComponent(versionId)}/content`,
            "GET", { signal });
    }

    createProblemVersion(problemId: string, input: ProblemVersionInput, signal: AbortSignal): Promise<ManagedProblemVersion> {
        return this.http.request<ManagedProblemVersion>(
            `/problems/${encodeURIComponent(problemId)}/versions`, "POST", { signal, body: input });
    }

    async uploadProblemPackage(problemId: string, versionId: string, archive: Blob, signal: AbortSignal): Promise<ManagedProblemVersion> {
        // Multipart: the transport leaves FormData alone and lets the browser
        // set the boundary, which a serialised body would destroy.
        const form = new FormData();
        form.append("package", archive, "package.zip");
        return this.http.request<ManagedProblemVersion>(
            `/problems/${encodeURIComponent(problemId)}/versions/${encodeURIComponent(versionId)}/package`,
            "POST", { signal, body: form });
    }
}
