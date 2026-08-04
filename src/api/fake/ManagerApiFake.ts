import { ManagerEventDispatcherImpl } from "../impl/ManagerEventDispatcher";
import {
    ActivityInput,
    AnnouncementInput,
    AnswerInput,
    BulkUserInput,
    CreatedCredential,
    Grant,
    GrantFilter,
    GrantInput,
    ManagedActivity,
    ManagedActivityFilter,
    ManagedActivitySummary,
    ManagedProblem,
    ManagedProblemVersion,
    ManagedAttempt,
    ManagedQuestion,
    ManagedQuestionFilter,
    ManagedRunner,
    ManagedRunnerFilter,
    ManagedSeries,
    ManagedSeriesProblem,
    ManagedSubmission,
    ManagedSubmissionDetail,
    ManagedSubmissionFilter,
    ManagedUser,
    ManagedUserFilter,
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
    StatementVariant,
    SeriesProblemInput,
    UserInput,
    UserUpdateInput,
} from "../ManagerApi";
import { Page } from "../ParticipantApi";
import { displayName } from "../displayName";
import {
    createGrants,
    createTemplates,
    MANAGED_ACTIVITIES,
    MANAGED_USERS,
    MY_SYSTEM_PERMISSIONS,
    PERMISSION_CATALOGUE,
} from "./fixtures/permissions";
import { ActivityRecord, createActivityLibrary } from "./fixtures/activities";
import { buildPackage } from "../../package/build";
import { emptyConfig } from "../../package/types";
import { isStatementName } from "../../content/types";
import { createProblemLibrary, fakeSha, ME, ProblemRecord } from "./fixtures/problems";
import { createQuestions } from "./fixtures/questions";
import { createRunners, runnerFile } from "./fixtures/runners";
import { createUsers } from "./fixtures/users";
import { createSubmissions, submissionSource } from "./fixtures/submissions";
import { sha256 } from "../../utils/sha256";
import { Utils } from "./Utils";

const copy = <T>(value: T): T => structuredClone(value);

const paginate = <T>(items: T[], page = 1, pageSize = 20): Page<T> => {
    const first = pageSize * (page - 1);
    return { items: items.slice(first, first + pageSize), total: items.length, page, pageSize };
};

const notFound = (what: string): never => Utils.throwError(`${what} does not exist`);

/** Given order first, anything the caller forgot after it, in its old order. */
const sortByGiven = <T extends { id: string }>(items: T[], orderedIds: string[]): T[] => [
    ...orderedIds.map(id => items.find(i => i.id === id)).filter((i): i is T => i !== undefined),
    ...items.filter(i => !orderedIds.includes(i.id)),
];

/** The list carries no attempts and no files: a page of them is a page of rows. */
const summary = (detail: ManagedSubmissionDetail): ManagedSubmission => {
    const { attemptList, files, problemType, ...rest } = detail;
    void attemptList; void files; void problemType;
    return rest;
};

/**
 * A password a person has to read off paper and type at a workstation: no
 * lookalike characters, four groups of four.
 */
