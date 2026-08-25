import { ScopedApi } from "../api/ScopedApi";
import { NewProblemFile, NewStatement, SeriesInput } from "../api/ManagerApi";
import { PACKAGE_ARCHIVE, SAMPLES_ARCHIVE } from "../package/types";
import { sha256 } from "../utils/sha256";
import { BundleContents } from "./bundle";
import { anchorOf, shiftTo } from "./dates";
import { ImportPlan } from "./plan";
import { BundledProblem, isStatement, statementLanguage } from "./types";
import { Progress } from "./collect";

/**
 * Writing a bundle into this installation.
 *
 * **Every call here is an endpoint that already exists**, in the order the
 * manager's own screens use — the problem, its statement, the version that
 * names it, then the activity, its rounds and their assignments. So an import
 * is authorised exactly as the equivalent hand-work would be, and needs no
 * permission of its own.
 *
 * A failure part way leaves a draft rather than a live activity: the same
 * property the UVa import relies on, and the reason the order is what it is.
 */

export interface ImportChoice {
    /** The new activity's slug here. Unused by a problem-only bundle. */
    activitySlug: string;
    /** When the first round begins. Everything dated moves with it. */
    startsAt: string;
    plan: ImportPlan;
}

export interface ImportOutcome {
    activitySlug?: string;
    created: string[];
    reused: string[];
    series: number;
    assignments: number;
}

/**
 * The bytes, uploaded once each, and checked before they are.
 *
 * **The digest is recomputed rather than believed.** The manifest states one
 * and the Server recomputes its own; without this step a corrupted archive is
 * refused by the Server with no idea which file it was, and a *tampered* one
 * whose manifest was edited to match would be stored happily. Checking here
 * names the file and costs one pass over bytes already in memory.
 */
const uploadAll = async (
    api: ScopedApi, contents: BundleContents, report?: Progress,
): Promise<Map<string, string>> => {
    const ids = new Map<string, string>();
    const named = new Map<string, string>();
    for (const problem of contents.bundle.problems) {
        for (const file of problem.files) named.set(file.sha256, file.name);
    }
    for (const document of contents.bundle.activity?.documents ?? []) {
        named.set(document.sha256, `${document.kind}${document.language ? `-${document.language}` : ""}.md`);
    }

    let done = 0;
    for (const [declared, bytes] of contents.files) {
        const name = named.get(declared);
        // A file nothing in the manifest names is not uploaded: it is weight the
        // archive carries and nothing would ever reach.
        if (!name) continue;

        const actual = await sha256(bytes);
        if (actual !== declared) {
            throw new Error(`${name} does not match its checksum — the archive is damaged`);
        }

        report?.(++done, named.size, name);
        const stored = await api.fileApi.upload(new Blob([bytes as BlobPart]), name, declared);
        ids.set(declared, stored.id);
    }

    return ids;
};

/** A version's files, split the three ways `createProblemVersion` takes them. */
const partition = (problem: BundledProblem, ids: Map<string, string>) => {
    const statements: NewStatement[] = [];
    const files: NewProblemFile[] = [];
    let packageFileId: string | undefined;
    let samplesFileId: string | undefined;

    for (const file of problem.files) {
        const fileId = ids.get(file.sha256);
        if (!fileId) throw new Error(`${problem.slug}: ${file.name} was not stored`);

        if (file.name === PACKAGE_ARCHIVE) packageFileId = fileId;
        else if (file.name === SAMPLES_ARCHIVE) samplesFileId = fileId;
        else if (isStatement(file.name)) {
            const language = statementLanguage(file.name);
            statements.push({ fileId, language: language === false ? undefined : language });
        } else files.push({ fileId, name: file.name, scope: file.scope });
    }

    return { statements, files, packageFileId, samplesFileId };
};

