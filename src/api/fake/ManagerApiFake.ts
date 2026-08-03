import { ManagerEventDispatcherImpl } from "../impl/ManagerEventDispatcher";
import {
    Grant,
    GrantFilter,
    GrantInput,
    ManagerApi,
    PermissionDefinition,
    PermissionTemplate,
    PermissionTemplateInput,
} from "../ManagerApi";
import { Page } from "../ParticipantApi";
import {
    createGrants,
    createTemplates,
    MY_SYSTEM_PERMISSIONS,
    PERMISSION_CATALOGUE,
} from "./fixtures/permissions";
import { Utils } from "./Utils";

const copy = <T>(value: T): T => structuredClone(value);

const paginate = <T>(items: T[], page = 1, pageSize = 20): Page<T> => {
    const first = pageSize * (page - 1);
    return { items: items.slice(first, first + pageSize), total: items.length, page, pageSize };
};

const notFound = (what: string): never => Utils.throwError(`${what} does not exist`);

const newId = () => `018f2c00-0000-7000-8000-${Math.random().toString(16).slice(2, 14).padEnd(12, "0")}`;

export class ManagerApiFake implements ManagerApi {
    readonly eventDispatcher = new ManagerEventDispatcherImpl();

    private templates = createTemplates();
    private grants = createGrants();

    constructor(private sleepMs: number = 300) {}

    async getPermissionCatalogue(signal: AbortSignal): Promise<PermissionDefinition[]> {
        await this.settle(signal);
        return copy(PERMISSION_CATALOGUE);
    }

    async getMyPermissions(activityId: string | undefined, signal: AbortSignal): Promise<string[]> {
        await this.settle(signal);
        // The fake signs in as a manager with wide but not unlimited rights, so
        // the editor's "you cannot grant what you do not hold" rule is visible
        // rather than theoretical.
        const own = this.grants.find(g => g.userId === "user-me" && g.activityId === activityId);
        return copy([...MY_SYSTEM_PERMISSIONS, ...(own?.permissions ?? [])]);
    }

    async getPermissionTemplates(signal: AbortSignal): Promise<PermissionTemplate[]> {
        await this.settle(signal);
        return copy(this.templates);
    }

    async createPermissionTemplate(input: PermissionTemplateInput, signal: AbortSignal): Promise<PermissionTemplate> {
        await this.settle(signal);
        this.assertNameFree(input.name);
        const template: PermissionTemplate = { id: newId(), isBuiltIn: false, ...input };
        this.templates = [...this.templates, template];
        this.eventDispatcher.dispatchEvent({ type: "permissionTemplateChanged", data: { template: copy(template) } });
        return copy(template);
    }

    async updatePermissionTemplate(id: string, input: PermissionTemplateInput, signal: AbortSignal): Promise<PermissionTemplate> {
        await this.settle(signal);
        const existing = this.templates.find(t => t.id === id) ?? notFound("Template");
        this.assertNameFree(input.name, id);
        const updated: PermissionTemplate = { ...existing, ...input };
        this.templates = this.templates.map(t => t.id === id ? updated : t);
        this.eventDispatcher.dispatchEvent({ type: "permissionTemplateChanged", data: { template: copy(updated) } });
        return copy(updated);
    }

    async deletePermissionTemplate(id: string, signal: AbortSignal): Promise<void> {
        await this.settle(signal);
        const existing = this.templates.find(t => t.id === id) ?? notFound("Template");
        if (existing.isBuiltIn) {
            // The three shipped templates are what a fresh installation grants
            // from. Deleting one leaves nothing to start from.
            Utils.throwError("A built-in template cannot be deleted");
        }
        this.templates = this.templates.filter(t => t.id !== id);
        this.eventDispatcher.dispatchEvent({ type: "permissionTemplateChanged", data: { deletedId: id } });
    }

    async getGrants(filter: GrantFilter, signal: AbortSignal): Promise<Page<Grant>> {
        await this.settle(signal);
        const matched = this.grants.filter(g =>
            (!filter.userId || g.userId === filter.userId) &&
            (!filter.activityId || g.activityId === filter.activityId) &&
            (!filter.scope
                || (filter.scope === "global" && g.activityId === undefined)
                || (filter.scope === "activity" && g.activityId !== undefined)));
        return copy(paginate(matched, filter.page, filter.pageSize));
    }

    async setGrant(input: GrantInput, signal: AbortSignal): Promise<Grant> {
        await this.settle(signal);

        // Nobody may grant a permission they do not themselves hold. Without
        // this, anyone allowed to edit permissions — which an activity manager
        // must be — can make themselves an administrator in two steps.
        const mine = await this.getMyPermissions(input.activityId, signal);
        if (!mine.includes("system:administrator")) {
            const excess = input.permissions.filter(p => !mine.includes(p));
            if (excess.length > 0) {
                Utils.throwError(`Cannot grant permissions you do not hold: ${excess.join(", ")}`);
            }
        }

        const existing = this.grants.find(g => g.userId === input.userId && g.activityId === input.activityId);
        const grant: Grant = existing
            ? { ...existing, ...input, permissions: [...input.permissions] }
            : {
                id: newId(),
                userName: input.userId,
                activityName: input.activityId,
                state: "active",
                createdAt: new Date().toISOString(),
                ...input,
                permissions: [...input.permissions],
            };
        this.grants = existing
            ? this.grants.map(g => g.id === grant.id ? grant : g)
            : [...this.grants, grant];
        this.eventDispatcher.dispatchEvent({ type: "grantChanged", data: { grant: copy(grant) } });
        return copy(grant);
    }

    async revokeGrant(id: string, signal: AbortSignal): Promise<void> {
        await this.settle(signal);
        this.grants = this.grants.filter(g => g.id !== id);
        this.eventDispatcher.dispatchEvent({ type: "grantChanged", data: { deletedId: id } });
    }

    private assertNameFree(name: string, exceptId?: string): void {
        if (this.templates.some(t => t.name.toLowerCase() === name.trim().toLowerCase() && t.id !== exceptId)) {
            Utils.throwError(`A template named "${name}" already exists`);
        }
    }

    private async settle(signal: AbortSignal): Promise<void> {
        await Utils.sleep(this.sleepMs);
        signal.throwIfAborted();
    }
}