const password = (): string => {
    const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
    let out = "";
    for (let i = 0; i < 16; i++) {
        if (i > 0 && i % 4 === 0) out += "-";
        out += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return out;
};

const newId = () => `018f2c00-0000-7000-8000-${Math.random().toString(16).slice(2, 14).padEnd(12, "0")}`;

export class ManagerApiFake implements ManagerApi {
    readonly eventDispatcher = new ManagerEventDispatcherImpl();

    private templates = createTemplates();
    private grants = createGrants();
    private library: ProblemRecord[] = createProblemLibrary();
    private activities: ActivityRecord[] = createActivityLibrary();
    private submissions: ManagedSubmissionDetail[] = createSubmissions();
    private questions: ManagedQuestion[] = createQuestions();
    /** Package bytes, by version id. Uploaded ones are kept; seeded ones are built. */
    private packages = new Map<string, Blob>();
    private users: ManagedUser[] = createUsers();
    private runners: ManagedRunner[] = createRunners();

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
                userName: MANAGED_USERS.find(u => u.id === input.userId)?.name ?? input.userId,
                activityName: MANAGED_ACTIVITIES.find(a => a.id === input.activityId)?.name,
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

    async searchUsers(query: string, signal: AbortSignal): Promise<ManagedUserSummary[]> {
        await this.settle(signal);
        const needle = query.trim().toLowerCase();
        const matched = needle.length === 0
            ? MANAGED_USERS
            : MANAGED_USERS.filter(u =>
                u.name.toLowerCase().includes(needle) ||
                u.username.toLowerCase().includes(needle) ||
                (u.email ?? "").toLowerCase().includes(needle));
        return copy(matched);
    }

    async getManagedActivities(signal: AbortSignal): Promise<ManagedActivitySummary[]> {
        await this.settle(signal);
        return copy(MANAGED_ACTIVITIES);
    }

    async getActivities(filter: ManagedActivityFilter, signal: AbortSignal): Promise<Page<ManagedActivity>> {
        await this.settle(signal);
        const needle = filter.search?.trim().toLowerCase();
        const matched = this.activities
            .map(r => this.withCounts(r.activity))
            .filter(a => filter.includeArchived || a.archivedAt === undefined)
            .filter(a => !needle
                || a.name.toLowerCase().includes(needle)
                || a.slug.toLowerCase().includes(needle));
        return copy(paginate(matched, filter.page, filter.pageSize));
    }

    async getActivity(idOrSlug: string, signal: AbortSignal): Promise<ManagedActivity> {
        await this.settle(signal);
        return copy(this.withCounts(this.findActivity(idOrSlug).activity));
    }

    async createActivity(input: ActivityInput, signal: AbortSignal): Promise<ManagedActivity> {
        await this.settle(signal);
        this.assertActivitySlugFree(input.slug);
        const activity: ManagedActivity = {
            id: newId(),
            ...input,
            seriesCount: 0,
            problemCount: 0,
            participantCount: 0,
        };
        this.activities = [{ activity, series: [] }, ...this.activities];
        this.announceActivity(activity);
        return copy(activity);
    }

    async updateActivity(id: string, input: ActivityInput, signal: AbortSignal): Promise<ManagedActivity> {
        await this.settle(signal);
        const record = this.findActivity(id);
        this.assertActivitySlugFree(input.slug, record.activity.id);
        Object.assign(record.activity, input);
        this.announceActivity(record.activity);
        return copy(record.activity);
    }

    async setActivityArchived(id: string, archived: boolean, signal: AbortSignal): Promise<ManagedActivity> {
        await this.settle(signal);
        const record = this.findActivity(id);
        record.activity.archivedAt = archived ? new Date().toISOString() : undefined;
        this.announceActivity(record.activity);
        return copy(record.activity);
    }

    async deleteActivity(id: string, signal: AbortSignal): Promise<void> {
        await this.settle(signal);
        const record = this.findActivity(id);
        // Deleting destroys submissions people may still want to look back at,
        // so it is refused for anything that ran. Archiving is the ordinary act.
        if (record.series.some(s => s.problems.some(p => p.submissionCount > 0))) {
            Utils.throwError("This activity holds submissions. Archive it instead of deleting it.");
        }
        for (const series of record.series) {
            for (const assignment of series.problems) this.countAttachment(assignment.problemId, -1);
        }
        this.activities = this.activities.filter(r => r.activity.id !== id);
        this.eventDispatcher.dispatchEvent({ type: "activityChanged", data: { deletedId: id } });
    }

    async getSeries(activityId: string, signal: AbortSignal): Promise<ManagedSeries[]> {
        await this.settle(signal);
        return copy(this.findActivity(activityId).series);
    }

    async createSeries(activityId: string, input: SeriesInput, signal: AbortSignal): Promise<ManagedSeries> {
        await this.settle(signal);
        const record = this.findActivity(activityId);
        this.assertNotArchived(record);
        this.assertSeriesSlugFree(record, input.slug);
        const series: ManagedSeries = {
            id: newId(),
            activityId: record.activity.id,
            order: record.series.length + 1,
            problems: [],
            ...input,
        };
        record.series = [...record.series, series];
        this.recount(record);
        this.announceSeries(record, series);
        return copy(series);
    }

    async updateSeries(seriesId: string, input: SeriesInput, signal: AbortSignal): Promise<ManagedSeries> {
        await this.settle(signal);
        const { record, series } = this.findSeries(seriesId);
        this.assertSeriesSlugFree(record, input.slug, series.id);
        Object.assign(series, input);
        this.announceSeries(record, series);
        return copy(series);
    }

    async deleteSeries(seriesId: string, signal: AbortSignal): Promise<void> {
        await this.settle(signal);
        const { record, series } = this.findSeries(seriesId);
        if (series.problems.some(p => p.submissionCount > 0)) {
            Utils.throwError("This series holds submissions and cannot be deleted");
        }
        for (const assignment of series.problems) this.countAttachment(assignment.problemId, -1);
        record.series = record.series.filter(s => s.id !== seriesId).map((s, i) => ({ ...s, order: i + 1 }));
        this.recount(record);
        this.eventDispatcher.dispatchEvent({
            type: "seriesChanged",
            data: { activityId: record.activity.id, deletedId: seriesId },
        });
    }

    async reorderSeries(activityId: string, orderedIds: string[], signal: AbortSignal): Promise<ManagedSeries[]> {
        await this.settle(signal);
        const record = this.findActivity(activityId);
        record.series = sortByGiven(record.series, orderedIds).map((s, i) => ({ ...s, order: i + 1 }));
        for (const series of record.series) this.announceSeries(record, series);
        return copy(record.series);
    }

    async attachProblem(seriesId: string, input: SeriesProblemInput, signal: AbortSignal): Promise<ManagedSeries> {
        await this.settle(signal);
        const { record, series } = this.findSeries(seriesId);
        this.assertNotArchived(record);
        this.assertAssignmentSlugFree(record, input.slug);
        const source = this.find(input.problemId);
        if (source.problem.archivedAt) {
            // Archived leaves the picker: existing assignments keep working, new
            // ones are not made.
            Utils.throwError("An archived problem cannot be attached");
        }
        const version = input.pinnedProblemVersionId
            ? source.versions.find(v => v.id === input.pinnedProblemVersionId)
            : source.versions[0];
        series.problems = [...series.problems, {
            ...input,
            id: newId(),
            seriesId: series.id,
            problemId: source.problem.id,
            problemSlug: source.problem.slug,
            problemName: source.problem.name,
            order: series.problems.length + 1,
            currentVersion: source.problem.currentVersion,
            pinnedVersion: input.pinnedProblemVersionId ? version?.version : undefined,
            hasPackage: version?.hasPackage ?? false,
            submissionCount: 0,
            config: input.config ?? {},
        }];
        this.countAttachment(source.problem.id, 1);
        this.recount(record);
        this.announceSeries(record, series);
        return copy(series);
    }

    async updateSeriesProblem(seriesProblemId: string, input: SeriesProblemInput, signal: AbortSignal): Promise<ManagedSeries> {
        await this.settle(signal);
        const { record, series, assignment } = this.findAssignment(seriesProblemId);
        this.assertAssignmentSlugFree(record, input.slug, assignment.id);
        const versions = this.find(input.problemId).versions;
        const version = input.pinnedProblemVersionId
            ? versions.find(v => v.id === input.pinnedProblemVersionId)
            : versions[0];
        Object.assign(assignment, input, {
            pinnedVersion: input.pinnedProblemVersionId ? version?.version : undefined,
            hasPackage: version?.hasPackage ?? false,
        });
        this.announceSeries(record, series);
        return copy(series);
    }

    async detachProblem(seriesProblemId: string, signal: AbortSignal): Promise<ManagedSeries> {
        await this.settle(signal);
        const { record, series, assignment } = this.findAssignment(seriesProblemId);
        if (assignment.submissionCount > 0) {
            // A result belongs to what it was judged against; detaching would
            // leave it pointing at nothing.
            Utils.throwError("Something has already been submitted here. The assignment cannot be removed.");
        }
        series.problems = series.problems
            .filter(p => p.id !== seriesProblemId)
            .map((p, i) => ({ ...p, order: i + 1 }));
        this.countAttachment(assignment.problemId, -1);
        this.recount(record);
        this.announceSeries(record, series);
        return copy(series);
    }

    async reorderSeriesProblems(seriesId: string, orderedIds: string[], signal: AbortSignal): Promise<ManagedSeries> {
        await this.settle(signal);
        const { record, series } = this.findSeries(seriesId);
        series.problems = sortByGiven(series.problems, orderedIds).map((p, i) => ({ ...p, order: i + 1 }));
        this.announceSeries(record, series);
        return copy(series);
    }

    async getRunners(filter: ManagedRunnerFilter, signal: AbortSignal): Promise<Page<ManagedRunner>> {
        await this.settle(signal);
        const needle = filter.search?.trim().toLowerCase();
        const matched = this.runners
            .filter(r => !filter.state || r.state === filter.state)
            .filter(r => !needle
                || r.name.toLowerCase().includes(needle)
                || r.address.toLowerCase().includes(needle)
                || r.fingerprint.toLowerCase().includes(needle)
                || r.tags.some(tag => tag.toLowerCase().includes(needle)));
        return copy(paginate(matched, filter.page, filter.pageSize));
    }

    async approveRunner(id: string, signal: AbortSignal): Promise<ManagedRunner> {
        await this.settle(signal);
        const runner = this.findRunner(id);
        if (runner.state === "revoked") {
            // A revoked key stays revoked. The Runner comes back as a new
            // identity, which is the point of never rotating a key.
            Utils.throwError("A revoked Runner cannot be approved; it must register again");
        }
        runner.state = "approved";
        runner.approvedAt = new Date().toISOString();
        this.announceRunner(runner);
        return copy(runner);
    }

    async revokeRunner(id: string, reason: string | undefined, signal: AbortSignal): Promise<ManagedRunner> {
        await this.settle(signal);
        const runner = this.findRunner(id);
        runner.state = "revoked";
        runner.revokedAt = new Date().toISOString();
        runner.revokedReason = reason;
        runner.currentSubmissionId = undefined;
        this.announceRunner(runner);
        return copy(runner);
    }

    async setRunnerTags(id: string, tags: string[], signal: AbortSignal): Promise<ManagedRunner> {
        await this.settle(signal);
        const runner = this.findRunner(id);
        runner.tags = [...tags];
        this.announceRunner(runner);
        return copy(runner);
    }

    async getRunnerAttachment(runnerId: string, attachmentId: string, signal: AbortSignal): Promise<string> {
        await this.settle(signal);
        const runner = this.findRunner(runnerId);
        if (!runner.attachments.some(a => a.id === attachmentId)) notFound("Attachment");
        return runnerFile(attachmentId);
    }

    async forgetRunner(id: string, signal: AbortSignal): Promise<void> {
        await this.settle(signal);
        const runner = this.findRunner(id);
        if (runner.state !== "revoked") {
            Utils.throwError("Revoke it before forgetting it");
        }
        this.runners = this.runners.filter(r => r.id !== id);
        this.eventDispatcher.dispatchEvent({ type: "runnerChanged", data: { runner: copy(runner) } });
    }

    async getUsers(filter: ManagedUserFilter, signal: AbortSignal): Promise<Page<ManagedUser>> {
        await this.settle(signal);
        const needle = filter.search?.trim().toLowerCase();
        const matched = this.users
            .filter(u => filter.includeBlocked || u.blockedAt === undefined)
            .filter(u => !filter.temporaryOnly || u.isTemporary)
            .filter(u => !needle
                || `${u.firstName ?? ""} ${u.lastName ?? ""}`.toLowerCase().includes(needle)
                || u.username.toLowerCase().includes(needle)
                || (u.email ?? "").toLowerCase().includes(needle)
                || u.tags.some(tag => tag.toLowerCase().includes(needle)))
            .map(user => this.withGrantCount(user));
        return copy(paginate(matched, filter.page, filter.pageSize));
    }

    async createUser(input: UserInput, signal: AbortSignal): Promise<CreatedCredential> {
        await this.settle(signal);
        this.assertUsernameFree(input.username);
        const user: ManagedUser = {
            id: newId(),
            username: input.username.trim(),
            firstName: input.firstName?.trim() || undefined,
            lastName: input.lastName?.trim() || undefined,
            email: input.email?.trim() || undefined,
            emailConfirmed: false,
            // Created by staff, so it is in — the pending state is for accounts
            // that arrived on their own.
            approvedAt: new Date().toISOString(),
            tags: [],
            isTemporary: false,
            createdAt: new Date().toISOString(),
            grantCount: 0,
        };
        this.users = [user, ...this.users];
        this.announceUser(user);
        return { userId: user.id, username: user.username, password: password() };
    }

    async createTemporaryUsers(input: BulkUserInput, signal: AbortSignal): Promise<CreatedCredential[]> {
        await this.settle(signal);
        if (input.count < 1 || input.count > 500) {
            Utils.throwError("Create between 1 and 500 accounts at a time");
        }
        const prefix = input.prefix.trim();
        if (!/^[a-z0-9][a-z0-9-]*$/i.test(prefix)) {
            // The prefix becomes a username, and a username someone has to type
            // in a hurry at a workstation cannot hold spaces or punctuation.
            Utils.throwError("The prefix may hold letters, digits and dashes only");
        }

        const created: CreatedCredential[] = [];
        // Numbering continues past whatever the prefix already produced, so
        // running it twice does not collide.
        const taken = this.users.filter(u => u.username.startsWith(`${prefix}-`)).length;
        for (let i = 1; i <= input.count; i++) {
            const username = `${prefix}-${String(taken + i).padStart(3, "0")}`;
            const user: ManagedUser = {
                id: newId(),
                username,
                emailConfirmed: false,
                approvedAt: new Date().toISOString(),
                tags: [...(input.tags ?? []), "temporary"],
                isTemporary: true,
                expiresAt: input.expiresAt,
                createdAt: new Date().toISOString(),
                grantCount: input.activityId ? 1 : 0,
            };
            this.users = [...this.users, user];
            if (input.activityId) {
                // Enrolled as they are created: a hundred accounts nobody is in
                // an activity with are a hundred accounts that cannot submit.
                this.grants = [...this.grants, {
                    id: newId(),
                    userId: user.id,
                    userName: displayName(user),
                    activityId: input.activityId,
                    activityName: MANAGED_ACTIVITIES.find(a => a.id === input.activityId)?.name,
                    permissions: [...(input.permissions ?? [])],
                    state: "active",
                    createdAt: user.createdAt,
                }];
            }
            created.push({ userId: user.id, username, password: password() });
        }
        this.eventDispatcher.dispatchEvent({ type: "grantChanged", data: {} });
        return created;
    }

    async setUserBlocked(id: string, blocked: boolean, reason: string | undefined, signal: AbortSignal): Promise<ManagedUser> {
        await this.settle(signal);
        const user = this.findUser(id);
        user.blockedAt = blocked ? new Date().toISOString() : undefined;
        user.blockedReason = blocked ? reason : undefined;
        this.announceUser(user);
        return copy(this.withGrantCount(user));
    }

    async resetUserPassword(id: string, signal: AbortSignal): Promise<CreatedCredential> {
        await this.settle(signal);
        const user = this.findUser(id);
        // Returned once and never readable again: the Server keeps a hash.
        return { userId: user.id, username: user.username, password: password() };
    }

    async updateUser(id: string, input: UserUpdateInput, signal: AbortSignal): Promise<ManagedUser> {
        await this.settle(signal);
        const user = this.findUser(id);
        if (input.firstName !== undefined) user.firstName = input.firstName.trim() || undefined;
        if (input.lastName !== undefined) user.lastName = input.lastName.trim() || undefined;
        if (input.email !== undefined) {
            const address = input.email.trim() || undefined;
            // A changed address is an unconfirmed address, whatever the old one
            // was worth.
            if (address !== user.email) user.emailConfirmed = false;
            user.email = address;
        }
        if (input.note !== undefined) user.note = input.note.trim() || undefined;
        if (input.tags !== undefined) user.tags = [...input.tags];
        this.announceUser(user);
        return copy(this.withGrantCount(user));
    }

    async approveUser(id: string, signal: AbortSignal): Promise<ManagedUser> {
        await this.settle(signal);
        const user = this.findUser(id);
        user.approvedAt = new Date().toISOString();
        this.announceUser(user);
        return copy(this.withGrantCount(user));
    }

    async getQuestions(filter: ManagedQuestionFilter, signal: AbortSignal): Promise<Page<ManagedQuestion>> {
        await this.settle(signal);
        const needle = filter.search?.trim().toLowerCase();
        const matched = this.questions
            .filter(q => !filter.activityId || q.activityId === filter.activityId)
            .filter(q => !filter.seriesId || q.seriesId === filter.seriesId)
            .filter(q => !filter.kind || q.kind === filter.kind)
            // An announcement is never unanswered: nobody asked it.
            .filter(q => !filter.unansweredOnly || (q.kind === "question" && q.answer === undefined))
            .filter(q => !needle
                || q.topic.toLowerCase().includes(needle)
                || q.body.toLowerCase().includes(needle)
                || (q.authorName ?? "").toLowerCase().includes(needle))
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        return copy(paginate(matched, filter.page, filter.pageSize));
    }

    async answerQuestion(id: string, input: AnswerInput, signal: AbortSignal): Promise<ManagedQuestion> {
        await this.settle(signal);
        const question = this.findQuestion(id);
        if (question.kind === "announcement") {
            Utils.throwError("An announcement has no question to answer");
        }
        question.answer = {
            body: input.body,
            authorName: "Amy Horsefighter",
            answeredAt: new Date().toISOString(),
        };
        // Answering and publishing are two acts, and this is the one that keeps
        // them apart: an answer stays private unless the caller says otherwise.
        if (input.publish) question.isPublished = true;
        this.announceQuestion(question);
        return copy(question);
    }

    async setQuestionPublished(id: string, published: boolean, signal: AbortSignal): Promise<ManagedQuestion> {
        await this.settle(signal);
        const question = this.findQuestion(id);
        if (published && question.kind === "question" && question.answer === undefined) {
            // Publishing an unanswered question shows everyone the doubt without
            // the answer, which is the opposite of what publishing is for.
            Utils.throwError("Answer it before publishing it");
        }
        question.isPublished = published;
        this.announceQuestion(question);
        return copy(question);
    }

    async createAnnouncement(activityId: string, input: AnnouncementInput, signal: AbortSignal): Promise<ManagedQuestion> {
        await this.settle(signal);
        const record = this.findActivity(activityId);
        this.assertNotArchived(record);
        const series = input.seriesId
            ? record.series.find(s => s.id === input.seriesId) ?? notFound("Series")
            : undefined;
        const announcement: ManagedQuestion = {
            id: newId(),
            activityId: record.activity.id,
            activitySlug: record.activity.slug,
            kind: "announcement",
            topic: input.topic,
            body: input.body,
            createdAt: new Date().toISOString(),
            seriesId: series?.id,
            seriesName: series?.name,
            // Published from the start: an announcement nobody can read is a note
            // to oneself.
            isPublished: true,
            readCount: 0,
        };
        this.questions = [announcement, ...this.questions];
        this.announceQuestion(announcement);
        return copy(announcement);
    }

    async deleteAnnouncement(id: string, signal: AbortSignal): Promise<void> {
        await this.settle(signal);
        const question = this.findQuestion(id);
        if (question.kind !== "announcement") {
            // A participant's question is theirs. Staff answer it or leave it.
            Utils.throwError("A question cannot be deleted");
        }
        this.questions = this.questions.filter(q => q.id !== id);
        this.eventDispatcher.dispatchEvent({ type: "questionChanged", data: { deletedId: id } });
    }

    async getSubmissions(filter: ManagedSubmissionFilter, signal: AbortSignal): Promise<Page<ManagedSubmission>> {
        await this.settle(signal);
        const needle = filter.search?.trim().toLowerCase();
        // Filtered before paged, which is the order the Server must use too: the
        // other way round filters one page and calls it a result.
        const matched = this.submissions
            .filter(s => !filter.activityId || s.activityId === filter.activityId)
            .filter(s => !filter.seriesId || s.seriesId === filter.seriesId)
            .filter(s => !filter.seriesProblemId || s.seriesProblemId === filter.seriesProblemId)
            .filter(s => !filter.userId || s.userId === filter.userId)
            .filter(s => !filter.state || s.state === filter.state)
            .filter(s => !filter.verdict || s.verdict === filter.verdict)
            .filter(s => !needle
                || s.userName.toLowerCase().includes(needle)
                || s.problemSlug.toLowerCase().includes(needle)
                || s.problemName.toLowerCase().includes(needle))
            .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
            .map(summary);
        return copy(paginate(matched, filter.page, filter.pageSize));
    }

    async getSubmission(id: string, signal: AbortSignal): Promise<ManagedSubmissionDetail> {
        await this.settle(signal);
        return copy(this.findSubmission(id));
    }

    async getSubmissionFile(id: string, name: string, signal: AbortSignal): Promise<string> {
        await this.settle(signal);
        const submission = this.findSubmission(id);
        if (!submission.files.some(f => f.name === name)) notFound("File");
        return submissionSource(submission.language);
    }

    async rejudgeSubmission(id: string, signal: AbortSignal): Promise<ManagedSubmission> {
        await this.settle(signal);
        return copy(summary(this.queueRejudge(this.findSubmission(id))));
    }

    async rejudgeSeriesProblem(seriesProblemId: string, signal: AbortSignal): Promise<number> {
        await this.settle(signal);
        const affected = this.submissions.filter(s => s.seriesProblemId === seriesProblemId);
        for (const submission of affected) this.queueRejudge(submission);
        return affected.length;
    }

    async rejudgeSeries(seriesId: string, signal: AbortSignal): Promise<number> {
        await this.settle(signal);
        const affected = this.submissions.filter(s => s.seriesId === seriesId);
        for (const submission of affected) this.queueRejudge(submission);
        return affected.length;
    }

    async cancelAttempt(submissionId: string, attemptId: string, signal: AbortSignal): Promise<ManagedSubmissionDetail> {
        await this.settle(signal);
        const submission = this.findSubmission(submissionId);
        const attempt = submission.attemptList.find(a => a.id === attemptId) ?? notFound("Attempt");
        if (attempt.state === "completed" || attempt.state === "failed") {
            // A finished job is history. Cancelling one would rewrite a result
            // that a participant has already been shown.
            Utils.throwError("This attempt has already finished and cannot be cancelled");
        }
        attempt.state = "cancelled";
        attempt.finishedAt = new Date().toISOString();
        submission.state = "cancelled";
        this.announceSubmission(submission);
        return copy(submission);
    }

    async getProblems(filter: ProblemFilter, signal: AbortSignal): Promise<Page<ManagedProblem>> {
        await this.settle(signal);
        const needle = filter.search?.trim().toLowerCase();
        const matched = this.library
            .map(r => r.problem)
            // Private is the default, so the library a manager sees is their own
            // plus whatever was shared with them plus whatever is instance-wide.
            .filter(p => p.visibility !== "private" || p.ownerUserId === ME || p.sharedWith.includes(ME))
            .filter(p => !filter.mineOnly || p.ownerUserId === ME)
            .filter(p => filter.includeArchived || p.archivedAt === undefined)
            .filter(p => !needle
                || p.name.toLowerCase().includes(needle)
                || p.slug.toLowerCase().includes(needle));
        return copy(paginate(matched, filter.page, filter.pageSize));
    }

    async getProblem(id: string, signal: AbortSignal): Promise<ManagedProblem> {
        await this.settle(signal);
        return copy(this.find(id).problem);
    }

    async createProblem(input: ProblemInput, signal: AbortSignal): Promise<ManagedProblem> {
        await this.settle(signal);
        this.assertSlugFree(input.slug);
        const problem: ManagedProblem = {
            id: newId(),
            ...input,
            ownerUserId: ME,
            ownerName: "Amy Horsefighter",
            visibility: "private",
            sharedWith: [],
            currentVersion: 0,
            versionCount: 0,
            createdAt: new Date().toISOString(),
            attachedCount: 0,
        };
        this.library = [{ problem, versions: [], content: new Map() }, ...this.library];
        this.announce(problem);
        return copy(problem);
    }

    async updateProblem(id: string, input: ProblemInput, signal: AbortSignal): Promise<ManagedProblem> {
        await this.settle(signal);
        const record = this.find(id);
        this.assertSlugFree(input.slug, id);
        Object.assign(record.problem, input);
        this.announce(record.problem);
        return copy(record.problem);
    }

    async duplicateProblem(id: string, signal: AbortSignal): Promise<ManagedProblem> {
        await this.settle(signal);
        const source = this.find(id);
        // Only the newest version travels, as version 1 of the new problem: the
        // history belongs to what it was judged against, not to the copy.
        const newest = source.versions[0];
        const versionId = newId();
        const problem: ManagedProblem = {
            ...source.problem,
            id: newId(),
            slug: source.problem.slug + "-kopia",
            name: source.problem.name + " (kopia)",
            ownerUserId: ME,
            ownerName: "Amy Horsefighter",
            visibility: "private",
            sharedWith: [],
            archivedAt: undefined,
            currentVersion: newest ? 1 : 0,
            versionCount: newest ? 1 : 0,
            createdAt: new Date().toISOString(),
            attachedCount: 0,
        };
        const versions = newest
            ? [{ ...newest, id: versionId, version: 1, createdAt: problem.createdAt, note: undefined }]
            : [];
        // Every language travels with the copy: a duplicate of a bilingual
        // problem that lost its translation would be a silent deletion.
        const content = new Map<string, StatementVariant[]>();
        if (newest) content.set(versionId, source.content.get(newest.id) ?? []);
        this.library = [{ problem, versions, content }, ...this.library];
        this.announce(problem);
        return copy(problem);
    }

    async setProblemVisibility(id: string, visibility: ProblemVisibility, sharedWith: string[], signal: AbortSignal): Promise<ManagedProblem> {
        await this.settle(signal);
        const record = this.find(id);
        record.problem.visibility = visibility;
        record.problem.sharedWith = visibility === "shared" ? [...sharedWith] : [];
        this.announce(record.problem);
        return copy(record.problem);
    }

    async setProblemArchived(id: string, archived: boolean, signal: AbortSignal): Promise<ManagedProblem> {
        await this.settle(signal);
        const record = this.find(id);
        record.problem.archivedAt = archived ? new Date().toISOString() : undefined;
        this.announce(record.problem);
        return copy(record.problem);
    }

    async deleteProblem(id: string, signal: AbortSignal): Promise<void> {
        await this.settle(signal);
        const record = this.find(id);
        if (record.problem.attachedCount > 0) {
            // Retiring a problem must not break an activity that ran with it.
            Utils.throwError("This problem is attached to an activity. Archive it instead of deleting it.");
        }
        this.library = this.library.filter(r => r.problem.id !== id);
        this.eventDispatcher.dispatchEvent({ type: "problemChanged", data: { deletedId: id } });
    }

    async getProblemVersions(problemId: string, signal: AbortSignal): Promise<ManagedProblemVersion[]> {
        await this.settle(signal);
        return copy(this.find(problemId).versions);
    }

    async getProblemContent(problemId: string, versionId: string, signal: AbortSignal): Promise<StatementVariant[]> {
        await this.settle(signal);
        return copy(this.find(problemId).content.get(versionId) ?? []);
    }

    async createProblemVersion(problemId: string, input: ProblemVersionInput, signal: AbortSignal): Promise<ManagedProblemVersion> {
        await this.settle(signal);
        const record = this.find(problemId);
        if (record.problem.archivedAt) {
            Utils.throwError("An archived problem takes no new versions");
        }
        const previous = record.versions[0];

        // Everything that can be refused is refused before anything is stored: a
        // publication that fails halfway would leave a version holding some of
        // what was published and none of the rest.
        const staged = input.files ?? [];
        const removed = new Set(input.removedFiles ?? []);
        // The statement files and the package are rebuilt below from what was
        // published; everything else is carried forward unless it was removed.
        const carried = (previous?.files ?? []).filter(f =>
            !isStatementName(f.name) && f.name !== "package.zip" && !removed.has(f.name));

        for (const entry of staged) {
            if (await sha256(entry.file) !== entry.sha256) {
                Utils.throwError(`${entry.file.name} does not match its checksum and was not stored`);
            }
            if (isStatementName(entry.file.name)) {
                // `content.md` and its translations are the statement, written in
                // the editor. Attaching one here would put a second answer beside
                // the one published.
                Utils.throwError("content.* is the statement; edit it in the Statement tab");
            }
            if (carried.some(f => f.name === entry.file.name)
                || staged.filter(s => s.file.name === entry.file.name).length > 1) {
                // Refused rather than replaced: a statement referring to the name
                // must not change meaning because somebody attached a new file.
                Utils.throwError(`This version already has a file called ${entry.file.name}`);
            }
        }
        if (input.package && await sha256(input.package.archive) !== input.package.sha256) {
            Utils.throwError("The package does not match its checksum and was not stored");
        }

        const version: ManagedProblemVersion = {
            id: newId(),
            version: (previous?.version ?? 0) + 1,
            createdAt: new Date().toISOString(),
            createdByName: "Amy Horsefighter",
            note: input.note,
            config: input.config ?? previous?.config ?? {},
            hasPackage: false,
            files: [],
        };
        // Append-only: a correction publishes a new version rather than editing
        // an old one, so a finished result stays attached to what it was judged
        // against.
        record.versions = [version, ...record.versions];
        // A version carries every language it was published with. Publishing
        // without a statement keeps the previous one, translations included.
        record.content.set(version.id, input.content === undefined && !input.translations
            ? (record.content.get(previous?.id ?? "") ?? [])
            : [
                ...(input.content === undefined ? [] : [{ content: input.content }]),
                ...(input.translations ?? []).filter(v => v.language !== undefined),
            ]);

        // The package: the one published, or the previous version's carried
        // forward. A version without one is a version nothing can be judged
        // against, and that is not what fixing a typo should produce.
        let archive = input.package?.archive;
        if (!archive && previous?.hasPackage && !removed.has("package.zip")) {
            // Read the way the editor reads it: a seeded version holds no bytes
            // until something asks for them.
            archive = await this.getProblemPackage(problemId, previous.id, signal);
        }
        if (archive) {
            this.packages.set(version.id, archive);
            version.hasPackage = true;
        }

        version.files = [
            ...(input.content === undefined ? [] : [{
                name: "content.md", scope: "participant" as const, mimeType: "text/markdown",
                sizeBytes: 2048, sha256: fakeSha(`${version.id}/content.md`),
            }]),
            ...(input.translations ?? [])
                .filter(v => v.language !== undefined)
                .map(v => ({
                    name: `content-${v.language}.md`, scope: "participant" as const, mimeType: "text/markdown",
                    sizeBytes: 2048, sha256: fakeSha(`${version.id}/content-${v.language}.md`),
                })),
            ...carried,
            ...staged.map(entry => ({
                name: entry.file.name,
                scope: entry.scope,
                mimeType: entry.file.type || "application/octet-stream",
                sizeBytes: entry.file.size,
                sha256: entry.sha256,
                // A real URL, so the preview shows the figure rather than a
                // promise of one. It lives as long as the tab does, which is what
                // a fake can honestly offer.
                url: URL.createObjectURL(entry.file),
            })),
            ...(archive ? [{
                name: "package.zip", scope: "runner" as const, mimeType: "application/zip",
                sizeBytes: archive.size, sha256: input.package?.sha256 ?? await sha256(archive),
            }] : []),
        ];
        record.problem.currentVersion = version.version;
        record.problem.versionCount = record.versions.length;
        this.announce(record.problem);
        return copy(version);
    }

    async getProblemPackage(problemId: string, versionId: string, signal: AbortSignal): Promise<Blob | undefined> {
        await this.settle(signal);
        const record = this.find(problemId);
        const version = record.versions.find(v => v.id === versionId) ?? notFound("Version");
        if (!version.hasPackage) return undefined;

        const held = this.packages.get(versionId);
        if (held) return held;

        // A seeded version has no bytes, because nobody uploaded any. Rather
        // than answer "there is a package but you cannot have it", the fake
        // assembles one — with the same builder the manager screen uses, so what
        // comes back opens.
        //
        // `ProblemVersion.Config` is **not** a package configuration: it is the
        // opaque chain the Client and the Runner read, and it carries `scoring`
        // where a package carries `groups`. Conflating the two is what produced
        // an archive whose `config.yml` had no groups at all.
        const versionConfig = version.config as {
            limits?: { timeMs?: number; memoryMb?: number };
            scoring?: { groups?: { group: number; points: number }[] };
        } | undefined;
        const config = {
            ...emptyConfig(),
            limits: {
                timeMs: versionConfig?.limits?.timeMs ?? 1000,
                // The version's chain speaks megabytes, because that is what a
                // participant is shown; the package speaks kibibytes, because
                // that is what `sinolpack` speaks. The conversion happens here,
                // once, at the boundary between the two.
                memoryKib: (versionConfig?.limits?.memoryMb ?? 256) * 1024,
            },
            groups: [
                { group: 0, points: 0, examples: true },
                ...(versionConfig?.scoring?.groups ?? [{ group: 1, points: 100 }]),
            ],
        };
        const archive = await buildPackage({
            config,
            tests: [
                { name: "0a", group: 0, letter: "a", input: "4 3\n1 2\n2 3\n3 4", output: "TAK" },
                { name: "1a", group: 1, letter: "a", input: "1 0", output: "TAK" },
                { name: "2a", group: 2, letter: "a", input: "4 2\n1 2\n3 4", output: "NIE" },
            ],
        });
        this.packages.set(versionId, archive);
        return archive;
    }

    private findRunner(id: string): ManagedRunner {
        return this.runners.find(r => r.id === id) ?? notFound("Runner");
    }

    private announceRunner(runner: ManagedRunner): void {
        this.eventDispatcher.dispatchEvent({ type: "runnerChanged", data: { runner: copy(runner) } });
    }

    private findUser(id: string): ManagedUser {
        return this.users.find(u => u.id === id) ?? notFound("User");
    }

    /** Read from the grants rather than stored, for the same reason as elsewhere. */
    private withGrantCount(user: ManagedUser): ManagedUser {
        return { ...user, grantCount: this.grants.filter(g => g.userId === user.id).length };
    }

    private announceUser(user: ManagedUser): void {
        this.eventDispatcher.dispatchEvent({
            type: "userChanged",
            data: { user: copy(this.withGrantCount(user)) },
        });
    }

    private assertUsernameFree(username: string): void {
        if (this.users.some(u => u.username.toLowerCase() === username.trim().toLowerCase())) {
            Utils.throwError("That username is taken");
        }
    }

    private findQuestion(id: string): ManagedQuestion {
        return this.questions.find(q => q.id === id) ?? notFound("Question");
    }

    private announceQuestion(question: ManagedQuestion): void {
        this.eventDispatcher.dispatchEvent({ type: "questionChanged", data: { question: copy(question) } });
    }

    private findSubmission(id: string): ManagedSubmissionDetail {
        return this.submissions.find(s => s.id === id) ?? notFound("Submission");
    }

    /**
     * A rejudge adds an attempt rather than replacing one: the earlier result
     * belongs to what it was judged against. The fake then walks the new job
     * through running and completed, so the live paths are exercised without a
     * Server.
     */
    private queueRejudge(submission: ManagedSubmissionDetail): ManagedSubmissionDetail {
        const attempt: ManagedAttempt = {
            id: `${submission.id}-job-${submission.attemptList.length + 1}`,
            attempt: submission.attemptList.length + 1,
            state: "queued",
            startedAt: new Date().toISOString(),
        };
        submission.attemptList = [attempt, ...submission.attemptList];
        submission.attempts = submission.attemptList.length;
        submission.state = "queued";
        submission.verdict = undefined;
        submission.score = undefined;
        this.announceSubmission(submission);

        window.setTimeout(() => {
            attempt.state = "running";
            attempt.runnerName = "Main runner";
            submission.state = "running";
            this.announceSubmission(submission);
        }, 1500);

        window.setTimeout(() => {
            const previous = submission.attemptList[1];
            attempt.state = "completed";
            attempt.finishedAt = new Date().toISOString();
            // The same verdict as before: a rejudge against unchanged tests
            // should reproduce the result, and a fake that shuffled it would
            // teach the screen to expect noise.
            attempt.detail = previous?.detail;
            submission.state = "completed";
            submission.verdict = previous?.state === "completed"
                ? (previous.detail as { verdict?: string } | undefined)?.verdict
                : undefined;
            submission.score = (previous?.detail as { score?: number } | undefined)?.score;
            this.announceSubmission(submission);
        }, 4000);

        return submission;
    }

    private announceSubmission(submission: ManagedSubmissionDetail): void {
        this.eventDispatcher.dispatchEvent({
            type: "submissionChanged",
            data: { submission: copy(summary(submission)) },
        });
    }

    private findActivity(idOrSlug: string): ActivityRecord {
        const needle = idOrSlug.toLowerCase();
        return this.activities.find(r =>
            r.activity.id === idOrSlug || r.activity.slug.toLowerCase() === needle) ?? notFound("Activity");
    }

    private findSeries(seriesId: string): { record: ActivityRecord; series: ManagedSeries } {
        for (const record of this.activities) {
            const series = record.series.find(s => s.id === seriesId);
            if (series) return { record, series };
        }
        return notFound("Series");
    }

    private findAssignment(id: string): { record: ActivityRecord; series: ManagedSeries; assignment: ManagedSeriesProblem } {
        for (const record of this.activities) {
            for (const series of record.series) {
                const assignment = series.problems.find(p => p.id === id);
                if (assignment) return { record, series, assignment };
            }
        }
        return notFound("Assignment");
    }

    /** Keeps the library's `attachedCount` honest, which is what refuses a delete. */
    private countAttachment(problemId: string, delta: number): void {
        const record = this.library.find(r => r.problem.id === problemId);
        if (!record) return;
        record.problem.attachedCount = Math.max(0, record.problem.attachedCount + delta);
        this.announce(record.problem);
    }

    private recount(record: ActivityRecord): void {
        record.activity.seriesCount = record.series.length;
        record.activity.problemCount = record.series.reduce((sum, s) => sum + s.problems.length, 0);
        this.announceActivity(record.activity);
    }

    private assertNotArchived(record: ActivityRecord): void {
        if (record.activity.archivedAt) Utils.throwError("An archived activity accepts no changes");
    }

    private assertActivitySlugFree(slug: string, exceptId?: string): void {
        if (this.activities.some(r => r.activity.slug.toLowerCase() === slug.trim().toLowerCase() && r.activity.id !== exceptId)) {
            Utils.throwError("An activity with that slug already exists");
        }
    }

    private assertSeriesSlugFree(record: ActivityRecord, slug: string, exceptId?: string): void {
        if (record.series.some(s => s.slug.toLowerCase() === slug.trim().toLowerCase() && s.id !== exceptId)) {
            Utils.throwError("A series with that slug already exists in this activity");
        }
    }

    /** Unique across the **whole activity**, not merely within one series. */
    private assertAssignmentSlugFree(record: ActivityRecord, slug: string, exceptId?: string): void {
        const taken = record.series
            .flatMap(s => s.problems)
            .some(p => p.slug.toLowerCase() === slug.trim().toLowerCase() && p.id !== exceptId);
        if (taken) Utils.throwError("That problem slug is already used in this activity");
    }

    /** Membership is the grants, so the count is read from them, never stored. */
    private withCounts(activity: ManagedActivity): ManagedActivity {
        return {
            ...activity,
            participantCount: this.grants.filter(g => g.activityId === activity.id).length,
        };
    }

    private announceActivity(activity: ManagedActivity): void {
        this.eventDispatcher.dispatchEvent({
            type: "activityChanged",
            data: { activity: copy(this.withCounts(activity)) },
        });
    }

    private announceSeries(record: ActivityRecord, series: ManagedSeries): void {
        this.eventDispatcher.dispatchEvent({
            type: "seriesChanged",
            data: { activityId: record.activity.id, series: copy(series) },
        });
    }

    private find(id: string): ProblemRecord {
        return this.library.find(r => r.problem.id === id) ?? notFound("Problem");
    }

    private announce(problem: ManagedProblem): void {
        this.eventDispatcher.dispatchEvent({ type: "problemChanged", data: { problem: copy(problem) } });
    }

    private assertSlugFree(slug: string, exceptId?: string): void {
        if (this.library.some(r => r.problem.slug.toLowerCase() === slug.trim().toLowerCase() && r.problem.id !== exceptId)) {
            Utils.throwError("A problem with that slug already exists");
        }
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
