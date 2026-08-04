import { ManagerEventDispatcherImpl } from "../impl/ManagerEventDispatcher";
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
    ManagedAttempt,
    ManagedSeries,
    ManagedSeriesProblem,
    ManagedSubmission,
    ManagedSubmissionDetail,
    ManagedSubmissionFilter,
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
} from "../ManagerApi";
import { Page } from "../ParticipantApi";
import {
    createGrants,
    createTemplates,
    MANAGED_ACTIVITIES,
    MANAGED_USERS,
    MY_SYSTEM_PERMISSIONS,
    PERMISSION_CATALOGUE,
} from "./fixtures/permissions";
import { ActivityRecord, createActivityLibrary } from "./fixtures/activities";
import { createProblemLibrary, fakeSha, ME, ProblemRecord } from "./fixtures/problems";
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

const newId = () => `018f2c00-0000-7000-8000-${Math.random().toString(16).slice(2, 14).padEnd(12, "0")}`;

export class ManagerApiFake implements ManagerApi {
    readonly eventDispatcher = new ManagerEventDispatcherImpl();

    private templates = createTemplates();
    private grants = createGrants();
    private library: ProblemRecord[] = createProblemLibrary();
    private activities: ActivityRecord[] = createActivityLibrary();
    private submissions: ManagedSubmissionDetail[] = createSubmissions();

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
        const version: ManagedProblemVersion = {
            id: newId(),
            version: (previous?.version ?? 0) + 1,
            createdAt: new Date().toISOString(),
            createdByName: "Amy Horsefighter",
            note: input.note,
            config: input.config ?? previous?.config ?? {},
            hasPackage: previous?.hasPackage ?? false,
            files: previous?.files ?? [],
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
        version.files = [
            ...(input.content === undefined ? [] : [{
                name: "content.md", scope: "participant" as const, sizeBytes: 2048,
                sha256: fakeSha(`${version.id}/content.md`),
            }]),
            ...(input.translations ?? [])
                .filter(v => v.language !== undefined)
                .map(v => ({
                    name: `content-${v.language}.md`, scope: "participant" as const, sizeBytes: 2048,
                    sha256: fakeSha(`${version.id}/content-${v.language}.md`),
                })),
            ...(previous?.files ?? []).filter(f => !f.name.startsWith("content")),
        ];
        record.problem.currentVersion = version.version;
        record.problem.versionCount = record.versions.length;
        this.announce(record.problem);
        return copy(version);
    }

    async uploadProblemPackage(problemId: string, versionId: string, archive: Blob, checksum: string, signal: AbortSignal): Promise<ManagedProblemVersion> {
        await this.settle(signal);
        const record = this.find(problemId);
        const version = record.versions.find(v => v.id === versionId) ?? notFound("Version");

        // The Server recomputes rather than records: a checksum the caller sends
        // is a claim, and storing it unchecked would make a truncated upload a
        // stored file whose contents are wrong.
        if (await sha256(archive) !== checksum) {
            Utils.throwError("The package does not match its checksum and was not stored");
        }

        version.hasPackage = true;
        version.files = [
            ...version.files.filter(f => f.name !== "package.zip"),
            { name: "package.zip", scope: "runner", sizeBytes: archive.size, sha256: checksum },
        ];
        this.announce(record.problem);
        return copy(version);
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
