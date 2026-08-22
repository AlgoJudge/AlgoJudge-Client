import { ManagedAttempt, ManagedSubmissionDetail } from "../../ManagerApi";
import { JobState } from "../../ParticipantApi";
import type { FakeFiles } from "../FileApiFake";
import { attemptFiles, sourceFiles } from "./attachments";
import {
    SeedActivity, SeedAttempt, SeedSeries, WORLD,
    assignmentId, attemptId, attemptTime, displayName, fractionOf, maxPointsOf, pointsOf,
} from "./world";

/**
 * Submissions across activities, as the manager list shows them.
 *
 * Projected from the seed's attempts, which is the same record the participant's
 * own list and the boards are built from. They used to be a list of their own,
 * naming series and problems that the participant's half did not have — `msub-3`
 * against `sp-series-r1-B` while the other side had no such round.
 *
 * Still deliberately mixed, because the seed is: finished submissions with every
 * verdict, one queued, one running, one that failed as infrastructure rather
 * than as a wrong answer, and one rejudged — the states the screen will actually
 * meet rather than a page of green rows.
 */

const RUNNERS = ["Main runner", "Lab runner", "Contest runner"];

/** One evaluation job per rejudge, newest first — the way both screens read them. */
const attemptListOf = (
    files: FakeFiles,
    id: string,
    series: SeedSeries,
    attempt: SeedAttempt,
): ManagedAttempt[] => {
    const submittedAt = attemptTime(series, attempt);
    const finishedAt = new Date(Date.parse(submittedAt) + 60000).toISOString();
    const history = attempt.history ?? [];

    const older = history.map((entry, index) => ({
        id: `${id}-job-${index + 1}`,
        attempt: index + 1,
        state: "completed" as JobState,
        startedAt: submittedAt,
        finishedAt,
        runnerName: RUNNERS[index % RUNNERS.length],
        // An earlier job of the same submission: its own document and its own
        // log, which is why they hang off the attempt and not off the submission.
        files: attemptFiles(files, series,
            { ...attempt, state: "completed", score: entry.score, verdict: entry.verdict },
            index + 1),
    }));

    const current: ManagedAttempt = {
        id: `${id}-job-${history.length + 1}`,
        attempt: history.length + 1,
        state: attempt.state,
        startedAt: submittedAt,
        finishedAt: attempt.state === "queued" || attempt.state === "running" ? undefined : finishedAt,
        runnerName: attempt.state === "queued" ? undefined : RUNNERS[history.length % RUNNERS.length],
        // A manager reads every attachment whatever the activity's table says:
        // the table decides what reaches a participant, and the log was kept for
        // whoever runs the activity.
        files: attemptFiles(files, series, attempt, history.length + 1),
    };

    return [current, ...older.reverse()];
};

const submissionOf = (
    files: FakeFiles,
    activity: SeedActivity,
    series: SeedSeries,
    attempt: SeedAttempt,
): ManagedSubmissionDetail | undefined => {
    const assignment = series.assignments.find(a => a.slug === attempt.problem);
    const contestant = activity.contestants?.find(c => c.id === attempt.contestant);
    if (!assignment || !contestant) return undefined;

    const id = attemptId(series.id, attempt);

    return {
        id,
        activityId: activity.id,
        activitySlug: activity.slug,
        seriesId: series.id,
        seriesName: series.name,
        seriesProblemId: assignmentId(series.id, assignment.slug),
        problemSlug: assignment.slug,
        problemName: displayName(assignment),
        userId: contestant.userId,
        userName: contestant.userName,
        submittedAt: attemptTime(series, attempt),
        props: { type: assignment.problem.type ?? "standard-io@1", language: attempt.language },
        state: attempt.state,
        verdict: attempt.verdict,
        score: pointsOf(assignment, fractionOf(attempt)),
        maxScore: maxPointsOf(assignment, attempt.maxScore),
        attempts: (attempt.history?.length ?? 0) + 1,
        problemType: assignment.problem.type ?? "standard-io@1",
        attemptList: attemptListOf(files, id, series, attempt),
        files: sourceFiles(files, series, attempt),
    };
};

/** Every attempt in every managed activity, newest first. */
export const createSubmissions = (files: FakeFiles): ManagedSubmissionDetail[] => WORLD
    .filter(activity => activity.managed)
    .flatMap(activity => activity.series.flatMap(series =>
        (series.attempts ?? [])
            .map(attempt => submissionOf(files, activity, series, attempt))
            .filter((s): s is ManagedSubmissionDetail => s !== undefined)))
    .sort((a, b) => Date.parse(b.submittedAt) - Date.parse(a.submittedAt));
