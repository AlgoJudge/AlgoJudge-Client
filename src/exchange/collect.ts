import { ScopedApi } from "../api/ScopedApi";
import { ManagedProblem, ManagedProblemVersion, ManagedSeries } from "../api/ManagerApi";
import { ACTIVITY_DOCUMENT_KINDS } from "../api/activityDocuments";
import { BundleContents } from "./bundle";
import { Bundle, BUNDLE_TYPE, BundledDocument, BundledProblem } from "./types";
import { projectActivity, projectProblem, projectSeries } from "./project";
import { sha256 } from "../utils/sha256";

/**
 * Reading an activity, a round or a problem out of this installation.
 *
 * Everything here goes through the ordinary manager API, which is the point:
 * an export reads what its caller may already read, and needs no endpoint and
 * no permission of its own.
 */

export interface Progress {
    (done: number, total: number, what: string): void;
}

/**
 * The bytes behind a version file, and a check that they are its bytes.
 *
 * **This used to fetch an address the DTO published**, because a version's file
 * list carried one and no id. That was a bare `fetch` outside the API client,
 * and where the application was served from a different origin than the API it
 * reached the application: the single-page shell came back as `200 text/html`,
 * `response.ok` was true, and the export bundled the shell as the file's bytes.
 * The archive then failed at somebody else's **import**, blamed for a checksum
 * it never had a chance to match.
 *
 * A version's file list carries `fileId` now, so this is an ordinary read
 * through `fileApi` like every other, and the checksum is compared **here** —
 * where a wrong byte can still be named after the file it belongs to.
 */
const bytesOf = async (
    api: ScopedApi, file: { name: string; fileId: string; sha256: string },
): Promise<Uint8Array> => {
    const bytes = new Uint8Array(await (await api.fileApi.getBlob(file.fileId)).arrayBuffer());
    const actual = await sha256(bytes);
    if (actual !== file.sha256) {
        throw new Error(
            `${file.name} came back as ${actual.slice(0, 12)}… where the version says `
            + `${file.sha256.slice(0, 12)}… — the bytes behind ${file.fileId} are not this file's`);
    }
    return bytes;
};

const newest = (versions: ManagedProblemVersion[]): ManagedProblemVersion | undefined =>
    [...versions].sort((a, b) => b.version - a.version)[0];

const empty = (kind: Bundle["kind"]): Bundle => ({
    type: BUNDLE_TYPE,
    exportedAt: new Date().toISOString(),
    kind,
    problems: [],
});

/**
 * One problem at its newest version, with every byte it holds.
 *
 * **A problem with no version is refused rather than exported empty.** It is a
 * draft — the library shows it as one — and a bundle carrying a problem with no
 * statement would import a round nobody can attempt.
 */
const collectProblem = async (
    api: ScopedApi, problem: ManagedProblem, files: Map<string, Uint8Array>, report?: Progress,
): Promise<BundledProblem> => {
    const versions = await api.managerApi.getProblemVersions(problem.id);
    const version = newest(versions);
    if (!version) throw new Error(`${problem.slug} has no published version`);

    const bundled = projectProblem(problem, version);

    for (const file of version.files) {
        // Content-addressed, so a figure two problems share is fetched once.
        if (files.has(file.sha256)) continue;
        if (!file.fileId) throw new Error(`${problem.slug}: ${file.name} has not been stored`);

        report?.(files.size, 0, `${problem.slug} / ${file.name}`);
        files.set(file.sha256, await bytesOf(api, { ...file, fileId: file.fileId }));
    }

    return bundled;
};

const collectProblems = async (
    api: ScopedApi, ids: string[], files: Map<string, Uint8Array>, report?: Progress,
): Promise<BundledProblem[]> => {
    const bundled: BundledProblem[] = [];
    for (const id of ids) {
        const problem = await api.managerApi.getProblem(id);
        bundled.push(await collectProblem(api, problem, files, report));
    }
    return bundled;
};

/**
 * Every document the activity publishes, newest revision per language.
 *
 * Carried because a course's rules page is part of its shape. §7 left one
 * lesson above the others: what a copy drops silently is what nobody finds out
 * about until it matters.
 */
const collectDocuments = async (
    api: ScopedApi, activityId: string, files: Map<string, Uint8Array>,
): Promise<BundledDocument[]> => {
    const documents: BundledDocument[] = [];

    for (const kind of ACTIVITY_DOCUMENT_KINDS) {
        const history = await api.managerApi.getActivityDocumentHistory(activityId, kind);
        // The history is every revision; only what is in force travels. Newest
        // first, per the API, so the first of each language is the live one.
        const seen = new Set<string>();
        for (const ref of history) {
            const key = ref.language ?? "";
            if (seen.has(key)) continue;
            seen.add(key);

            documents.push({ kind, language: ref.language, title: ref.title, sha256: ref.sha256 });
            if (!files.has(ref.sha256)) {
                const blob = await api.fileApi.getBlob(ref.fileId);
                files.set(ref.sha256, new Uint8Array(await blob.arrayBuffer()));
            }
        }
    }

    return documents;
};

export const collectActivity = async (
    api: ScopedApi, idOrSlug: string, report?: Progress,
): Promise<BundleContents> => {
    const activity = await api.managerApi.getActivity(idOrSlug);
    const series = await api.managerApi.getSeries(activity.id);
    return await assemble(api, activity, series, "activity", report);
};

export const collectSeries = async (
    api: ScopedApi, activityIdOrSlug: string, seriesId: string, report?: Progress,
): Promise<BundleContents> => {
    const activity = await api.managerApi.getActivity(activityIdOrSlug);
    const all = await api.managerApi.getSeries(activity.id);
    const one = all.find(s => s.id === seriesId);
    if (!one) throw new Error("That round is not in this activity");
    return await assemble(api, activity, [one], "series", report);
};

export const collectProblemOnly = async (
    api: ScopedApi, problemId: string, report?: Progress,
): Promise<BundleContents> => {
    const files = new Map<string, Uint8Array>();
    const bundle = empty("problem");
    bundle.problems = await collectProblems(api, [problemId], files, report);
    bundle.source = { instance: location.host };
    return { bundle, files };
};

const assemble = async (
    api: ScopedApi,
    activity: Awaited<ReturnType<ScopedApi["managerApi"]["getActivity"]>>,
    series: ManagedSeries[],
    kind: "activity" | "series",
    report?: Progress,
): Promise<BundleContents> => {
    const files = new Map<string, Uint8Array>();
    const bundle = empty(kind);

    // **Stated once even where two rounds set the same problem.** The
    // assignments name it by slug, so one entry serves both.
    const ids = [...new Set(series.flatMap(s => s.problems.map(p => p.problemId)))];
    bundle.problems = await collectProblems(api, ids, files, report);

    const slugOf = new Map<string, string>();
    for (const s of series) {
        for (const assignment of s.problems) slugOf.set(assignment.problemId, assignment.problemSlug);
    }

    bundle.activity = projectActivity(
        activity,
        kind === "activity" ? await collectDocuments(api, activity.id, files) : [],
        [...series].sort((a, b) => a.order - b.order).map(s => projectSeries(s, slugOf)));

    bundle.source = { instance: location.host, activity: activity.slug };
    return { bundle, files };
};
