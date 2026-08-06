import { ManagedAttempt, ManagedSubmissionDetail } from "../../ManagerApi";
import { JobState } from "../../ParticipantApi";
import { CONTEST_ID, COURSE_ID } from "./activities";
import { fakeSha } from "./problems";

/**
 * Submissions across activities, as the manager list shows them.
 *
 * Deliberately mixed: finished ones with every verdict, one still queued, one
 * running, one that failed as infrastructure rather than as a wrong answer, and
 * one rejudged twice — so the screen renders the states it will actually meet
 * rather than a page of green rows.
 */

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60000).toISOString();

const RUNNERS = ["Main runner", "Lab runner", "Contest runner"];

interface Seed {
    id: string;
    activityId: string;
    activitySlug: string;
    seriesId: string;
    seriesName: string;
    seriesProblemId: string;
    problemSlug: string;
    problemName: string;
    userId: string;
    userName: string;
    minutes: number;
    language: string;
    state: JobState;
    verdict?: string;
    score?: number;
    /** Extra finished attempts before the current one, oldest first. */
    history?: { verdict: string; score: number }[];
    log?: string;
}

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
        { no: 2, status: score >= 30 ? "OK" : "ERROR", timeMs: 118, memoryMb: 12, score: score >= 30 ? 0 : 0, maxScore: 0, note: "1b" },
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

const SEEDS: Seed[] = [
    {
        id: "msub-1", activityId: CONTEST_ID, activitySlug: "AMMPZ-2019",
        seriesId: "series-r1", seriesName: "Runda 1", seriesProblemId: "sp-series-r1-A",
        problemSlug: "A", problemName: "Spójność grafu",
        userId: "user-kowalski", userName: "Jan Kowalski",
        minutes: 4, language: "cpp", state: "completed", verdict: "Accepted", score: 100,
    },
    {
        id: "msub-2", activityId: CONTEST_ID, activitySlug: "AMMPZ-2019",
        seriesId: "series-r1", seriesName: "Runda 1", seriesProblemId: "sp-series-r1-A",
        problemSlug: "A", problemName: "Spójność grafu",
        userId: "user-nowak", userName: "Anna Nowak",
        minutes: 9, language: "python", state: "completed", verdict: "Wrong answer", score: 30,
        // Rejudged after the tests were corrected: both attempts stay.
        history: [{ verdict: "Wrong answer", score: 0 }],
    },
    {
        id: "msub-3", activityId: CONTEST_ID, activitySlug: "AMMPZ-2019",
        seriesId: "series-r1", seriesName: "Runda 1", seriesProblemId: "sp-series-r1-B",
        problemSlug: "B", problemName: "Najkrótsza ścieżka",
        userId: "user-kowalski", userName: "Jan Kowalski",
        minutes: 12, language: "cpp", state: "completed", verdict: "Time limit exceeded", score: 30,
    },
    {
        id: "msub-4", activityId: CONTEST_ID, activitySlug: "AMMPZ-2019",
        seriesId: "series-r1", seriesName: "Runda 1", seriesProblemId: "sp-series-r1-B",
        problemSlug: "B", problemName: "Najkrótsza ścieżka",
        userId: "user-wisniewski", userName: "Tomasz Wiśniewski",
        minutes: 2, language: "java", state: "running",
    },
    {
        id: "msub-5", activityId: CONTEST_ID, activitySlug: "AMMPZ-2019",
        seriesId: "series-r1", seriesName: "Runda 1", seriesProblemId: "sp-series-r1-A",
        problemSlug: "A", problemName: "Spójność grafu",
        userId: "user-wisniewski", userName: "Tomasz Wiśniewski",
        minutes: 1, language: "cpp", state: "queued",
    },
    {
        id: "msub-6", activityId: CONTEST_ID, activitySlug: "AMMPZ-2019",
        seriesId: "series-r1", seriesName: "Runda 1", seriesProblemId: "sp-series-r1-B",
        problemSlug: "B", problemName: "Najkrótsza ścieżka",
        userId: "user-nowak", userName: "Anna Nowak",
        minutes: 25, language: "cpp", state: "failed",
        // Not a verdict: the package could not be read, which says nothing about
        // the solution and must never be scored.
        log: "runner: package checksum mismatch, evaluation abandoned",
    },
    {
        id: "msub-7", activityId: COURSE_ID, activitySlug: "PROG-1-LA",
        seriesId: "series-w1", seriesName: "Zajęcia 1 — podstawy", seriesProblemId: "sp-series-w1-petle",
        problemSlug: "petle", problemName: "Pętle i sumy",
        userId: "user-nowak", userName: "Anna Nowak",
        minutes: 1500, language: "python", state: "completed", verdict: "Accepted", score: 100,
    },
    {
        id: "msub-8", activityId: COURSE_ID, activitySlug: "PROG-1-LA",
        seriesId: "series-w1", seriesName: "Zajęcia 1 — podstawy", seriesProblemId: "sp-series-w1-tablice",
        problemSlug: "tablice", problemName: "Tablice",
        userId: "user-kowalski", userName: "Jan Kowalski",
        minutes: 2100, language: "cpp", state: "completed", verdict: "Compilation error", score: 0,
        log: "solution.cpp:7:5: error: 'cout' was not declared in this scope",
    },
    {
        id: "msub-9", activityId: COURSE_ID, activitySlug: "PROG-1-LA",
        seriesId: "series-w2", seriesName: "Zajęcia 2 — rekurencja", seriesProblemId: "sp-series-w2-rekurencja",
        problemSlug: "rekurencja", problemName: "Rekurencja — rozgrzewka",
        userId: "user-wisniewski", userName: "Tomasz Wiśniewski",
        minutes: 300, language: "python", state: "cancelled",
    },
];

