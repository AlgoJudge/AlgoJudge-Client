import { JobState, ProblemLimits, ProblemSample, ScoreVisibility, SubmitField } from "../../ParticipantApi";
import { AttachmentRule } from "../../ManagerApi";
import {
    arraysStatement,
    graphConnectivityStatement,
    graphConnectivityStatementEn,
    loopsStatement,
    shortestPathStatement,
    topologicalSortStatement,
    unknownTypeStatement,
} from "./content";
import { ME } from "./problems";

/**
 * Every activity in the fake, stated once.
 *
 * There used to be two of these. `fixtures/activities.ts` held what a manager
 * saw and `fixtures/index.ts` held what a participant saw, both written by hand,
 * and they disagreed about the same contest: its name, how many rounds it had,
 * which problems were in them, when it ran. Every "the manager changed it and
 * the participant never saw it" defect came from that split, and each was
 * answered by carrying one more field across.
 *
 * So there is one description, and both halves are projected from it —
 * `createActivityLibrary` for the manager, `createDataset` for the participant,
 * `createSubmissions` for the submissions list, `scoreboard.ts` for the boards.
 * A field that only one side has (`submissionCount`, `bestScore`) is **derived**
 * rather than stated, because a stated one is a second answer that can disagree.
 *
 * Times are relative to the module load, so the interface can be watched doing
 * what it is specified to do: a countdown that runs out, a round that opens.
 */

const START = Date.now();

const at = (ms: number): string => new Date(START + ms).toISOString();
const seconds = (n: number) => n * 1000;
const minutes = (n: number) => n * 60 * 1000;
const hours = (n: number) => n * 60 * minutes(1);
const days = (n: number) => n * 24 * hours(1);

/** The round that opens shortly after load, so the countdown can be watched. */
export const OPENING_SERIES_DELAY = seconds(45);

export const CONTEST_ID = "018f2c00-0000-7000-8000-000000000001";
export const COURSE_ID = "018f2c00-0000-7000-8000-000000000002";
export const FINISHED_ID = "018f2c00-0000-7000-8000-000000000003";
export const PRACTICE_ID = "018f2c00-0000-7000-8000-000000000004";
export const WORKSHOP_ID = "018f2c00-0000-7000-8000-000000000005";
export const INVITED_COURSE_ID = "018f2c00-0000-7000-8000-000000000006";
export const ARCHIVED_ID = "018f2c00-0000-7000-8000-000000000007";

/**
 * The course's join password.
 *
 * A manager types it and the participant side checks what somebody typed against
 * it, so it is stated where both can read it.
 */
/**
 * Who reads what a Runner attaches.
 *
 * A contest keeps the compiler output internal — it says a good deal about a
 * solution — while showing the per-test table, which is what a competitor needs
 * in order to know why. A course shows both: the log is where a student learns
 * what they got wrong.
 *
 * Neither lists anything else a Runner might attach, which is the point: an
 * unlisted name is `managersOnly` until somebody says otherwise.
 */
const CONTEST_ATTACHMENTS: AttachmentRule[] = [
    { name: "source", visibility: "participant" },
    { name: "details", visibility: "participant" },
    { name: "log", visibility: "managersOnly" },
];

const COURSE_ATTACHMENTS: AttachmentRule[] = [
    { name: "source", visibility: "participant" },
    { name: "details", visibility: "participant" },
    { name: "log", visibility: "participant" },
];

/**
 * What each activity accepts.
 *
 * The course takes Python alone, which is what a first-year course does — and it
 * is the case worth having in the seed, because `student-3` sent C++ to it
 * before the narrowing. That submission and its result stay: a result belongs to
 * what it was judged against.
 */
const CONTEST_LANGUAGES = ["cpp", "python", "java"];
const COURSE_LANGUAGES = ["python"];

export const COURSE_JOIN_PASSWORD = "PROG1-LA";

// ───────────────────────────────────────────────────────────── the shapes

/**
 * A library problem, as an assignment points at it.
 *
 * `id` is a real entry in `fixtures/problems.ts`: an assignment attaches a
 * library problem, and a manager screen that could not find it would be
 * rendering something that does not exist.
 */
export interface SeedProblem {
    id: string;
    slug: string;
    name: string;
    currentVersion: number;
    hasPackage?: boolean;
    /** The participant-facing text, in the default language. */
    statement: string;
    /** Keyed by language subtag, for the switcher above the statement. */
    translations?: Record<string, string>;
    samples?: ProblemSample[];
    /** Absent means the manager turned them off, which the screen must render. */
    limits?: ProblemLimits;
    attachments?: { name: string; mimeType: string; sizeBytes: number }[];
    /** The problem type, for the statement and result renderers. */
    type?: string;
    /** Fields the submit form offers. Absent takes the standard pair. */
    submitFields?: SubmitField[];
}

