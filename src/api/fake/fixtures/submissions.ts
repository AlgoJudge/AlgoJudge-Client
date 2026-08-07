import { ManagedAttempt, ManagedSubmissionDetail } from "../../ManagerApi";
import { JobState } from "../../ParticipantApi";
import { fakeSha } from "./problems";
import {
    SeedActivity, SeedAttempt, SeedSeries, WORLD,
    assignmentId, attemptId, attemptTime, displayName,
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

/** A per-test document in the shape `standard-io@1` results carry. */
const detail = (score: number, verdict: string) => ({
    kind: "standard-io",
    version: 1,
    score,
    verdict,
    groups: [
        { group: 1, points: 30, awarded: score >= 30 ? 30 : 0 },
        { group: 2, points: 30, awarded: score >= 60 ? 30 : 0 },
        { group: 3, points: 40, awarded: score >= 100 ? 40 : 0 },
    ],
    limits: { timeMs: 1000, memoryMb: 256 },
    // The shape the renderer reads. It is the Runner's document, so the fixture
    // has to speak it rather than something adjacent to it.
    tests: [
        { no: 1, status: "OK", timeMs: 120, memoryMb: 12, score: 30, maxScore: 30, note: "1a" },
        { no: 2, status: score >= 30 ? "OK" : "ERROR", timeMs: 118, memoryMb: 12, score: 0, maxScore: 0, note: "1b" },
        {
            no: 3,
            status: score >= 60 ? "OK" : "ERROR",
            timeMs: score >= 60 ? 340 : 1000,
            memoryMb: 24,
            score: score >= 60 ? 30 : 0,
            maxScore: 30,
            note: verdict === "Time limit exceeded" ? "przekroczony limit czasu" : "2a",
        },
        {
            no: 4,
            status: score >= 100 ? "OK" : "ERROR",
            timeMs: 620,
            memoryMb: 48,
            score: score >= 100 ? 40 : 0,
            maxScore: 40,
            note: "3a",
        },
    ],
});

const SOURCE: Record<string, string> = {
    cpp: "#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    int n, m;\n    cin >> n >> m;\n    // ...\n    return 0;\n}\n",
    python: "import sys\n\ndef main():\n    data = sys.stdin.read().split()\n    # ...\n\nmain()\n",
    java: "public class Main {\n    public static void main(String[] args) {\n        // ...\n    }\n}\n",
};

const EXTENSION: Record<string, string> = { cpp: "cpp", python: "py", java: "java" };

/** One evaluation job per rejudge, newest first — the way both screens read them. */
const attemptListOf = (id: string, series: SeedSeries, attempt: SeedAttempt): ManagedAttempt[] => {
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
        detail: detail(entry.score, entry.verdict),
    }));

    const current: ManagedAttempt = {
        id: `${id}-job-${history.length + 1}`,
        attempt: history.length + 1,
        state: attempt.state,
        startedAt: submittedAt,
        finishedAt: attempt.state === "queued" || attempt.state === "running" ? undefined : finishedAt,
        runnerName: attempt.state === "queued" ? undefined : RUNNERS[history.length % RUNNERS.length],
        detail: attempt.state === "completed" ? detail(attempt.score ?? 0, attempt.verdict ?? "") : undefined,
        log: attempt.log,
    };

    return [current, ...older.reverse()];
};

const submissionOf = (
    activity: SeedActivity,
    series: SeedSeries,
    attempt: SeedAttempt,
): ManagedSubmissionDetail | undefined => {
    const assignment = series.assignments.find(a => a.slug === attempt.problem);
    const contestant = activity.contestants?.find(c => c.id === attempt.contestant);
    if (!assignment || !contestant) return undefined;

    const id = attemptId(series.id, attempt);
    const fileName = `solution.${EXTENSION[attempt.language] ?? "txt"}`;
    const source = SOURCE[attempt.language] ?? "";

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
        language: attempt.language,
        state: attempt.state,
        verdict: attempt.verdict,
        score: attempt.score,
        maxScore: assignment.maxScore ?? 100,
        attempts: (attempt.history?.length ?? 0) + 1,
        problemType: assignment.problem.type ?? "standard-io@1",
        attemptList: attemptListOf(id, series, attempt),
        files: [{
            name: fileName,
            language: attempt.language,
            sizeBytes: source.length,
            sha256: fakeSha(`${id}/${fileName}`),
        }],
    };
};

/** Every attempt in every managed activity, newest first. */
export const createSubmissions = (): ManagedSubmissionDetail[] => WORLD
    .filter(activity => activity.managed)
    .flatMap(activity => activity.series.flatMap(series =>
        (series.attempts ?? [])
            .map(attempt => submissionOf(activity, series, attempt))
            .filter((s): s is ManagedSubmissionDetail => s !== undefined)))
    .sort((a, b) => Date.parse(b.submittedAt) - Date.parse(a.submittedAt));

/** The stored source of a submission, keyed by file name. */
export const submissionSource = (language: string | undefined): string =>
    SOURCE[language ?? ""] ?? "";