export const applyBundle = async (
    api: ScopedApi, contents: BundleContents, choice: ImportChoice, report?: Progress,
): Promise<ImportOutcome> => {
    const { bundle } = contents;
    const ids = await uploadAll(api, contents, report);

    const outcome: ImportOutcome = { created: [], reused: [], series: 0, assignments: 0 };
    /** The bundle's slug to the problem id it means here. */
    const resolved = new Map<string, string>();

    for (const plan of choice.plan.problems) {
        const problem = bundle.problems.find(p => p.slug === plan.slug);
        if (!problem) continue;

        if (plan.action === "reuse") {
            if (!plan.found) throw new Error(`${plan.slug} was to be reused and nothing was found`);
            resolved.set(problem.slug, plan.found.id);
            outcome.reused.push(plan.slug);
            continue;
        }

        const slug = plan.action === "beside" ? (plan.besideSlug ?? plan.slug) : plan.slug;
        const created = await api.managerApi.createProblem({
            slug,
            name: problem.name,
            type: problem.type,
            // Permanent, and set once: a problem judged elsewhere stays judged
            // elsewhere, and dropping it would make the Server believe it is
            // local and hand it to a Runner that cannot take it.
            external: problem.external,
        });

        const { statements, files, packageFileId, samplesFileId } = partition(problem, ids);
        await api.managerApi.createProblemVersion(created.id, {
            note: problem.note ?? `Imported from ${bundle.source?.instance ?? "another installation"}`,
            props: problem.props,
            statements,
            files,
            package: packageFileId ? { fileId: packageFileId, samplesFileId } : undefined,
        });

        // **Private, whatever it was where it came from**, and deliberately
        // unlike the UVa import, which publishes to the whole installation. A
        // UVa problem is already public in its archive; a bundle may hold next
        // week's examination, and a visibility nobody chose is a disclosure
        // nobody asked for. One click shares it.
        resolved.set(problem.slug, created.id);
        outcome.created.push(slug);
    }

    if (!bundle.activity) return outcome;

    const zone = bundle.activity.timeZone;
    const shift = shiftTo(
        anchorOf(bundle.activity.series.map(s => s.startDate), bundle.activity.startDate),
        choice.startsAt, zone);

    const activity = await api.managerApi.createActivity({
        slug: choice.activitySlug,
        name: bundle.activity.name,
        type: bundle.activity.type,
        rankingType: bundle.activity.rankingType,
        timeZone: zone,
        startDate: shift(bundle.activity.startDate),
        endDate: shift(bundle.activity.endDate),
        modules: bundle.activity.modules,
        scoreVisibility: bundle.activity.scoreVisibility,
        attachmentVisibility: bundle.activity.attachmentVisibility,
        props: bundle.activity.props,
        joinPolicy: bundle.activity.joinPolicy,
        unlisted: bundle.activity.unlisted,
        // **Never the password**, which everybody who took the original knows.
        hideEndedSeriesProblems: bundle.activity.hideEndedSeriesProblems,
        maxUploadBytes: bundle.activity.maxUploadBytes,
        maxAttachments: bundle.activity.maxAttachments,
        maxSubmissionsPerProblem: bundle.activity.maxSubmissionsPerProblem,
        runnerTags: bundle.activity.runnerTags,
    });
    outcome.activitySlug = activity.slug;

    const kinds = new Set(bundle.activity.documents.map(d => d.kind));
    for (const kind of kinds) {
        const statements = bundle.activity.documents
            .filter(d => d.kind === kind)
            .map(d => ({ language: d.language, fileId: ids.get(d.sha256) ?? "" }))
            .filter(s => s.fileId);
        if (statements.length > 0) {
            await api.managerApi.publishActivityDocument(activity.id, kind, statements);
        }
    }

    for (const series of [...bundle.activity.series].sort((a, b) => a.order - b.order)) {
        const input: SeriesInput = {
            slug: series.slug,
            name: series.name,
            startDate: shift(series.startDate),
            endDate: shift(series.endDate),
            revealProblemCount: series.revealProblemCount,
            rankingFreezeAt: shift(series.rankingFreezeAt),
            rankingRevealAt: shift(series.rankingRevealAt),
            rankingVisibleFrom: shift(series.rankingVisibleFrom),
            rankingVisibleTo: shift(series.rankingVisibleTo),
            importance: series.importance,
            importanceScope: series.importanceScope,
            addressRules: series.addressRules,
            restrictionsEnabled: series.restrictionsEnabled,
            runnerTags: series.runnerTags,
        };

        const made = await api.managerApi.createSeries(activity.id, input);
        outcome.series += 1;

        for (const assignment of [...series.assignments].sort((a, b) => a.order - b.order)) {
            const problemId = resolved.get(assignment.problemSlug);
            // An assignment naming a problem the bundle does not carry is
            // reported by the plan and skipped here rather than failing the
            // whole import half way through it.
            if (!problemId) continue;

            await api.managerApi.attachProblem(made.id, {
                problemId,
                slug: assignment.slug,
                name: assignment.name,
                // **No pin.** A version id is this installation's, and the
                // bundle carries one version — so the Server pins to the version
                // just published, which is the one that arrived.
                config: assignment.config,
                spec: assignment.spec,
                props: assignment.props,
                maxPoints: assignment.maxPoints,
                maxUploadBytes: assignment.maxUploadBytes,
                maxAttachments: assignment.maxAttachments,
                maxSubmissions: assignment.maxSubmissions,
            });
            outcome.assignments += 1;
        }
    }

    return outcome;
};