/** A library problem as one series uses it. */
export interface SeedAssignment {
    problem: SeedProblem;
    /** The label a participant sees and the URL segment. Unique in the activity. */
    slug: string;
    /** Overrides the library name for this assignment. */
    name?: string;
    maxSubmissions?: number;
    maxUploadBytes?: number;
    /** Pins the content version, so a running round cannot shift underneath it. */
    pinnedProblemVersionId?: string;
    pinnedVersion?: number;
    /**
     * What the problem is worth **here**. Absent keeps its own scale.
     *
     * On the assignment, so one library problem attached twice in an activity
     * may be worth different amounts in each round.
     */
    maxPoints?: number;
}

/**
 * Somebody with a row on the board.
 *
 * A team in a contest and a student in a course, which is why the row's name and
 * the submitter's are two fields: `AGH 1` sends what Tomasz Wiśniewski typed.
 */
export interface SeedContestant {
    id: string;
    name: string;
    userId: string;
    userName: string;
    /** The signed-in reader. Exactly one per activity that has any. */
    isMe?: boolean;
}

/**
 * One submission, and the only record that it happened.
 *
 * The submissions list, the problem's status, the assignment's `submissionCount`
 * and the row on the board are all read off these, so none of them can end up
 * contradicting another.
 */
export interface SeedAttempt {
    contestant: string;
    /** The assignment's slug within the activity. */
    problem: string;
    /** Minutes after the series started. Its series must therefore have a start. */
    at: number;
    language: string;
    state: JobState;
    verdict?: string;
    score?: number;
    /** Finished jobs before this one, oldest first — what a rejudge leaves. */
    history?: { verdict: string; score: number }[];
    /** Compiler output or the judge's message. Managers always see it. */
    log?: string;
    /**
     * What the Runner measured beyond the score, for a board that wants it.
     *
     * Public: it reaches everybody who may see the ranking. Only a few attempts
     * carry one, because that is the real case — a field every row filled in
     * would never show what an absent one does to a renderer.
     */
    extra?: unknown;
}

export interface SeedSeries {
    id: string;
    slug: string;
    name: string;
    order: number;
    startDate?: string;
    endDate?: string;
    /** Whether a closed series admits how many problems it holds. */
    revealProblemCount: boolean;
    rankingFreezeAt?: string;
    rankingRevealAt?: string;
    rankingVisibleFrom?: string;
    rankingVisibleTo?: string;
    assignments: SeedAssignment[];
    attempts?: SeedAttempt[];
}

export interface SeedActivity {
    id: string;
    slug: string;
    name: string;
    type: string;
    rankingType: string;
    timeZone: string;
    startDate?: string;
    endDate?: string;
    modules: { questions: boolean };
    scoreVisibility: ScoreVisibility;
    attachmentVisibility: AttachmentRule[];
    joinPolicy: "closed" | "password" | "open";
    joinPassword?: string;
    unlisted: boolean;
    hideEndedSeriesProblems: boolean;
    maxUploadBytes: number;
    maxAttachments: number;
    maxSubmissionsPerProblem?: number;
    /** What a solution may be written in here. */
    languages: string[];
    archivedAt?: string;
    /** Free display metadata on the participant's side. Never queried. */
    props?: { key: string; value: string }[];
    /** The reader's own standing to it, where they have not joined during the visit. */
    membership: "enrolled" | "invited" | "open";
    /**
     * Whether the manager fixtures manage it.
     *
     * The manager's list is the four an organiser here actually runs plus the one
     * they archived; the participant's list also holds contests from other years
     * and other people's groups. Both are projected from this one description, so
     * what they share cannot drift — this only says who sees the row.
     */
    managed: boolean;
    contestants?: SeedContestant[];
    series: SeedSeries[];
}

// ──────────────────────────────────────────────────────── library problems

const GRAPH: SeedProblem = {
    id: "prob-graf", slug: "spojnosc-grafu", name: "Spójność grafu", currentVersion: 3,
    statement: graphConnectivityStatement,
    translations: { en: graphConnectivityStatementEn },
    samples: [
        { input: "4 3\n1 2\n2 3\n3 4", output: "TAK", explanation: "Wszystkie wierzchołki leżą na jednej ścieżce." },
        { input: "4 2\n1 2\n3 4", output: "NIE" },
    ],
    attachments: [{ name: "testy-przykladowe.zip", mimeType: "application/zip", sizeBytes: 2048 }],
};

const DIJKSTRA: SeedProblem = {
    id: "prob-dijkstra", slug: "najkrotsza-sciezka", name: "Najkrótsza ścieżka", currentVersion: 2,
    statement: shortestPathStatement,
    limits: { timeMs: 2000, memoryMb: 512 },
    samples: [{ input: "3 3 1 3\n1 2 5\n2 3 5\n1 3 11", output: "10" }],
    attachments: [{ name: "graf-przyklad.png", mimeType: "image/png", sizeBytes: 8192 }],
};

