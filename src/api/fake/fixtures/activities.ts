import { ManagedActivity, ManagedSeries, ManagedSeriesProblem } from "../../ManagerApi";
import { openByClock } from "../../seriesState";
import {
    SeedActivity, SeedSeries, WORLD,
    assignmentId, submissionCountOf,
} from "./world";

/**
 * Activities as a manager sees them, projected from the seed.
 *
 * This file used to **state** them, beside `fixtures/index.ts` stating the same
 * activities for the participant, and the two disagreed about the contest's
 * name, how many rounds it had and which problems were in them. Both are now
 * projections of `world.ts`, so what they share cannot drift apart.
 *
 * Only the activities marked `managed` reach here — the ones an organiser on
 * this instance actually runs, plus the one they archived. A contest somebody
 * competed in years ago is in the participant's list and not in this one, which
 * is a difference in who sees the row, not in what the row says.
 */

export { COURSE_JOIN_PASSWORD, CONTEST_ID, COURSE_ID, PRACTICE_ID, WORKSHOP_ID, ARCHIVED_ID } from "./world";

/**
 * `participantCount` is a placeholder here: the fake fills it in from the grants,
 * because a grant in an activity **is** the membership and a second number that
 * could disagree with it would be a lie the screens then render.
 */
export interface ActivityRecord {
    activity: ManagedActivity;
    series: ManagedSeries[];
}

const problemsOf = (series: SeedSeries): ManagedSeriesProblem[] =>
    series.assignments.map((assignment, index) => ({
        id: assignmentId(series.id, assignment.slug),
        seriesId: series.id,
        problemId: assignment.problem.id,
        problemSlug: assignment.problem.slug,
        problemName: assignment.problem.name,
        slug: assignment.slug,
        name: assignment.name,
        order: index + 1,
        pinnedProblemVersionId: assignment.pinnedProblemVersionId,
        pinnedVersion: assignment.pinnedVersion,
        currentVersion: assignment.problem.currentVersion,
        hasPackage: assignment.problem.hasPackage ?? true,
        // Counted from the attempts rather than stated: **detaching is refused
        // above zero**, so a number that disagreed with the submissions would
        // refuse a detach nothing justifies, or allow one that orphans a result.
        submissionCount: submissionCountOf(series, assignment.slug),
        maxPoints: assignment.maxPoints,
        maxUploadBytes: assignment.maxUploadBytes,
        maxSubmissions: assignment.maxSubmissions,
    }));

const seriesOf = (activity: SeedActivity, series: SeedSeries): ManagedSeries => ({
    id: series.id,
    activityId: activity.id,
    slug: series.slug,
    name: series.name,
    order: series.order,
    startDate: series.startDate,
    endDate: series.endDate,
    // The **Server** owns this: a scheduler opens a series when its start passes
    // and closes it when its end does. The seed states the dates and this works
    // out what that scheduler would have done by now — rather than a flag
    // somebody keeps in step by hand.
    //
    // `openByClock` rather than `seriesState`, because since 2026-08-08 the
    // state is read from this flag instead of computed beside it, and asking
    // the reader to produce what it consumes would be circular.
    isOpen: openByClock(series),
    // No seed round is paused, so nothing was hidden by one.
    hideProblemsWhilePaused: false,
    revealProblemCount: series.revealProblemCount,
    rankingFreezeAt: series.rankingFreezeAt,
    rankingRevealAt: series.rankingRevealAt,
    rankingVisibleFrom: series.rankingVisibleFrom,
    rankingVisibleTo: series.rankingVisibleTo,
    problems: problemsOf(series),
});

const activityOf = (activity: SeedActivity): ManagedActivity => ({
    id: activity.id,
    slug: activity.slug,
    name: activity.name,
    type: activity.type,
    rankingType: activity.rankingType,
    timeZone: activity.timeZone,
    startDate: activity.startDate,
    endDate: activity.endDate,
    modules: activity.modules,
    // Served from the shared store, which is where an activity's documents live.
    documents: [],
    scoreVisibility: activity.scoreVisibility,
    attachmentVisibility: activity.attachmentVisibility,
    joinPolicy: activity.joinPolicy,
    joinPassword: activity.joinPassword,
    unlisted: activity.unlisted,
    hideEndedSeriesProblems: activity.hideEndedSeriesProblems,
    maxUploadBytes: activity.maxUploadBytes,
    maxAttachments: activity.maxAttachments,
    languages: activity.languages,
    maxSubmissionsPerProblem: activity.maxSubmissionsPerProblem,
    archivedAt: activity.archivedAt,
    // All three are recomputed by the fake — from the series it holds and from
    // the grants — so what is written here is only a starting value.
    seriesCount: activity.series.length,
    problemCount: activity.series.reduce((sum, series) => sum + series.assignments.length, 0),
    participantCount: 0,
});

export const createActivityLibrary = (): ActivityRecord[] => WORLD
    .filter(activity => activity.managed)
    .map(activity => ({
        activity: activityOf(activity),
        series: activity.series.map(series => seriesOf(activity, series)),
    }));
