import {
    Grant,
    GrantFilter,
    GrantInput,
    ManagedActivitySummary,
    ManagedUserSummary,
    ManagerApi,
    PermissionDefinition,
    PermissionTemplate,
    PermissionTemplateInput,
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
}