// No package: nothing can be judged, and the screen has to say so before the
// round opens rather than after.
const TOPO: SeedProblem = {
    id: "prob-topo", slug: "sortowanie-topologiczne", name: "Sortowanie topologiczne",
    currentVersion: 1, hasPackage: false,
    statement: topologicalSortStatement,
    samples: [{ input: "3 2\n1 2\n2 3", output: "1 2 3" }],
};

const LOOPS: SeedProblem = {
    id: "prob-petle", slug: "petle-i-sumy", name: "Pętle i sumy", currentVersion: 1,
    statement: loopsStatement,
    samples: [{ input: "5", output: "15" }],
};

const ARRAYS: SeedProblem = {
    id: "prob-tablice", slug: "tablice", name: "Tablice", currentVersion: 2,
    statement: arraysStatement,
    samples: [{ input: "4\n1 2 3 4", output: "4 3 2 1" }],
};

/** Deliberately unsupported, to prove the controlled fallback. */
const GUESS: SeedProblem = {
    id: "prob-zgadywanka", slug: "zgadywanka", name: "Zgadywanka", currentVersion: 1,
    type: "interactive@9",
    statement: JSON.stringify(unknownTypeStatement, null, 2),
    submitFields: [],
};

// ──────────────────────────────────────────────────────────── the contest

/**
 * Five teams. Each sends what one of its members typed, which is why a row's
 * name and the submitter's are different things.
 */
const CONTEST_TEAMS: SeedContestant[] = [
    { id: "team-1", name: "Politechnika Poznańska 1", userId: "user-kowalski", userName: "Jan Kowalski" },
    { id: "team-2", name: "Uniwersytet Warszawski 2", userId: "user-nowak", userName: "Anna Nowak" },
    { id: "team-4", name: "AGH 1", userId: "user-wisniewski", userName: "Tomasz Wiśniewski" },
    { id: "team-5", name: "Uniwersytet Jagielloński 1", userId: "user-lewandowska", userName: "Maria Lewandowska" },
    { id: "team-7", name: "Politechnika Poznańska 3", userId: ME, userName: "Amy Horsefighter", isMe: true },
];

/** A round that is over, still readable, and with its board published. */
const ROUND_0: SeedSeries = {
    id: "series-r0", slug: "runda-0", name: "Runda 0 — rozgrzewkowa", order: 0,
    startDate: at(-days(1)), endDate: at(-days(1) + hours(3)),
    revealProblemCount: true,
    assignments: [
        { problem: LOOPS, slug: "R", name: "Rozgrzewka" },
        { problem: ARRAYS, slug: "S", name: "Sumy prefiksowe" },
    ],
    attempts: [
        { contestant: "team-2", problem: "R", at: 12, language: "cpp", state: "completed", verdict: "Accepted", score: 100 },
        { contestant: "team-2", problem: "S", at: 20, language: "cpp", state: "completed", verdict: "Wrong answer", score: 40 },
        { contestant: "team-2", problem: "S", at: 42, language: "cpp", state: "completed", verdict: "Accepted", score: 100 },

        { contestant: "team-7", problem: "R", at: 18, language: "cpp", state: "completed", verdict: "Accepted", score: 100 },
        { contestant: "team-7", problem: "S", at: 30, language: "cpp", state: "completed", verdict: "Wrong answer", score: 60 },
        { contestant: "team-7", problem: "S", at: 58, language: "cpp", state: "completed", verdict: "Accepted", score: 100 },

        { contestant: "team-1", problem: "R", at: 20, language: "java", state: "completed", verdict: "Time limit exceeded", score: 0 },
        { contestant: "team-1", problem: "R", at: 31, language: "java", state: "completed", verdict: "Accepted", score: 100 },
        { contestant: "team-1", problem: "S", at: 44, language: "java", state: "completed", verdict: "Wrong answer", score: 20 },
        { contestant: "team-1", problem: "S", at: 66, language: "java", state: "completed", verdict: "Wrong answer", score: 20 },
    ],
};

/**
 * The round being fought, with its board live and frozen for the last half hour
 * — the ICPC convention.
 *
 * Its window is open, so it is on the combined board; it is frozen, so its
 * columns carry an asterisk there and its late results arrive withheld. That
 * pairing is the whole of what the asterisk is for, and no other round in the
 * seed is in it.
 */
