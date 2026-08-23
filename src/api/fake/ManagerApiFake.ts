import { ManagerEventDispatcherImpl } from "../impl/ManagerEventDispatcher";
import {
    ActivityInput,
    DeletionRequest,
    DeletionRequestFilter,
    IdentityProvider,
    IdentityProviderInput,
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
    InstanceLogoInput,
    AccessKey,
    AccessKeyValue,
    ExternalContent,
    InstanceSettingsInput,
    NewStatement,
    UserSession,
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
    PauseInput,
    ResumeInput,
    SeriesInput,
    SeriesProblemInput,
    UserInput,
    UserUpdateInput,
    NewTrial,
    Trial,
} from "../ManagerApi";
import { Page } from "../ParticipantApi";
import { displayName } from "../displayName";
import {
    createTemplates,
    MANAGED_ACTIVITIES,
    MANAGED_USERS,
    PERMISSION_CATALOGUE,
} from "./fixtures/permissions";
import { StatementRef, UploadedFile } from "../FileApi";
import { ActivityDocumentKind, ActivityDocumentRef } from "../ParticipantApi";
import { FakeActivities } from "./FakeActivities";
import { FakeAccess } from "./FakeAccess";
import { systemicByDefault } from "../permissions";
import { ActivityRecord, createActivityLibrary } from "./fixtures/activities";
import { signedInUserId } from "./CoreApiFake";
import { buildPackage } from "../../package/build";
import { emptyConfig, isPackageFile, PackageConfig, PACKAGE_ARCHIVE, SAMPLES_ARCHIVE } from "../../package/types";
import { isStatementName, statementFileName } from "../../content/types";
import { createProblemLibrary, ME, ProblemRecord } from "./fixtures/problems";
import { createQuestions } from "./fixtures/questions";
import { createRunners } from "./fixtures/runners";
import { createUsers } from "./fixtures/users";
import { createDeletionRequests, createProviders } from "./fixtures/providers";
import { createSessions } from "./fixtures/sessions";
import { FakeFiles } from "./FileApiFake";
import { FakeInstance } from "./FakeInstance";
import { InstanceDocumentKind, InstanceDocumentRef, InstanceInfo } from "../CoreApi";
import { createSubmissions } from "./fixtures/submissions";
import { sha256 } from "../../utils/sha256";
import { Utils } from "./Utils";
import { conflict, forbidden, invalid, notFound } from "./refuse";

const copy = <T>(value: T): T => structuredClone(value);

const paginate = <T>(items: T[], page = 1, pageSize = 20): Page<T> => {
    const first = pageSize * (page - 1);
    return { items: items.slice(first, first + pageSize), total: items.length, page, pageSize };
};



/** Given order first, anything the caller forgot after it, in its old order. */
const sortByGiven = <T extends { id: string }>(items: T[], orderedIds: string[]): T[] => [
    ...orderedIds.map(id => items.find(i => i.id === id)).filter((i): i is T => i !== undefined),
    ...items.filter(i => !orderedIds.includes(i.id)),
];

/**
 * The list carries no attempts and no files: a page of them is a page of rows.
 *
 * **And no origin either**, which is a rule rather than a saving. The Server
 * puts the address, the session and the device on the detail alone, because a
 * column of addresses across two hundred rows is exposure for a question nobody
 * asked of most of them — a fake that carried them on the list would be a fake
 * disagreeing with the Server about who may see what.
 */
