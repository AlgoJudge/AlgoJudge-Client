import { ScopedApi } from "../api/ScopedApi";
import { ManagedProblem, ManagedProblemVersion, ManagedSeries } from "../api/ManagerApi";
import { ACTIVITY_DOCUMENT_KINDS } from "../api/activityDocuments";
import { BundleContents } from "./bundle";
import { Bundle, BUNDLE_TYPE, BundledDocument, BundledProblem } from "./types";
import { projectActivity, projectProblem, projectSeries } from "./project";

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
 * The bytes behind a version file's address.
 *
 * **A version's file list publishes an address and no id** — `ProblemFileDto`
 * has `Url` and nothing else to reach the bytes with — so this is the one read
 * in the export that cannot go through `fileApi`. It fetches the address the
 * API handed it, which is what an `<img src>` does with the same value.
 *
 * Deriving an id from the address was tried and rejected: it holds for the
 * Server (`…/files/{id}`, `FILE_API.md`) and not for the fake, whose addresses
 * are object URLs — so the export would have worked in production and against
 * nothing the browser checks can drive. Fetching the address works for both.
 *
 * The alternative was a field on the Server's DTO, and §8 is deliberately a
 * Client-only change.
 */
const bytesAt = async (url: string): Promise<Uint8Array> => {
    const response = await fetch(url, { credentials: "include" });
    if (!response.ok) throw new Error(`${url} answered ${response.status}`);
    return new Uint8Array(await response.arrayBuffer());
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
        if (!file.url) throw new Error(`${problem.slug}: ${file.name} has not been stored`);

        report?.(files.size, 0, `${problem.slug} / ${file.name}`);
        files.set(file.sha256, await bytesAt(file.url));
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