const ROUND_1: SeedSeries = {
    id: "series-r1", slug: "runda-1", name: "Runda 1", order: 1,
    startDate: at(-hours(2)), endDate: at(hours(1)),
    revealProblemCount: true,
    rankingFreezeAt: at(-minutes(30)),
    rankingRevealAt: at(hours(1)),
    assignments: [
        // Pinned: a contest must not have its statement change underneath it,
        // even though the library has moved on to v3.
        {
            problem: GRAPH, slug: "A", name: "Zadanie A — spójność",
            pinnedProblemVersionId: "v-graf-2", pinnedVersion: 2,
        },
        { problem: DIJKSTRA, slug: "B", maxSubmissions: 10 },
        { problem: TOPO, slug: "C", maxPoints: 50 },
        { problem: TOPO, slug: "D", name: "Kolorowanie grafu" },
    ],
    attempts: [
        // The reader's own, which is also the submissions list and the panel.
        { contestant: "team-7", problem: "C", at: 43, language: "java", state: "completed", verdict: "Runtime error", score: 0 },
        { contestant: "team-7", problem: "A", at: 57, language: "cpp", state: "failed", verdict: "Compilation error", log: "main.cpp:7:5: error: 'cout' was not declared in this scope" },
        { contestant: "team-7", problem: "C", at: 72, language: "python", state: "completed", verdict: "Time limit exceeded", score: 0 },
        { contestant: "team-7", problem: "B", at: 85, language: "cpp", state: "completed", verdict: "Wrong answer", score: 40 },
        { contestant: "team-7", problem: "A", at: 98, language: "cpp", state: "completed", verdict: "Accepted", score: 100, extra: { cyclesUsed: 4_120_000, peakMemoryMb: 38 } },
        { contestant: "team-7", problem: "B", at: 111, language: "cpp", state: "running" },
        { contestant: "team-7", problem: "A", at: 116, language: "cpp", state: "queued" },

        { contestant: "team-1", problem: "A", at: 12, language: "cpp", state: "completed", verdict: "Accepted", score: 100, extra: { cyclesUsed: 2_980_000, peakMemoryMb: 24 } },
        { contestant: "team-1", problem: "B", at: 33, language: "cpp", state: "completed", verdict: "Wrong answer", score: 30 },
        { contestant: "team-1", problem: "B", at: 54, language: "cpp", state: "completed", verdict: "Accepted", score: 100 },
        { contestant: "team-1", problem: "C", at: 88, language: "cpp", state: "completed", verdict: "Accepted", score: 100 },

        { contestant: "team-2", problem: "A", at: 9, language: "python", state: "completed", verdict: "Accepted", score: 100, history: [{ verdict: "Wrong answer", score: 0 }] },
        { contestant: "team-2", problem: "B", at: 61, language: "python", state: "completed", verdict: "Accepted", score: 100, extra: { cyclesUsed: 9_450_000, peakMemoryMb: 61 } },
        { contestant: "team-2", problem: "C", at: 25, language: "python", state: "completed", verdict: "Wrong answer", score: 10 },
        { contestant: "team-2", problem: "C", at: 40, language: "python", state: "completed", verdict: "Wrong answer", score: 10 },
        { contestant: "team-2", problem: "C", at: 55, language: "python", state: "completed", verdict: "Wrong answer", score: 30 },
        { contestant: "team-2", problem: "C", at: 71, language: "python", state: "completed", verdict: "Accepted", score: 100 },
        { contestant: "team-2", problem: "D", at: 95, language: "python", state: "failed", log: "runner: package checksum mismatch, evaluation abandoned" },

        { contestant: "team-4", problem: "A", at: 21, language: "cpp", state: "completed", verdict: "Wrong answer", score: 50 },
        { contestant: "team-4", problem: "A", at: 41, language: "cpp", state: "completed", verdict: "Accepted", score: 100 },
        { contestant: "team-4", problem: "B", at: 117, language: "cpp", state: "queued" },

        { contestant: "team-5", problem: "A", at: 45, language: "java", state: "completed", verdict: "Accepted", score: 100 },
        { contestant: "team-5", problem: "B", at: 63, language: "java", state: "completed", verdict: "Wrong answer", score: 20 },
        { contestant: "team-5", problem: "B", at: 90, language: "java", state: "running" },
    ],
};

/** Opens shortly after load: the countdown, and the round the screen watches. */
const ROUND_2: SeedSeries = {
    id: "series-r2", slug: "runda-2", name: "Runda 2", order: 2,
    startDate: at(OPENING_SERIES_DELAY), endDate: at(OPENING_SERIES_DELAY + hours(3)),
    // Closed, but the manager allows the count to be shown. The problems
    // themselves stay withheld — a closed round does not disclose what it holds.
    revealProblemCount: true,
    // Its board is held back until it ends, while Runda 0's is published and
    // Runda 1's is live-but-frozen: one activity, three windows, which is what
    // the per-round window is for.
    rankingVisibleFrom: at(OPENING_SERIES_DELAY + hours(3)),
    assignments: [
        { problem: GRAPH, slug: "E", name: "Maksymalny przepływ" },
        { problem: DIJKSTRA, slug: "F", name: "Drzewo przedziałowe" },
        { problem: TOPO, slug: "G", name: "Mosty w grafie" },
    ],
};

