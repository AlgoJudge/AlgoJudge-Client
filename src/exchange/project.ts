import {
    ManagedActivity, ManagedProblem, ManagedProblemVersion, ManagedSeries,
} from "../api/ManagerApi";
import { BundledActivity, BundledDocument, BundledProblem, BundledSeries } from "./types";

/**
 * Turning what the API answers into what the bundle carries.
 *
 * **Separated from `collect.ts` so it can be checked.** The reading half needs
 * the API and a browser; this half is four pure functions, and
 * `check:exchange` drives them against a fixture whose every carried field is
 * set to something a fresh object would not hold.
 *
 * That separation was not tidiness. With the projection inside the collector,
 * removing `spec` from an assignment — the field that holds the languages a
 * submit form offers, and the one §7 caught the *Server* dropping — passed both
 * checks: the format round trip reads a manifest written by hand, and the
 * browser run asserted that an activity arrived rather than what it arrived
 * with. Nothing anywhere would have said so.
 */

export const projectSeries = (
    series: ManagedSeries, problemSlugOf: Map<string, string>,
): BundledSeries => ({
    slug: series.slug,
    name: series.name,
    order: series.order,
    startDate: series.startDate,
    endDate: series.endDate,
    revealProblemCount: series.revealProblemCount,
    rankingFreezeAt: series.rankingFreezeAt,
    rankingRevealAt: series.rankingRevealAt,
    rankingVisibleFrom: series.rankingVisibleFrom,
    rankingVisibleTo: series.rankingVisibleTo,
    importance: series.importance,
    importanceScope: series.importanceScope,
    addressRules: series.addressRules,
    restrictionsEnabled: series.restrictionsEnabled,
    runnerTags: series.runnerTags,
    assignments: series.problems.map(assignment => ({
        // **By the library slug, never the id.** An id means nothing in another
        // installation, and the bundle names its own problems the same way.
        problemSlug: problemSlugOf.get(assignment.problemId) ?? assignment.problemSlug,
        slug: assignment.slug,
        name: assignment.name,
        order: assignment.order,
        config: assignment.config,
        spec: assignment.spec,
        props: assignment.props,
        maxPoints: assignment.maxPoints,
        maxUploadBytes: assignment.maxUploadBytes,
        maxAttachments: assignment.maxAttachments,
        maxSubmissions: assignment.maxSubmissions,
    })),
});

export const projectActivity = (
    activity: ManagedActivity, documents: BundledDocument[], series: BundledSeries[],
): BundledActivity => ({
    slug: activity.slug,
    name: activity.name,
    type: activity.type,
    rankingType: activity.rankingType,
    timeZone: activity.timeZone,
    startDate: activity.startDate,
    endDate: activity.endDate,
    modules: activity.modules,
    scoreVisibility: activity.scoreVisibility,
    attachmentVisibility: activity.attachmentVisibility,
    props: activity.props,
    joinPolicy: activity.joinPolicy,
    unlisted: activity.unlisted,
    // **Never the join password.** Everybody who took the original knows it, so
    // a copy that carried it is joinable by last year's cohort.
    hideEndedSeriesProblems: activity.hideEndedSeriesProblems,
    showGroupMembers: activity.showGroupMembers,
    maxUploadBytes: activity.maxUploadBytes,
    maxAttachments: activity.maxAttachments,
    maxSubmissionsPerProblem: activity.maxSubmissionsPerProblem,
    runnerTags: activity.runnerTags,
    documents,
    series,
});

export const projectProblem = (
    problem: ManagedProblem, version: ManagedProblemVersion,
): BundledProblem => ({
    slug: problem.slug,
    name: problem.name,
    type: problem.type,
    external: problem.external,
    note: version.note,
    props: version.props,
    files: version.files.map(file => ({
        name: file.name,
        scope: file.scope,
        sha256: file.sha256,
    })),
});