const SOURCE: Record<string, string> = {
    cpp: "#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    int n, m;\n    cin >> n >> m;\n    // ...\n    return 0;\n}\n",
    python: "import sys\n\ndef main():\n    data = sys.stdin.read().split()\n    # ...\n\nmain()\n",
    java: "public class Main {\n    public static void main(String[] args) {\n        // ...\n    }\n}\n",
};

const EXTENSION: Record<string, string> = { cpp: "cpp", python: "py", java: "java" };

const attemptsOf = (seed: Seed): ManagedAttempt[] => {
    const history = seed.history ?? [];
    const older = history.map((entry, index) => ({
        id: `${seed.id}-job-${index + 1}`,
        attempt: index + 1,
        state: "completed" as JobState,
        startedAt: minutesAgo(seed.minutes + (history.length - index) * 30),
        finishedAt: minutesAgo(seed.minutes + (history.length - index) * 30 - 1),
        runnerName: RUNNERS[index % RUNNERS.length],
        detail: detail(entry.score, entry.verdict),
    }));

    const current: ManagedAttempt = {
        id: `${seed.id}-job-${history.length + 1}`,
        attempt: history.length + 1,
        state: seed.state,
        startedAt: minutesAgo(seed.minutes),
        finishedAt: seed.state === "queued" || seed.state === "running" ? undefined : minutesAgo(seed.minutes - 1),
        runnerName: seed.state === "queued" ? undefined : RUNNERS[history.length % RUNNERS.length],
        detail: seed.state === "completed" ? detail(seed.score ?? 0, seed.verdict ?? "") : undefined,
        log: seed.log,
    };

    // Newest first, the way both screens read them.
    return [current, ...older.reverse()];
};

export const createSubmissions = (): ManagedSubmissionDetail[] => SEEDS.map(seed => {
    const fileName = `solution.${EXTENSION[seed.language] ?? "txt"}`;
    const source = SOURCE[seed.language] ?? "";
    return {
        id: seed.id,
        activityId: seed.activityId,
        activitySlug: seed.activitySlug,
        seriesId: seed.seriesId,
        seriesName: seed.seriesName,
        seriesProblemId: seed.seriesProblemId,
        problemSlug: seed.problemSlug,
        problemName: seed.problemName,
        userId: seed.userId,
        userName: seed.userName,
        submittedAt: minutesAgo(seed.minutes),
        language: seed.language,
        state: seed.state,
        verdict: seed.verdict,
        score: seed.score,
        maxScore: 100,
        attempts: (seed.history?.length ?? 0) + 1,
        problemType: "standard-io@1",
        attemptList: attemptsOf(seed),
        files: [{
            name: fileName,
            language: seed.language,
            sizeBytes: source.length,
            sha256: fakeSha(`${seed.id}/${fileName}`),
        }],
    };
});

/** The stored source of a submission, keyed by file name. */
export const submissionSource = (language: string | undefined): string =>
    SOURCE[language ?? ""] ?? "";