/** Closed with the count withheld too, so the screen has to render that case. */
const ROUND_3: SeedSeries = {
    id: "series-r3", slug: "runda-3", name: "Runda 3", order: 3,
    startDate: at(days(2)), endDate: at(days(2) + hours(3)),
    revealProblemCount: false,
    assignments: [
        { problem: GRAPH, slug: "H", name: "Cykl Eulera" },
        { problem: ARRAYS, slug: "I", name: "Najdłuższy podciąg" },
    ],
};

// ───────────────────────────────────────────────────────────── the course

const COURSE_STUDENTS: SeedContestant[] = [
    { id: "student-1", name: "Anna Nowak", userId: "user-nowak", userName: "Anna Nowak" },
    { id: "student-3", name: "Piotr Wiśniewski", userId: "user-wisniewski", userName: "Piotr Wiśniewski" },
    { id: "student-me", name: "Amy Horsefighter", userId: ME, userName: "Amy Horsefighter", isMe: true },
];

// ────────────────────────────────────────────────────────────── the world

export const WORLD: SeedActivity[] = [
    {
        id: CONTEST_ID,
        slug: "AMMPZ-2019",
        name: "Akademickie Mistrzostwa Polski w Programowaniu Zespołowym 2019",
        type: "contest@1",
        rankingType: "icpc",
        timeZone: "Europe/Warsaw",
        // Wide enough to hold every round, including the one that ran yesterday.
        startDate: at(-days(1) - hours(1)),
        endDate: at(days(3)),
        modules: { questions: true },
        scoreVisibility: "everyone",
        attachmentVisibility: CONTEST_ATTACHMENTS,
        // Nobody joins a national final from a link: the teams are entered.
        joinPolicy: "closed",
        unlisted: true,
        hideEndedSeriesProblems: false,
        maxUploadBytes: 8 * 1024 * 1024,
        maxAttachments: 1,
        languages: CONTEST_LANGUAGES,
        maxSubmissionsPerProblem: 20,
        props: [{ key: "Organizator", value: "Politechnika Poznańska" }],
        membership: "enrolled",
        managed: true,
        contestants: CONTEST_TEAMS,
        series: [ROUND_0, ROUND_1, ROUND_2, ROUND_3],
    },
    {
        id: COURSE_ID,
        slug: "PROG-1-LA",
        name: "Programowanie 1 — grupa LA",
        type: "course@1",
        rankingType: "points",
        timeZone: "Europe/Warsaw",
        startDate: at(-days(30)),
        endDate: at(days(60)),
        modules: { questions: true },
        // A course where somebody sees their own standing and nobody else's: the
        // ranking is one row, without a place.
        scoreVisibility: "participantOnly",
        attachmentVisibility: COURSE_ATTACHMENTS,
        // The emailed-link case: a group of students enrol themselves with the
        // password their lecturer gave them.
        joinPolicy: "password",
        joinPassword: COURSE_JOIN_PASSWORD,
        unlisted: true,
        hideEndedSeriesProblems: false,
        maxUploadBytes: 4 * 1024 * 1024,
        maxAttachments: 3,
        languages: COURSE_LANGUAGES,
        props: [
            { key: "Prowadzący", value: "Jan Kowalski" },
            { key: "Grupa", value: "LA" },
        ],
        membership: "enrolled",
        managed: true,
        contestants: COURSE_STUDENTS,
        series: [
            {
                id: "series-w1", slug: "zajecia-1", name: "Zajęcia 1 — podstawy", order: 1,
                startDate: at(-days(21)), endDate: at(-days(14)),
                revealProblemCount: true,
                assignments: [
                    { problem: LOOPS, slug: "petle" },
                    // Attached from an archived library entry: it keeps working
                    // where it was already used, which is the point of archiving.
                    { problem: ARRAYS, slug: "tablice", maxUploadBytes: 1024 * 1024, maxPoints: 200 },
                ],
                attempts: [
                    { contestant: "student-me", problem: "petle", at: 1200, language: "python", state: "completed", verdict: "Wrong answer", score: 60 },
                    { contestant: "student-me", problem: "petle", at: 1500, language: "python", state: "completed", verdict: "Accepted", score: 100 },
                    { contestant: "student-me", problem: "tablice", at: 1800, language: "python", state: "completed", verdict: "Wrong answer", score: 20 },
                    { contestant: "student-me", problem: "tablice", at: 1900, language: "python", state: "completed", verdict: "Wrong answer", score: 50 },
                    { contestant: "student-me", problem: "tablice", at: 2000, language: "python", state: "completed", verdict: "Wrong answer", score: 70 },
                    { contestant: "student-me", problem: "tablice", at: 2100, language: "python", state: "completed", verdict: "Partially accepted", score: 80 },

                    { contestant: "student-1", problem: "petle", at: 1500, language: "python", state: "completed", verdict: "Accepted", score: 100 },
                    { contestant: "student-1", problem: "tablice", at: 2400, language: "python", state: "completed", verdict: "Accepted", score: 100 },

                    { contestant: "student-3", problem: "petle", at: 2600, language: "cpp", state: "completed", verdict: "Accepted", score: 100 },
                    { contestant: "student-3", problem: "tablice", at: 2900, language: "cpp", state: "completed", verdict: "Compilation error", score: 0, log: "solution.cpp:7:5: error: 'cout' was not declared in this scope" },
                    { contestant: "student-3", problem: "tablice", at: 3100, language: "cpp", state: "completed", verdict: "Partially accepted", score: 50 },
                ],
            },
            {
                id: "series-w2", slug: "zajecia-2", name: "Zajęcia 2 — rekurencja", order: 2,
                startDate: at(-days(7)), endDate: at(days(3)),
                revealProblemCount: true,
                assignments: [
                    { problem: LOOPS, slug: "rekurencja", name: "Rekurencja — rozgrzewka", maxPoints: 50 },
                    { problem: ARRAYS, slug: "sortowanie", name: "Sortowanie" },
                ],
                attempts: [
                    { contestant: "student-me", problem: "rekurencja", at: 8640, language: "python", state: "completed", verdict: "Partially accepted", score: 50 },
                    { contestant: "student-1", problem: "rekurencja", at: 7200, language: "python", state: "completed", verdict: "Accepted", score: 100 },
                    { contestant: "student-1", problem: "sortowanie", at: 7800, language: "python", state: "completed", verdict: "Partially accepted", score: 80 },
                    { contestant: "student-3", problem: "rekurencja", at: 9000, language: "python", state: "cancelled" },
                ],
            },
            {
                id: "series-w3", slug: "zajecia-3", name: "Zajęcia 3 — struktury danych", order: 3,
                startDate: at(days(5)), endDate: at(days(12)),
                revealProblemCount: true,
                assignments: [
                    { problem: GRAPH, slug: "kopiec", name: "Kopiec binarny" },
                    { problem: DIJKSTRA, slug: "drzewo", name: "Drzewo BST" },
                ],
            },
        ],
    },
    {
        id: PRACTICE_ID,
        slug: "TRENING-OTWARTY",
        name: "Trening otwarty — zadania archiwalne",
        type: "contest@1",
        rankingType: "points",
        timeZone: "Europe/Warsaw",
        modules: { questions: false },
        scoreVisibility: "everyone",
        attachmentVisibility: COURSE_ATTACHMENTS,
        // Anybody may join, and there is no password to type.
        joinPolicy: "open",
        unlisted: false,
        hideEndedSeriesProblems: false,
        maxUploadBytes: 8 * 1024 * 1024,
        maxAttachments: 1,
        languages: CONTEST_LANGUAGES,
        props: [],
        // Joinable, not joined. The list is also how somebody finds this.
        membership: "open",
        managed: true,
        contestants: [],
        series: [
            {
                // No dates at all: an untimed activity, which the forms must
                // accept rather than demand a start for.
                id: "series-t1", slug: "zbior", name: "Zbiór zadań", order: 1,
                revealProblemCount: true,
                assignments: [{ problem: GRAPH, slug: "spojnosc" }],
            },
        ],
    },
    {
        id: WORKSHOP_ID,
        slug: "WARSZTAT-9",
        name: "Warsztat interaktywny (nieobsługiwany typ)",
        // Deliberately unsupported, to prove the controlled fallback. Every
        // screen must render a notice for this rather than break.
        type: "workshop@9",
        rankingType: "elimination@9",
        timeZone: "Europe/Warsaw",
        startDate: at(-hours(1)),
        endDate: at(hours(4)),
        modules: { questions: true },
        scoreVisibility: "everyone",
        attachmentVisibility: CONTEST_ATTACHMENTS,
        joinPolicy: "closed",
        unlisted: true,
        hideEndedSeriesProblems: false,
        maxUploadBytes: 8 * 1024 * 1024,
        maxAttachments: 1,
        languages: CONTEST_LANGUAGES,
        props: [],
        membership: "invited",
        managed: true,
        // With results, so the unsupported-ranking fallback has something to
        // fall back on. It prints the raw feed, which is the one place `extra`
        // is visible — nothing else renders it, because no ranking type here
        // needs it yet.
        contestants: [
            { id: "guesser-1", name: "Anna Nowak", userId: "user-nowak", userName: "Anna Nowak" },
            { id: "guesser-me", name: "Amy Horsefighter", userId: ME, userName: "Amy Horsefighter", isMe: true },
        ],
        series: [
            {
                id: "series-u1", slug: "etap-1", name: "Etap 1", order: 1,
                startDate: at(-hours(1)), endDate: at(hours(4)),
                revealProblemCount: true,
                assignments: [{ problem: GUESS, slug: "guess", name: "Zgadywanka" }],
                attempts: [
                    // The metric an elimination board would rank on, which is
                    // exactly the case `extra` exists for: no Server field, no
                    // Server release.
                    {
                        contestant: "guesser-1", problem: "guess", at: 12, language: "python",
                        state: "completed", verdict: "Accepted", score: 100,
                        extra: { guesses: 7, bestRound: 3 },
                    },
                    {
                        contestant: "guesser-me", problem: "guess", at: 25, language: "python",
                        state: "completed", verdict: "Partially accepted", score: 40,
                        extra: { guesses: 19, bestRound: 5 },
                    },
                ],
            },
        ],
    },
    {
        id: ARCHIVED_ID,
        slug: "WARSZTAT-8",
        name: "Warsztat 2018",
        type: "contest@1",
        rankingType: "points",
        timeZone: "Europe/Warsaw",
        startDate: at(-days(400)),
        endDate: at(-days(399)),
        modules: { questions: false },
        scoreVisibility: "managersOnly",
        attachmentVisibility: CONTEST_ATTACHMENTS,
        joinPolicy: "closed",
        unlisted: true,
        hideEndedSeriesProblems: false,
        maxUploadBytes: 8 * 1024 * 1024,
        maxAttachments: 1,
        languages: CONTEST_LANGUAGES,
        // Still readable, accepting nothing new. The state the manager list's
        // "include archived" control exists for.
        archivedAt: at(-days(380)),
        props: [],
        membership: "invited",
        managed: true,
        contestants: [],
        series: [],
    },
    {
        id: FINISHED_ID,
        slug: "AMMPZ-2018",
        name: "Akademickie Mistrzostwa Polski 2018",
        type: "contest@1",
        rankingType: "icpc",
        timeZone: "Europe/Warsaw",
        startDate: at(-days(400)),
        endDate: at(-days(400) + hours(5)),
        modules: { questions: false },
        scoreVisibility: "everyone",
        attachmentVisibility: CONTEST_ATTACHMENTS,
        joinPolicy: "closed",
        unlisted: true,
        hideEndedSeriesProblems: false,
        maxUploadBytes: 8 * 1024 * 1024,
        maxAttachments: 1,
        languages: CONTEST_LANGUAGES,
        props: [{ key: "Miejsce", value: "12 / 64" }],
        membership: "enrolled",
        // Somebody else's contest from last year: the reader competed in it and
        // does not run it.
        managed: false,
        contestants: [
            { id: "team-x", name: "Uniwersytet Warszawski 1", userId: "user-kowalski", userName: "Jan Kowalski" },
            { id: "team-me", name: "Politechnika Poznańska 3", userId: ME, userName: "Amy Horsefighter", isMe: true },
        ],
        series: [
            {
                id: "series-2018", slug: "final", name: "Finał", order: 1,
                startDate: at(-days(400)), endDate: at(-days(400) + hours(5)),
                revealProblemCount: true,
                assignments: [
                    { problem: GRAPH, slug: "A", name: "Zadanie A" },
                    { problem: DIJKSTRA, slug: "B", name: "Zadanie B" },
                ],
                attempts: [
                    { contestant: "team-x", problem: "A", at: 21, language: "cpp", state: "completed", verdict: "Accepted", score: 100 },
                    { contestant: "team-x", problem: "B", at: 35, language: "cpp", state: "completed", verdict: "Wrong answer", score: 0 },
                    { contestant: "team-x", problem: "B", at: 55, language: "cpp", state: "completed", verdict: "Accepted", score: 100 },
                    { contestant: "team-me", problem: "A", at: 8, language: "cpp", state: "completed", verdict: "Wrong answer", score: 0 },
                    { contestant: "team-me", problem: "A", at: 15, language: "cpp", state: "completed", verdict: "Wrong answer", score: 40 },
                    { contestant: "team-me", problem: "A", at: 23, language: "cpp", state: "completed", verdict: "Accepted", score: 100 },
                    { contestant: "team-me", problem: "B", at: 60, language: "cpp", state: "completed", verdict: "Time limit exceeded", score: 0 },
                ],
            },
        ],
    },
    {
        id: INVITED_COURSE_ID,
        slug: "PROG-1-LB",
        name: "Programowanie 1 — grupa LB",
        type: "course@1",
        rankingType: "points",
        timeZone: "Europe/Warsaw",
        startDate: at(-days(20)),
        endDate: at(days(70)),
        modules: { questions: true },
        // Nobody but a manager: no ranking entry at all.
        scoreVisibility: "managersOnly",
        attachmentVisibility: COURSE_ATTACHMENTS,
        // Unlisted **and** password-protected: reachable only by the address
        // somebody was sent, which is the state the share link exists for.
        joinPolicy: "password",
        joinPassword: COURSE_JOIN_PASSWORD,
        unlisted: true,
        hideEndedSeriesProblems: false,
        maxUploadBytes: 4 * 1024 * 1024,
        maxAttachments: 3,
        languages: CONTEST_LANGUAGES,
        props: [{ key: "Prowadzący", value: "Jan Kowalski" }],
        // Not in it. This is the one the enrolment form is for.
        membership: "open",
        managed: false,
        contestants: [],
        series: [
            {
                id: "series-lb1", slug: "zajecia-1", name: "Zajęcia 1 — podstawy", order: 1,
                startDate: at(-days(14)), endDate: at(days(7)),
                revealProblemCount: true,
                assignments: [{ problem: LOOPS, slug: "petle" }],
            },
        ],
    },
    // Filler, so pagination is exercised rather than assumed.
    ...Array.from({ length: 6 }, (_, i): SeedActivity => ({
        id: `018f2c00-0000-7000-8000-00000000001${i}`,
        slug: `ARCHIWUM-${2010 + i}`,
        name: `Zawody archiwalne ${2010 + i}`,
        type: "contest@1",
        rankingType: "icpc",
        timeZone: "Europe/Warsaw",
        startDate: at(-days(1000 + i * 365)),
        endDate: at(-days(1000 + i * 365) + hours(5)),
        modules: { questions: false },
        scoreVisibility: "everyone",
        attachmentVisibility: CONTEST_ATTACHMENTS,
        joinPolicy: "closed",
        unlisted: true,
        hideEndedSeriesProblems: false,
        maxUploadBytes: 8 * 1024 * 1024,
        maxAttachments: 1,
        languages: CONTEST_LANGUAGES,
        props: [],
        membership: "enrolled",
        managed: false,
        contestants: [],
        series: [],
    })),
];