const summary = (detail: ManagedSubmissionDetail): ManagedSubmission => {
    const { attemptList, files, problemType, ipAddress, sessionId, deviceId, ...rest } = detail;
    void attemptList; void files; void problemType;
    void ipAddress; void sessionId; void deviceId;
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

    /** Ships as an installation does, and edited from the same screen. */
    private hosts: string[] = ["onlinejudge.org"];

    /** Names and dates only, exactly as the API answers. */
    private keys: AccessKey[] = [];

    private templates = createTemplates();
    private library: ProblemRecord[];
    private activities: ActivityRecord[] = createActivityLibrary();
    private submissions: ManagedSubmissionDetail[];
    private questions: ManagedQuestion[] = createQuestions();
    /** Package bytes, by version id. Uploaded ones are kept; seeded ones are built. */
    private packages = new Map<string, Blob>();
    private users: ManagedUser[] = createUsers();
    private runners: ManagedRunner[];
    private providers: IdentityProvider[] = createProviders();
    private deletionRequests: DeletionRequest[] = createDeletionRequests();

    /**
     * The same store the rest of the fake reads: a version references files
     * that were uploaded before it was published, exactly as on the Server.
     */
    constructor(
        private readonly files: FakeFiles,
        private readonly instance: FakeInstance,
        /** Shared with the participant fake: one owner for what an activity publishes. */
        private readonly shared: FakeActivities,
        /** And one owner for the grants, because the feeds have to enforce them. */
        private readonly access: FakeAccess,
        private sleepMs: number = 300,
    ) {
        this.library = createProblemLibrary(files);
        this.submissions = createSubmissions(files);
        // Its attachments go into the same store, because the panel reads them
        // through the file endpoint like everything else.
        this.runners = createRunners(files);
        // Counted from the assignments that exist, not stated beside them. It is
        // what **refuses a delete**, so a number of its own could refuse one that
        // nothing justifies — or allow one that orphans a series.
        for (const record of this.library) {
            record.problem.attachedCount = this.activities
                .flatMap(activity => activity.series)
                .flatMap(series => series.problems)
                .filter(problem => problem.problemId === record.problem.id)
                .length;
        }
    }

    async requestAccessKey(name: string, signal: AbortSignal): Promise<AccessKeyValue> {
        await this.settle(signal);
        // The fake holds no secrets, so it answers with something obviously not
        // one. A screen that showed this to somebody would be showing it a key,
        // and the point is that no screen should.
        return { name: name.trim().toLowerCase(), value: `fake-key-for-${name.trim().toLowerCase()}` };
    }

    async fetchFile(url: string, signal: AbortSignal): Promise<UploadedFile> {
        await this.settle(signal);
        // No network here, and none wanted: what matters to a screen is that a
        // file comes back with an id it can attach. The bytes stand in.
        const name = url.split("/").pop() || "fetched";
        return this.files.seedText(name, "application/pdf", `fetched from ${url}`);
    }

    async getAccessKeys(signal: AbortSignal): Promise<AccessKey[]> {
        await this.settle(signal);
        return this.keys.map(key => ({ ...key }));
    }

    async setAccessKey(name: string, value: string, signal: AbortSignal): Promise<AccessKey[]> {
        await this.settle(signal);
        // **The value is taken and never kept anywhere a screen can read it.**
        // The fake holds only what the real answer carries, so a screen that
        // started rendering a secret would break here rather than in production.
        const key = name.trim().toLowerCase();
        const kept = this.keys.filter(one => one.name !== key);
        this.keys = value.trim().length === 0
            ? kept
            : [...kept, { name: key, updatedAt: new Date().toISOString() }]
                .sort((a, b) => a.name.localeCompare(b.name));
        return this.keys.map(one => ({ ...one }));
    }

    async getExternalContent(signal: AbortSignal): Promise<ExternalContent> {
        await this.settle(signal);
        return { enabled: this.instance.read().externalJudgingEnabled, hosts: [...this.hosts] };
    }

    async setExternalContentHosts(hosts: string[], signal: AbortSignal): Promise<ExternalContent> {
        await this.settle(signal);
        // Tidied the way the Server tidies it, and no further: blanks dropped,
        // whitespace trimmed, the same host named twice collapsed. A fake that
        // is tidier than the real thing hides a screen's rough edges.
        const seen = new Set<string>();
        this.hosts = hosts
            .map(host => host.trim())
            .filter(host => host.length > 0)
            .filter(host => {
                const key = host.toLowerCase();
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
        return { enabled: this.instance.read().externalJudgingEnabled, hosts: [...this.hosts] };
    }

    async updateInstanceSettings(input: InstanceSettingsInput, signal: AbortSignal): Promise<InstanceInfo> {
        await this.settle(signal);
        return this.announceInstance(this.instance.settings(input));
    }

    async setInstanceLogo(input: InstanceLogoInput, signal: AbortSignal): Promise<InstanceInfo> {
        await this.settle(signal);
        if (input.fileId !== undefined && !this.files.has(input.fileId)) {
            invalid("That file is not stored", "file.missing");
        }
        return this.announceInstance(this.instance.logo(input.fileId, input.language));
    }

    async publishInstanceDocument(
        kind: InstanceDocumentKind,
        statements: NewStatement[],
        signal: AbortSignal,
    ): Promise<InstanceInfo> {
        await this.settle(signal);
        for (const statement of statements) {
            if (!this.files.has(statement.fileId)) invalid("That file is not stored", "file.missing");
        }
        return this.announceInstance(this.instance.publish(kind, statements));
    }

    async unpublishInstanceDocument(kind: InstanceDocumentKind, signal: AbortSignal): Promise<InstanceInfo> {
        await this.settle(signal);
        return this.announceInstance(this.instance.unpublish(kind));
    }

    async getInstanceDocumentHistory(kind: InstanceDocumentKind, signal: AbortSignal): Promise<InstanceDocumentRef[]> {
        await this.settle(signal);
        return copy(this.instance.historyOf(kind));
    }

    /**
     * Every writer answers with the whole thing and says so to every listener:
     * the shell, the footer and the front page all read one `InstanceInfo`, and
     * a screen that published something should not have to reload to see it.
     */
    private announceInstance(instance: InstanceInfo): InstanceInfo {
        this.eventDispatcher.dispatchEvent({ type: "instanceChanged", data: { instance: copy(instance) } });
        return copy(instance);
    }

    async getPermissionCatalogue(signal: AbortSignal): Promise<PermissionDefinition[]> {
        await this.settle(signal);
        return copy(PERMISSION_CATALOGUE);
    }

    /**
     * What the signed-in user holds in one scope.
     *
     * Answered for whoever is signed in rather than for a fixed account: a
     * screen that hides what somebody may not do can only be trusted if the
     * fake can be somebody else. `amy` is the manager the fixtures are written
     * around and holds the wide-but-not-unlimited system set; an administrator
     * holds the catalogue by definition; everyone else holds what they were
     * granted and nothing more.
     */
    async getMyPermissions(activityId: string | undefined, signal: AbortSignal): Promise<string[]> {
        await this.settle(signal);
        const me = signedInUserId() ?? ME;
        const own = this.access.grants.find(g => g.userId === me && g.activityId === activityId);
        const system = this.systemPermissions(me);
        // Scoped to an activity, what counts is the grant held **there** — a
        // manager of one course does not manage another. An administrator is the
        // exception, and not a special case so much as what the permission
        // means: `system:administrator` is held everywhere, so scoping it to a
        // grant they were never given would tell them they may do nothing in
        // the very activities they administer.
        const inherited = activityId === undefined
            || this.access.grants.some(g => g.userId === me && g.activityId === undefined
                && g.permissions.includes("system:administrator"))
            ? system
            : [];
        return copy([...inherited, ...(own?.permissions ?? [])]);
    }

    async getMyAccess(signal: AbortSignal): Promise<string[]> {
        await this.settle(signal);
        const me = signedInUserId() ?? ME;
        // Everywhere, unioned: the question a menu asks. A manager of one
        // activity and nothing else still needs the panel that activity is in.
        const everywhere = this.access.grants
            .filter(g => g.userId === me)
            .flatMap(g => g.permissions);
        return copy([...new Set([...this.systemPermissions(me), ...everywhere])]);
    }

    /** What a user holds at system scope. The rule is `FakeAccess`'s, and shared. */
    private systemPermissions(userId: string): string[] {
        return this.access.systemPermissions(userId);
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
            conflict("A built-in template cannot be deleted");
        }
        this.templates = this.templates.filter(t => t.id !== id);
        this.eventDispatcher.dispatchEvent({ type: "permissionTemplateChanged", data: { deletedId: id } });
    }

    async getGrants(filter: GrantFilter, signal: AbortSignal): Promise<Page<Grant>> {
        await this.settle(signal);
        const matched = this.access.grants.filter(g =>
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
                forbidden(`Cannot grant permissions you do not hold: ${excess.join(", ")}`, "grant.excess");
            }
        }

        // Settled here rather than taken from the caller, as the Server must
        // settle it: a staff grant is systemic whatever the request said, and a
        // flag only the screen maintained would be whatever the next caller
        // felt like sending.
        const isSystem = systemicByDefault(input.permissions, PERMISSION_CATALOGUE, input.isSystem);

        // **The manual contribution, and only that one.** A managed one belongs
        // to its provider's mapping and is rewritten at every sign-in, so an
        // edit here would last until that person next signed in — which is why
        // the Server refuses it and why this looks the same way it does.
        const existing = this.access.grants.find(g =>
            g.userId === input.userId
            && g.activityId === input.activityId
            && g.source === "manual");

        // Only ever set on an activity grant: at system scope there is nothing
        // to override.
        const overrideSystem = input.activityId !== undefined && input.overrideSystem === true;

        const grant: Grant = existing
            ? {
                ...existing,
                ...input,
                isSystem,
                overrideSystem,
                permissions: [...input.permissions],
            }
            : {
                id: newId(),
                userName: MANAGED_USERS.find(u => u.id === input.userId)?.name ?? input.userId,
                userLogin: MANAGED_USERS.find(u => u.id === input.userId)?.username ?? input.userId,
                activityName: MANAGED_ACTIVITIES.find(a => a.id === input.activityId)?.name,
                state: "active",
                createdAt: new Date().toISOString(),
                ...input,
                source: "manual",
                managed: false,
                overrideSystem,
                isSystem,
                permissions: [...input.permissions],
            };
        this.access.grants = existing
            ? this.access.grants.map(g => g.id === grant.id ? grant : g)
            : [...this.access.grants, grant];
        this.eventDispatcher.dispatchEvent({ type: "grantChanged", data: { grant: copy(grant) } });
        return copy(grant);
    }

    async revokeGrant(id: string, signal: AbortSignal): Promise<void> {
        await this.settle(signal);
        this.access.grants = this.access.grants.filter(g => g.id !== id);
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
            documents: [],
            seriesCount: 0,
            problemCount: 0,
            participantCount: 0,
        };
        this.activities = [{ activity, series: [] }, ...this.activities];
        this.shared.setEnrolment(activity.id, input.joinPolicy, input.joinPassword, input.unlisted);
        return this.announceActivity(activity);
    }

    async updateActivity(id: string, input: ActivityInput, signal: AbortSignal): Promise<ManagedActivity> {
        await this.settle(signal);
        const record = this.findActivity(id);
        this.assertActivitySlugFree(input.slug, record.activity.id);
        Object.assign(record.activity, input);
        // The enrolment settings belong to the shared store, because the
        // participant side decides what to show from them — and so does
        // everything else about the activity a participant can see.
        this.shared.setEnrolment(record.activity.id, input.joinPolicy, input.joinPassword, input.unlisted);
        this.shared.setSettings(record.activity.id, {
            hideEndedSeriesProblems: input.hideEndedSeriesProblems,
            scoreVisibility: input.scoreVisibility,
            attachmentVisibility: input.attachmentVisibility,
            props: input.props,
        });
        return this.announceActivity(record.activity);
    }

    async publishActivityDocument(
        activityId: string,
        kind: ActivityDocumentKind,
        statements: NewStatement[],
        signal: AbortSignal,
    ): Promise<ManagedActivity> {
        await this.settle(signal);
        const record = this.findActivity(activityId);
        for (const statement of statements) {
            if (!this.files.has(statement.fileId)) invalid("That file is not stored", "file.missing");
        }
        this.shared.publish(record.activity.id, kind, statements);
        return this.announceActivity(this.withCounts(record.activity));
    }

    async unpublishActivityDocument(
        activityId: string,
        kind: ActivityDocumentKind,
        signal: AbortSignal,
    ): Promise<ManagedActivity> {
        await this.settle(signal);
        const record = this.findActivity(activityId);
        this.shared.unpublish(record.activity.id, kind);
        return this.announceActivity(this.withCounts(record.activity));
    }

    async getActivityDocumentHistory(
        activityId: string,
        kind: ActivityDocumentKind,
        signal: AbortSignal,
    ): Promise<ActivityDocumentRef[]> {
        await this.settle(signal);
        return copy(this.shared.historyOf(this.findActivity(activityId).activity.id, kind));
    }

    async setActivityArchived(id: string, archived: boolean, signal: AbortSignal): Promise<ManagedActivity> {
        await this.settle(signal);
        const record = this.findActivity(id);
        record.activity.archivedAt = archived ? new Date().toISOString() : undefined;
        this.announceActivity(record.activity);
        return copy(record.activity);
    }

    async setActivityPublished(
        id: string, published: boolean, signal: AbortSignal): Promise<ManagedActivity> {
        await this.settle(signal);
        const record = this.findActivity(id);
        // Publishing twice keeps the first timestamp, like the Server: "since
        // when could people see this" has one answer.
        if (published && !record.activity.publishedAt) {
            record.activity.publishedAt = new Date().toISOString();
        } else if (!published) {
            record.activity.publishedAt = undefined;
        }
        this.announceActivity(record.activity);
        return copy(record.activity);
    }

    async duplicateActivity(
        id: string, slug: string, startsAt: string, signal: AbortSignal): Promise<ManagedActivity> {
        await this.settle(signal);
        const record = this.findActivity(id);

        const wanted = slug.trim();
        if (!wanted) invalid("A slug is required", "slug.required");
        if (this.activities.some(a => a.activity.slug.toLowerCase() === wanted.toLowerCase())) {
            conflict("An activity with that slug already exists", "activity.slug.taken");
        }

        // **The anchor is the earliest round start**, as on the Server, so the
        // screen is built against the same arithmetic rather than a guess.
        const starts = record.series
            .map(series => series.startDate)
            .filter((date): date is string => Boolean(date))
            .sort();
        const anchor = starts[0] ?? record.activity.startDate;
        const delta = anchor
            ? new Date(startsAt).getTime() - new Date(anchor).getTime()
            : 0;
        const move = (date?: string) =>
            date ? new Date(new Date(date).getTime() + delta).toISOString() : undefined;

        const made: ManagedActivity = {
            ...copy(record.activity),
            id: "activity-" + wanted,
            slug: wanted,
            startDate: move(record.activity.startDate),
            endDate: move(record.activity.endDate),
            archivedAt: undefined,
            // Nothing here is for anybody yet, which is the whole point of a copy.
            publishedAt: undefined,
        };

        this.activities.push({
            activity: made,
            series: record.series.map(series => ({
                ...copy(series),
                id: "series-" + wanted + "-" + series.slug,
                startDate: move(series.startDate),
                endDate: move(series.endDate),
                isOpen: false,
                problems: series.problems.map(problem => ({ ...copy(problem), submissionCount: 0 })),
            })),
        });

        this.announceActivity(made);
        return copy(made);
    }

    async deleteActivity(id: string, signal: AbortSignal): Promise<void> {
        await this.settle(signal);
        const record = this.findActivity(id);
        // Deleting destroys submissions people may still want to look back at,
        // so it is refused for anything that ran. Archiving is the ordinary act.
        if (record.series.some(s => s.problems.some(p => p.submissionCount > 0))) {
            conflict("This activity holds submissions. Archive it instead of deleting it.", "activity.hasSubmissions");
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
            // A round nobody has paused has hidden nothing.
            hideProblemsWhilePaused: false,
            problems: [],
            // The Server's scheduler opens it when its start passes; a series
            // created with a start already behind it is running from the moment
            // it exists.
            isOpen: input.startDate === undefined || Date.parse(input.startDate) <= Date.now(),
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
        // And the participant side, which keeps its own view of the series.
        // Editing the dates here is the ordinary way a round is moved — the
        // shift control is the hurried one — so it has to arrive there as
        // surely as a shift does.
        this.shared.announceSeries({
            activityId: record.activity.id,
            seriesId: series.id,
            change: "rescheduled",
            startDate: series.startDate,
            endDate: series.endDate,
            name: series.name,
        });
        return copy(series);
    }

    async shiftSeries(seriesId: string, minutes: number, signal: AbortSignal): Promise<ManagedSeries> {
        await this.settle(signal);
        const { record, series } = this.findSeries(seriesId);
        this.assertNotArchived(record);
        // Every instant the series holds, so a delayed round does not freeze its
        // ranking at the hour it was originally going to end.
        const moved = (at: string | undefined) => at === undefined
            ? undefined
            : new Date(Date.parse(at) + minutes * 60_000).toISOString();
        series.startDate = moved(series.startDate);
        series.endDate = moved(series.endDate);
        series.rankingFreezeAt = moved(series.rankingFreezeAt);
        series.rankingRevealAt = moved(series.rankingRevealAt);
        this.announceSeries(record, series);
        this.shared.announceSeries({
            activityId: record.activity.id,
            seriesId: series.id,
            change: "rescheduled",
            startDate: series.startDate,
            endDate: series.endDate,
        });
        return copy(series);
    }

    async pauseSeries(seriesId: string, input: PauseInput, signal: AbortSignal): Promise<ManagedSeries> {
        await this.settle(signal);
        const { record, series } = this.findSeries(seriesId);
        this.assertNotArchived(record);
        if (series.pausedAt) conflict("That series is already paused", "series.alreadyPaused");
        series.pausedAt = new Date().toISOString();
        // A pause takes no submission, so the round shuts — always, as the
        // Server's `ManagerWriteService.PauseAsync` does it. Whether the
        // statements go with it is a separate answer, given at this moment and
        // travelling as its own field.
        series.isOpen = false;
        series.hideProblemsWhilePaused = input.hideProblems === true;
        this.announceSeries(record, series);
        this.shared.announceSeries({
            activityId: record.activity.id,
            seriesId: series.id,
            change: "paused",
            pausedAt: series.pausedAt,
            isOpen: false,
            hideProblems: input.hideProblems === true,
        });
        return copy(series);
    }

    async resumeSeries(seriesId: string, input: ResumeInput, signal: AbortSignal): Promise<ManagedSeries> {
        await this.settle(signal);
        const { record, series } = this.findSeries(seriesId);
        if (!series.pausedAt) conflict("That series is not paused", "series.notPaused");
        const paused = Date.now() - Date.parse(series.pausedAt);
        series.pausedAt = undefined;
        // Given back only if asked for. The arithmetic is the Server's; this is
        // it, so the screen can be seen doing the right thing.
        if (input.extendEnd && series.endDate) {
            series.endDate = new Date(Date.parse(series.endDate) + paused).toISOString();
        }
        // A series hidden by the pause comes back, unless its end has passed.
        const ended = series.endDate !== undefined && Date.parse(series.endDate) <= Date.now();
        const started = series.startDate === undefined || Date.parse(series.startDate) <= Date.now();
        series.isOpen = started && !ended;
        series.hideProblemsWhilePaused = false;
        this.announceSeries(record, series);
        this.shared.announceSeries({
            activityId: record.activity.id,
            seriesId: series.id,
            change: "resumed",
            pausedAt: null,
            isOpen: series.isOpen,
            endDate: series.endDate,
        });
        return copy(series);
    }

    async deleteSeries(seriesId: string, signal: AbortSignal): Promise<void> {
        await this.settle(signal);
        const { record, series } = this.findSeries(seriesId);
        if (series.problems.some(p => p.submissionCount > 0)) {
            conflict("This series holds submissions and cannot be deleted", "series.hasSubmissions");
        }
        for (const assignment of series.problems) this.countAttachment(assignment.problemId, -1);
        record.series = record.series.filter(s => s.id !== seriesId).map((s, i) => ({ ...s, order: i + 1 }));
        this.recount(record);
        this.eventDispatcher.dispatchEvent({
            type: "managerSeriesChanged",
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
            conflict("An archived problem cannot be attached", "problem.archived");
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
            conflict("Something has already been submitted here. The assignment cannot be removed.", "assignment.hasSubmissions");
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
            conflict("A revoked Runner cannot be approved; it must register again", "runner.revoked");
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

    async forgetRunner(id: string, signal: AbortSignal): Promise<void> {
        await this.settle(signal);
        const runner = this.findRunner(id);
        if (runner.state !== "revoked") {
            conflict("Revoke it before forgetting it", "runner.notRevoked");
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
            invalid("Create between 1 and 500 accounts at a time");
        }
        const prefix = input.prefix.trim();
        if (!/^[a-z0-9][a-z0-9-]*$/i.test(prefix)) {
            // The prefix becomes a username, and a username someone has to type
            // in a hurry at a workstation cannot hold spaces or punctuation.
            invalid("The prefix may hold letters, digits and dashes only");
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
                this.access.grants = [...this.access.grants, {
                    id: newId(),
                    userId: user.id,
                    userName: displayName(user),
                    userLogin: user.username,
                    activityId: input.activityId,
                    activityName: MANAGED_ACTIVITIES.find(a => a.id === input.activityId)?.name,
                    permissions: [...(input.permissions ?? [])],
                    // Settled the same way as any other grant: accounts made for
                    // a class are participants, and one made with a staff set is
                    // not, whoever asked for it.
                    isSystem: systemicByDefault(input.permissions ?? [], PERMISSION_CATALOGUE, false),
                    source: "manual",
                    managed: false,
                    overrideSystem: false,
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

    async getUserSessions(userId: string, signal: AbortSignal): Promise<UserSession[]> {
        await this.settle(signal);
        // `findUser` first, so asking about somebody who does not exist is a 404
        // here exactly as it will be on the Server, rather than an empty list.
        const user = this.findUser(userId);
        return copy(createSessions(user, userId === signedInUserId()));
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
            conflict("An announcement has no question to answer", "question.isAnnouncement");
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
            conflict("Answer it before publishing it", "question.unanswered");
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
            conflict("A question cannot be deleted", "question.notAnnouncement");
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
            conflict("This attempt has already finished and cannot be cancelled", "attempt.finished");
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
            // Absent means local, as it does on the wire.
            external: input.external ?? false,
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
        const content = new Map<string, StatementRef[]>();
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
            conflict("This problem is attached to an activity. Archive it instead of deleting it.", "problem.attached");
        }
        this.library = this.library.filter(r => r.problem.id !== id);
        this.eventDispatcher.dispatchEvent({ type: "problemChanged", data: { deletedId: id } });
    }

    async getProblemVersions(problemId: string, signal: AbortSignal): Promise<ManagedProblemVersion[]> {
        await this.settle(signal);
        return copy(this.find(problemId).versions);
    }

    async getProblemContent(problemId: string, versionId: string, signal: AbortSignal): Promise<StatementRef[]> {
        await this.settle(signal);
        return copy(this.find(problemId).content.get(versionId) ?? []);
    }

    async createProblemVersion(problemId: string, input: ProblemVersionInput, signal: AbortSignal): Promise<ManagedProblemVersion> {
        await this.settle(signal);
        const record = this.find(problemId);
        if (record.problem.archivedAt) {
            conflict("An archived problem takes no new versions", "problem.archived");
        }
        const previous = record.versions[0];

        // Everything that can be refused is refused before anything is stored: a
        // publication that fails halfway would leave a version holding some of
        // what was published and none of the rest.
        const staged = input.files ?? [];
        const removed = new Set(input.removedFiles ?? []);
        // The statement files and the package are rebuilt below from what was
        // published; everything else is carried forward unless it was removed.
        // `examples.zip` is derived from the package, so a new package replaces
        // it and an unchanged one leaves it alone.
        const rebuilt = new Set([PACKAGE_ARCHIVE, ...(input.package ? [SAMPLES_ARCHIVE] : [])]);
        const carried = (previous?.files ?? []).filter(f =>
            !isStatementName(f.name) && !rebuilt.has(f.name) && !removed.has(f.name));

        // The checksums were checked where the bytes arrived, in `fileApi`. What
        // is left to refuse here is what a *version* may not hold.
        for (const entry of staged) {
            if (!this.files.has(entry.fileId)) {
                invalid(`No such file: ${entry.name}`, "file.missing");
            }
            if (isStatementName(entry.name)) {
                // `content.md` and its translations are the statement, written in
                // the editor. Attaching one here would put a second answer beside
                // the one published.
                invalid("content.* is the statement; edit it in the Statement tab");
            }
            if (isPackageFile(entry.name)) {
                // Both are derived from the package and written by publishing it.
                invalid("The package is built in the Package tab");
            }
            if (carried.some(f => f.name === entry.name)
                || staged.filter(s => s.name === entry.name).length > 1) {
                // Refused rather than replaced: a statement referring to the name
                // must not change meaning because somebody attached a new file.
                conflict(`This version already has a file called ${entry.name}`);
            }
        }
        if (input.package && !this.files.has(input.package.fileId)) {
            invalid("The package file is not stored", "file.missing");
        }
        if (input.package?.samplesFileId && !this.files.has(input.package.samplesFileId)) {
            invalid("The examples file is not stored", "file.missing");
        }

        const version: ManagedProblemVersion = {
            id: newId(),
            version: (previous?.version ?? 0) + 1,
            createdAt: new Date().toISOString(),
            createdByName: "Amy Horsefighter",
            note: input.note,
            // Absent carries the previous version's forward: a problem's
            // identity does not change because somebody fixed a typo.
            props: input.props ?? previous?.props,
            hasPackage: false,
            files: [],
        };
        // Append-only: a correction publishes a new version rather than editing
        // an old one, so a finished result stays attached to what it was judged
        // against.
        record.versions = [version, ...record.versions];
        // A version carries every language it was published with. Publishing
        // without statements keeps the previous ones, translations included —
        // which is what correcting a package and nothing else should do.
        record.content.set(version.id, input.statements === undefined
            ? (record.content.get(previous?.id ?? "") ?? [])
            // Kept as references. The bytes went up before the version was
            // published and the editor reads them back the same way, so there is
            // nowhere left that turns a statement into text in transit.
            : input.statements.map(statement => {
                const stored = this.files.meta(statement.fileId);
                return {
                    name: statement.language ? `content-${statement.language}.md` : "content.md",
                    language: statement.language,
                    fileId: statement.fileId,
                    sha256: stored.sha256,
                    sizeBytes: stored.sizeBytes,
                };
            }));

        // The package: the one published, or the previous version's carried
        // forward. A version without one is a version nothing can be judged
        // against, and that is not what fixing a typo should produce.
        let archive = input.package ? this.files.blob(input.package.fileId) : undefined;
        if (!archive && previous?.hasPackage && !removed.has(PACKAGE_ARCHIVE)) {
            // Read the way the editor reads it: a seeded version holds no bytes
            // until something asks for them.
            archive = await this.getProblemPackage(problemId, previous.id, signal);
        }
        if (archive) {
            this.packages.set(version.id, archive);
            version.hasPackage = true;
        }

        version.files = [
            // The name follows from the language rather than from what anybody
            // typed: `content.md`, `content-en.md`.
            ...(input.statements ?? []).map(statement => {
                const stored = this.files.meta(statement.fileId);
                return {
                    name: statementFileName(statement.language),
                    scope: "participant" as const,
                    mimeType: "text/markdown",
                    sizeBytes: stored.sizeBytes,
                    sha256: stored.sha256,
                };
            }),
            // Carried forward when nothing was published: the statement files of
            // the previous version, which `carried` deliberately leaves out.
            ...(input.statements === undefined
                ? (previous?.files ?? []).filter(f => isStatementName(f.name) && !removed.has(f.name))
                : []),
            ...carried,
            ...staged.map(entry => {
                // Everything but the name comes from the stored file: the
                // reference says what it is called *here*, the file says what it
                // is. The URL is the store's, so the preview shows the figure
                // rather than a promise of one.
                const stored = this.files.meta(entry.fileId);
                return {
                    name: entry.name,
                    scope: entry.scope,
                    mimeType: stored.mimeType,
                    sizeBytes: stored.sizeBytes,
                    sha256: stored.sha256,
                    url: this.files.url(entry.fileId),
                };
            }),
            ...(archive ? [{
                name: PACKAGE_ARCHIVE, scope: "runner" as const, mimeType: "application/zip",
                sizeBytes: archive.size,
                sha256: input.package ? this.files.meta(input.package.fileId).sha256 : await sha256(archive),
            }] : []),
            // The examples the participant downloads. Participant scope, so the
            // Server hands them over without the Client asking twice.
            ...(input.package?.samplesFileId ? [{
                name: SAMPLES_ARCHIVE, scope: "participant" as const, mimeType: "application/zip",
                sizeBytes: this.files.meta(input.package.samplesFileId).sizeBytes,
                sha256: this.files.meta(input.package.samplesFileId).sha256,
                url: this.files.url(input.package.samplesFileId),
            }] : []),
        ];
        record.problem.currentVersion = version.version;
        record.problem.versionCount = record.versions.length;
        this.announce(record.problem);
        return copy(version);
    }

    /**
     * Trials the fake has been asked for, by id.
     *
     * Kept rather than answered inline because a trial is **asynchronous by
     * nature**: the screen asks, then polls. A fake that answered `completed`
     * on the first call would let a broken polling loop pass.
     */
    private readonly trials = new Map<string, Trial>();

    async requestTrial(input: NewTrial, signal: AbortSignal): Promise<Trial> {
        await this.settle(signal);

        const trial: Trial = {
            id: `trial-${this.trials.size + 1}`,
            activityId: input.activityIdOrSlug,
            state: "queued",
            problemType: input.problemType,
            createdAt: new Date().toISOString(),
            hasPackage: true,
        };
        this.trials.set(trial.id, trial);
        return { ...trial };
    }

    async getTrial(trialId: string, signal: AbortSignal): Promise<Trial> {
        await this.settle(signal);

        const held = this.trials.get(trialId) ?? notFound("Trial");
        if (held.state === "queued") {
            // Settles on the second look, so a screen that asks once and stops
            // shows a trial that never finished — which is what it would do
            // against a real Runner.
            held.state = "running";
            return { ...held };
        }

        if (held.state === "running") {
            held.state = "completed";
            held.finishedAt = new Date().toISOString();
            held.hasPackage = false;
            // Two languages and two groups, so the screen has something to fold:
            // the suggestion for a group comes from the slower of them.
            held.measurement = JSON.stringify({
                measured: [
                    { group: 1, language: "cpp", timeMs: 240, memoryBytes: 31744000 },
                    { group: 1, language: "python", timeMs: 900, memoryBytes: 52428800 },
                    { group: 2, language: "cpp", timeMs: 100, memoryBytes: 20971520 },
                    { group: 2, language: "python", timeMs: 410, memoryBytes: 33554432 },
                ],
            });
        }
        return { ...held };
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
        // **A version states no configuration any more** (2026-08-22). The
        // chain decided 2026-08-04 was package, then version, then assignment;
        // the middle layer is gone, because a version wanting different limits
        // is a version with a different package — the limits are calibrated
        // against the tests it ships.
        //
        // So what a built package carries is the package's own defaults, and
        // the assignment lays its overrides on top of them at judging time.
        const defaults = emptyConfig();
        const config: PackageConfig = {
            ...defaults,
            // Group 0 is the examples, which every package has.
            groups: [
                { group: 0, points: 0, examples: true },
                { group: 1, points: 100 },
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
        return { ...user, grantCount: this.access.grants.filter(g => g.userId === user.id).length };
    }

    private announceUser(user: ManagedUser): void {
        this.eventDispatcher.dispatchEvent({
            type: "userChanged",
            data: { user: copy(this.withGrantCount(user)) },
        });
    }

    private assertUsernameFree(username: string): void {
        if (this.users.some(u => u.username.toLowerCase() === username.trim().toLowerCase())) {
            conflict("That username is taken", "account.username.taken");
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
            // Nothing has judged it, so it has attached nothing.
            files: [],
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
            // The same result as before: a rejudge against unchanged tests
            // should reproduce it, and a fake that shuffled it would teach the
            // screen to expect noise. The attachments are the same files —
            // identical bytes, so identical ids; nothing is copied.
            attempt.files = previous?.files ?? [];
            submission.state = "completed";
            submission.verdict = previous?.state === "completed" ? submission.verdict : undefined;
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
        if (record.activity.archivedAt) conflict("An archived activity accepts no changes", "activity.archived");
    }

    private assertActivitySlugFree(slug: string, exceptId?: string): void {
        if (this.activities.some(r => r.activity.slug.toLowerCase() === slug.trim().toLowerCase() && r.activity.id !== exceptId)) {
            conflict("An activity with that slug already exists", "activity.slug.taken");
        }
    }

    private assertSeriesSlugFree(record: ActivityRecord, slug: string, exceptId?: string): void {
        if (record.series.some(s => s.slug.toLowerCase() === slug.trim().toLowerCase() && s.id !== exceptId)) {
            conflict("A series with that slug already exists in this activity", "series.slug.taken");
        }
    }

    /** Unique across the **whole activity**, not merely within one series. */
    private assertAssignmentSlugFree(record: ActivityRecord, slug: string, exceptId?: string): void {
        const taken = record.series
            .flatMap(s => s.problems)
            .some(p => p.slug.toLowerCase() === slug.trim().toLowerCase() && p.id !== exceptId);
        if (taken) conflict("That problem slug is already used in this activity", "assignment.slug.taken");
    }

    /** Membership is the grants, so the count is read from them, never stored. */
    /**
     * The activity as it leaves the fake.
     *
     * The counts come from the grants, because a grant in an activity **is** the
     * membership and a second number could disagree with it. The documents and
     * the enrolment settings come from the shared store, because the participant
     * side serves them from there — one owner, or the manager screen and the
     * activity page would drift apart.
     */
    private withCounts(activity: ManagedActivity): ManagedActivity {
        const enrolment = this.shared.enrolmentOf(activity.id);
        return {
            ...activity,
            // Whoever runs the activity is not competing in it, so the number
            // beside "Participants" is the number of people actually taking part.
            participantCount: this.access.grants
                .filter(g => g.activityId === activity.id && !g.isSystem).length,
            documents: this.shared.documentsOf(activity.id),
            joinPolicy: enrolment.policy,
            unlisted: enrolment.unlisted,
            joinPassword: enrolment.password,
        };
    }

    private announceActivity(activity: ManagedActivity): ManagedActivity {
        const dressed = this.withCounts(activity);
        this.eventDispatcher.dispatchEvent({
            type: "activityChanged",
            data: { activity: copy(dressed) },
        });
        return copy(dressed);
    }

    private announceSeries(record: ActivityRecord, series: ManagedSeries): void {
        this.eventDispatcher.dispatchEvent({
            type: "managerSeriesChanged",
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
            conflict("A problem with that slug already exists", "problem.slug.taken");
        }
    }

    private assertNameFree(name: string, exceptId?: string): void {
        if (this.templates.some(t => t.name.toLowerCase() === name.trim().toLowerCase() && t.id !== exceptId)) {
            conflict(`A template named "${name}" already exists`);
        }
    }

    // ── Identity providers ───────────────────────────────────────────────────

    async getIdentityProviders(signal: AbortSignal): Promise<IdentityProvider[]> {
        await this.settle(signal);
        await this.requireAsync("provider:manage", signal);
        return this.providers.map(copy);
    }

    async createIdentityProvider(
        input: IdentityProviderInput, signal: AbortSignal,
    ): Promise<IdentityProvider> {
        await this.settle(signal);
        await this.requireAsync("provider:manage", signal);

        // Required once and preserved afterwards. A provider registered without
        // one sits in the list looking configured and fails at the only moment
        // that matters.
        if (!input.clientSecret?.trim()) {
            invalid("A client secret is required", "provider.clientSecret.required");
        }
        if (this.providers.some(p => p.slug === input.slug.trim().toLowerCase())) {
            conflict(`A provider with the slug "${input.slug}" already exists`, "provider.slug.taken");
        }
        await this.assertMappableAsync(input, signal);

        const provider: IdentityProvider = {
            ...this.settingsOf(input),
            id: newId(),
            hasClientSecret: true,
            hasDeletionSecret: Boolean(input.deletionSecret?.trim()),
            callbackPath: `/api/v1/identity/providers/${input.slug.trim().toLowerCase()}/callback`,
            linkedAccounts: 0,
            createdAt: new Date().toISOString(),
        };

        this.providers = [...this.providers, provider];
        return copy(provider);
    }

    async updateIdentityProvider(
        id: string, input: IdentityProviderInput, signal: AbortSignal,
    ): Promise<IdentityProvider> {
        await this.settle(signal);
        await this.requireAsync("provider:manage", signal);

        const existing = this.providers.find(p => p.id === id);
        if (!existing) notFound("Identity provider");
        if (this.providers.some(p => p.id !== id && p.slug === input.slug.trim().toLowerCase())) {
            conflict(`A provider with the slug "${input.slug}" already exists`, "provider.slug.taken");
        }
        await this.assertMappableAsync(input, signal);

        const updated: IdentityProvider = {
            ...existing,
            ...this.settingsOf(input),
            id: existing.id,
            // **Absent means "leave the stored one alone".** The panel is never
            // given a secret, so it cannot send one back — and treating a blank
            // field as "clear it" would unconfigure a working provider on every
            // save.
            hasClientSecret: existing.hasClientSecret || Boolean(input.clientSecret?.trim()),
            hasDeletionSecret: existing.hasDeletionSecret || Boolean(input.deletionSecret?.trim()),
            callbackPath: `/api/v1/identity/providers/${input.slug.trim().toLowerCase()}/callback`,
            linkedAccounts: existing.linkedAccounts,
            createdAt: existing.createdAt,
        };

        if (updated.deletionChannelEnabled && !updated.hasDeletionSecret) {
            // An open back channel with no secret is an endpoint anybody may
            // post an account deletion to.
            invalid(
                "The deletion channel needs a secret before it can be enabled",
                "provider.deletionSecret.required");
        }

        this.providers = this.providers.map(p => p.id === id ? updated : p);
        return copy(updated);
    }

    async deleteIdentityProvider(id: string, signal: AbortSignal): Promise<void> {
        await this.settle(signal);
        await this.requireAsync("provider:manage", signal);

        const provider = this.providers.find(p => p.id === id);
        if (!provider) notFound("Identity provider");

        // Refused rather than cascaded: removing a provider people sign in
        // through decides something about their accounts, and that is not a side
        // effect a delete button should have. Disabling is the reversible act.
        if (provider.linkedAccounts > 0) {
            conflict(
                `${provider.linkedAccounts} account(s) sign in through "${provider.slug}". `
                    + "Disable it instead, or remove the links first",
                "provider.linked");
        }

        this.providers = this.providers.filter(p => p.id !== id);
    }

    async getDeletionRequests(
        filter: DeletionRequestFilter, signal: AbortSignal,
    ): Promise<Page<DeletionRequest>> {
        await this.settle(signal);
        await this.requireAsync("user:update", signal);

        const matching = this.deletionRequests.filter(r =>
            filter.state === undefined
            || (filter.state === "open"
                ? r.state === "pending" || r.state === "attention"
                : r.state === filter.state));

        return copy(paginate(matching, filter.page, filter.pageSize));
    }

    async haltDeletionRequest(id: string, signal: AbortSignal): Promise<DeletionRequest> {
        await this.settle(signal);
        await this.requireAsync("user:update", signal);

        const request = this.deletionRequests.find(r => r.id === id);
        if (!request) notFound("Deletion request");

        // A window that has closed cannot be reopened: what it was holding has
        // already happened, and an undo that does not exist should not be
        // offered.
        if (request.state !== "pending") {
            conflict("This request is no longer waiting and cannot be stopped", "deletion.notPending");
        }

        const halted: DeletionRequest = {
            ...request,
            state: "halted",
            resolvedAt: new Date().toISOString(),
        };
        this.deletionRequests = this.deletionRequests.map(r => r.id === id ? halted : r);
        return copy(halted);
    }

    /** Everything an input carries that is not a secret and not derived. */
    private settingsOf(input: IdentityProviderInput) {
        return {
            slug: input.slug.trim().toLowerCase(),
            displayName: input.displayName.trim(),
            issuer: input.issuer.trim().replace(/\/$/, ""),
            clientId: input.clientId.trim(),
            scopes: input.scopes?.trim() || "openid profile email",
            enabled: input.enabled,
            accountUrl: input.accountUrl?.trim() || undefined,
            deletionUrl: input.deletionUrl?.trim() || undefined,
            claimPath: input.claimPath?.trim() || "groups",
            unmappedBehavior: input.unmappedBehavior ?? "deny",
            defaultTemplateName: input.unmappedBehavior === "defaultTemplate"
                ? input.defaultTemplateName
                : undefined,
            deletionChannelEnabled: input.deletionChannelEnabled,
            mappingRules: [...(input.mappingRules ?? [])],
        };
    }

    /**
     * The two guards, together, because neither is safe without the other.
     *
     * A mapping decides what an external directory's groups buy here, so the
     * fake refuses exactly what the Server refuses: `system:administrator` is
     * unreachable through a mapping in every configuration, and nobody may map
     * onto a permission they do not themselves hold.
     */
    private async assertMappableAsync(
        input: IdentityProviderInput, signal: AbortSignal,
    ): Promise<void> {
        const seen = new Set<string>();
        const named = [
            ...(input.mappingRules ?? []).map(r => r.templateName),
            ...(input.unmappedBehavior === "defaultTemplate" && input.defaultTemplateName
                ? [input.defaultTemplateName]
                : []),
        ];

        for (const rule of input.mappingRules ?? []) {
            if (seen.has(rule.claimValue)) {
                // Two rules for one value is a question about ordering, and this
                // model deliberately has no answer to it.
                invalid(`The claim value "${rule.claimValue}" is mapped twice`, "provider.rule.duplicate");
            }
            seen.add(rule.claimValue);
        }

        const mine = await this.getMyPermissions(undefined, signal);
        for (const name of named) {
            const template = this.templates.find(t => t.name === name);
            if (!template) {
                invalid(`No template named "${name}"`, "provider.rule.template.unknown");
            }
            if (template.permissions.includes("system:administrator")) {
                forbidden(
                    `"${name}" grants system:administrator, which no claim may ever grant`,
                    "provider.rule.administrator");
            }
            if (!mine.includes("system:administrator")) {
                const excess = template.permissions.filter(p => !mine.includes(p));
                if (excess.length > 0) {
                    forbidden(
                        `Cannot map onto permissions you do not hold: ${excess.join(", ")}`,
                        "provider.rule.excess");
                }
            }
        }
    }

    /**
     * Refuses the way the Server refuses: a permission this caller does not
     * hold is a 403, not an empty list. A fake that answered `[]` would let a
     * screen look right against it and be wrong against the Server.
     */
    private async requireAsync(permission: string, signal: AbortSignal): Promise<void> {
        const mine = await this.getMyPermissions(undefined, signal);
        if (!mine.includes("system:administrator") && !mine.includes(permission)) {
            forbidden(`Access denied: ${permission} is required`, "forbidden");
        }
    }

    private async settle(signal: AbortSignal): Promise<void> {
        await Utils.sleep(this.sleepMs);
        signal.throwIfAborted();
    }
}