// ────────────────────────────────────────────────────────────── shorthands

export const activityOf = (id: string): SeedActivity | undefined =>
    WORLD.find(activity => activity.id === id);

/** Every assignment of an activity, which is where a problem's slug is unique. */
export const assignmentsOf = (activity: SeedActivity): { series: SeedSeries; assignment: SeedAssignment }[] =>
    activity.series.flatMap(series => series.assignments.map(assignment => ({ series, assignment })));

/** What one assignment is called where a participant reads it. */
export const displayName = (assignment: SeedAssignment): string =>
    assignment.name ?? assignment.problem.name;

/**
 * How many submissions an assignment has had.
 *
 * Counted rather than stated, because **detaching is refused above zero** and a
 * stated count could refuse a detach that nothing justifies — or allow one that
 * orphans a result.
 */
export const submissionCountOf = (series: SeedSeries, slug: string): number =>
    (series.attempts ?? []).filter(attempt => attempt.problem === slug).length;

/** The identifier the manager side gives an assignment. */
export const assignmentId = (seriesId: string, slug: string): string => `sp-${seriesId}-${slug}`;

/**
 * The identifier a submission gets.
 *
 * Derived from where it sits, so the manager's list and the participant's name
 * the same submission — they used to be two unrelated sets of ids, `msub-3` and
 * `sub-5`, describing the same activity.
 */
export const attemptId = (seriesId: string, attempt: SeedAttempt): string =>
    `sub-${seriesId}-${attempt.contestant}-${attempt.problem}-${attempt.at}`;

/** Every attempt of an activity, newest first, as both lists read them. */
export const attemptsOf = (activity: SeedActivity): { series: SeedSeries; attempt: SeedAttempt }[] =>
    activity.series
        .flatMap(series => (series.attempts ?? []).map(attempt => ({ series, attempt })))
        .sort((a, b) => Date.parse(attemptTime(b.series, b.attempt)) - Date.parse(attemptTime(a.series, a.attempt)));

/**
 * When an attempt was made.
 *
 * `at` is minutes after its series started, so an attempt cannot outlive the
 * round it belongs to however the fixture's clock is set. A series with attempts
 * therefore has to have a start, and one without dates has no attempts.
 */
export const attemptTime = (series: SeedSeries, attempt: SeedAttempt): string =>
    new Date(Date.parse(series.startDate ?? at(0)) + attempt.at * 60000).toISOString();

/**
 * What a problem is worth here, and what a score becomes on that scale.
 *
 * The Runner reports on the package's own scale — a hundred in this seed — and
 * the assignment says what the problem counts for in its round. The Server
 * rescales between the two wherever it reports a number; the Runner's document
 * keeps its own arithmetic, because it is the Runner's.
 */
export const RUNNER_SCALE = 100;

export const maxPointsOf = (assignment: SeedAssignment): number =>
    assignment.maxPoints ?? RUNNER_SCALE;

export const pointsOf = (assignment: SeedAssignment, score: number | undefined): number | undefined =>
    score === undefined ? undefined : Math.round(score / RUNNER_SCALE * maxPointsOf(assignment));

/** The reader, where the activity has one. */
export const meOf = (activity: SeedActivity): SeedContestant | undefined =>
    activity.contestants?.find(contestant => contestant.isMe);
