import { StatementRef } from "../../FileApi";
import {
    Activity,
    ProblemDetail,
    ProblemSummary,
    Question,
    Series,
    SubmissionDetail,
    SubmissionSummary,
} from "../../ParticipantApi";
// Type-only, as `documents.ts` does it: the fixtures say what is stored and are
// handed the store rather than reaching for one of their own.
import type { FakeFiles } from "../FileApiFake";
import {
    arraysStatement,
    graphConnectivityStatement,
    graphConnectivityStatementEn,
    loopsStatement,
    shortestPathStatement,
    topologicalSortStatement,
    unknownTypeStatement,
} from "./content";
import { fakeSha } from "./problems";

/**
 * The dataset the fake API serves.
 *
 * Times are relative to when the module loads, so the interface can actually be
 * seen doing the things it is specified to do: a countdown that runs out, a
 * series that opens, a submission that finishes. `nowPlus` is what makes that
 * possible — hard-coded dates would have every series permanently in the past.
 */

const START = Date.now();

const nowPlus = (ms: number): string => new Date(START + ms).toISOString();
const seconds = (n: number) => n * 1000;
const minutes = (n: number) => n * 60 * 1000;
const hours = (n: number) => n * 60 * minutes(1);
const days = (n: number) => n * 24 * hours(1);

/** The series that opens shortly after load, so the countdown can be watched. */
export const OPENING_SERIES_DELAY = seconds(45);

export interface Dataset {
    activities: Activity[];
    /** Keyed by activity id. */
    series: Map<string, Series[]>;
    /** Keyed by `${activityId}/${problemSlug}`. */
    problems: Map<string, ProblemDetail>;
    /** Keyed by activity id, newest first. */
    submissions: Map<string, SubmissionSummary[]>;
    /** Keyed by submission id. */
    submissionDetails: Map<string, SubmissionDetail>;
    /** Keyed by submission id, then file name. */
    submissionFiles: Map<string, Map<string, string>>;
    /** Keyed by activity id, newest first. */
    questions: Map<string, Question[]>;
    /**
     * The combined board, keyed by activity id. Shape is decided by the
     * activity's rankingType.
     */
    rankings: Map<string, unknown>;
    /**
     * One round's own standing, keyed by series id.
     *
     * Kept apart from the combined board because the Server assembles them
     * apart: a round's places are its own, and are not a filtered view of
     * anybody else's.
     */
    seriesRankings: Map<string, unknown>;
    /** Problems whose series has not opened yet, held back until it does. */
    withheld: Map<string, ProblemSummary[]>;
}

const problemSummary = (
    slug: string,
    name: string,
    status: ProblemSummary["status"],
    bestScore: number | undefined,
    attempts: number,
    maxScore = 100,
): ProblemSummary => ({
    id: `problem-${slug}`,
    slug,
    name,
    status,
    bestScore,
    maxScore,
    attempts,
});

const problemDetail = (
    seriesId: string,
    summary: ProblemSummary,
    type: string,
    statements: StatementRef[],
    extras: Partial<ProblemDetail> = {},
): ProblemDetail => ({
    id: summary.id,
    slug: summary.slug,
    name: summary.name,
    type,
    seriesId,
    status: summary.status,
    bestScore: summary.bestScore,
    maxScore: summary.maxScore,
    attempts: summary.attempts,
    statements,
    attachments: [],
    limits: { timeMs: 1000, memoryMb: 256 },
    samples: [],
    languages: ["cpp", "python", "java"],
    maxUploadBytes: 8 * 1024 * 1024,
    submitFields: [
        { kind: "code", name: "source", label: "Kod źródłowy" },
        { kind: "file", name: "file", label: "Plik z rozwiązaniem", accept: [".cpp", ".py", ".java", ".zip"] },
    ],
    ...extras,
});

const sampleCode = `#include <bits/stdc++.h>
using namespace std;

int main() {
    int n, m;
    cin >> n >> m;
    vector<vector<int>> g(n + 1);
    for (int i = 0; i < m; i++) {
        int a, b;
        cin >> a >> b;
        g[a].push_back(b);
        g[b].push_back(a);
    }
    vector<bool> seen(n + 1, false);
    queue<int> q;
    q.push(1);
    seen[1] = true;
    int visited = 1;
    while (!q.empty()) {
        int v = q.front();
        q.pop();
        for (int u : g[v]) {
            if (!seen[u]) {
                seen[u] = true;
                visited++;
                q.push(u);
            }
        }
    }
    cout << (visited == n ? "TAK" : "NIE") << endl;
    return 0;
}
`;

/** The per-test document a Runner attaches. Opaque to the Server, rendered by type. */
const standardIoDetail = (tests: { status: string; timeMs: number; memoryMb: number; score: number; note?: string }[]) => ({
    kind: "standard-io",
    version: 1,
    limits: { timeMs: 1000, memoryMb: 256 },
    tests: tests.map((t, i) => ({
        no: i + 1,
        status: t.status,
        timeMs: t.timeMs,
        memoryMb: t.memoryMb,
        score: t.score,
        maxScore: 10,
        note: t.note ?? "",
    })),
});

/** Four tests whose outcome adds up to the submission's score. */
const testsFor = (score: number | undefined) => {
    const passed = Math.round(((score ?? 0) / 100) * 4);
    const notes = [
        "Abnormal program termination. Exit status: 6",
        "Przekroczenie limitu czasu",
        "warning: control reaches end of non-void function",
        "Zła odpowiedź",
    ];
    return Array.from({ length: 4 }, (_, i) => i < passed
        ? { status: "OK", timeMs: 20 + i * 5, memoryMb: 12, score: 10 }
        : { status: "ERROR", timeMs: i === 2 ? 1000 : 20, memoryMb: 12, score: 0, note: notes[i] });
};

export const createDataset = (files: FakeFiles): Dataset => {
    const activities: Activity[] = [];
    const series = new Map<string, Series[]>();
    const problems = new Map<string, ProblemDetail>();
    const submissions = new Map<string, SubmissionSummary[]>();
    const submissionDetails = new Map<string, SubmissionDetail>();
    const submissionFiles = new Map<string, Map<string, string>>();
    const questions = new Map<string, Question[]>();
    const rankings = new Map<string, unknown>();
    const seriesRankings = new Map<string, unknown>();
    const withheld = new Map<string, ProblemSummary[]>();

    /**
     * Stores a statement and answers with the reference the participant gets.
     *
     * The fixtures used to hand the text straight to the screen. They store it
     * now, because that is where it comes from — the same file the manager
     * uploaded, read back by id. A fake that skipped the store could not be
     * wrong in the way the real one can.
     */
    const statement = (text: string, language?: string): StatementRef => {
        const name = language ? `content-${language}.md` : "content.md";
        const stored = files.seedText(name, "text/markdown", text);
        return { name, language, fileId: stored.id, sha256: stored.sha256, sizeBytes: stored.sizeBytes };
    };

    /** A statement in one language, which is what most problems have. */
    const only = (text: string): StatementRef[] => [statement(text)];

    // ---------------------------------------------------------------- contest

    const contestId = "018f2c00-0000-7000-8000-000000000001";
    activities.push({
        id: contestId,
        slug: "AMMPZ-2019",
        name: "Akademickie Mistrzostwa Polski w Programowaniu Zespołowym 2019",
        type: "contest@1",
        rankingType: "icpc",
        timeZone: "Europe/Warsaw",
        state: "ongoing",
        membership: "enrolled",
        startDate: nowPlus(-hours(2)),
        endDate: nowPlus(days(3)),
        // Nobody joins a national final from a link: the teams are entered.
        joinPolicy: "closed",
        scoreVisibility: "everyone",
        hideEndedSeriesProblems: false,
        modules: { questions: true },
        // Filled in from `FakeActivities`, which is where an activity's
        // documents live: the manager screen publishes into it and this side
        // serves what is there, so the two cannot come to disagree.
        documents: [],
        props: [{ key: "Organizator", value: "Politechnika Poznańska" }],
    });

    const r1Problems = [
        problemSummary("A", "Spójność grafu", "solved", 100, 3),
        problemSummary("B", "Najkrótsza ścieżka", "partial", 40, 5),
        problemSummary("C", "Sortowanie topologiczne", "attempted", 0, 2),
        problemSummary("D", "Kolorowanie grafu", "untouched", undefined, 0),
    ];
    const r2Problems = [
        problemSummary("E", "Maksymalny przepływ", "untouched", undefined, 0),
        problemSummary("F", "Drzewo przedziałowe", "untouched", undefined, 0),
        problemSummary("G", "Mosty w grafie", "untouched", undefined, 0),
    ];

    const round1: Series = {
        id: "series-r1",
        slug: "runda-1",
        name: "Runda 1",
        startDate: nowPlus(-hours(2)),
        endDate: nowPlus(hours(1)),
        isOpen: true,
        problemCount: r1Problems.length,
        problems: r1Problems,
    };
    // Closed, but the manager allows the count to be shown. The problems
    // themselves are withheld — a closed series does not disclose what it holds.
    const round2: Series = {
        id: "series-r2",
        slug: "runda-2",
        name: "Runda 2",
        startDate: nowPlus(OPENING_SERIES_DELAY),
        endDate: nowPlus(OPENING_SERIES_DELAY + hours(3)),
        isOpen: false,
        problemCount: r2Problems.length,
    };
    // Closed with the count withheld too, so the screen has to render that case.
    const round3: Series = {
        id: "series-r3",
        slug: "runda-3",
        name: "Runda 3",
        startDate: nowPlus(days(2)),
        endDate: nowPlus(days(2) + hours(3)),
        isOpen: false,
    };

    // A round that is over, and still readable. `isOpen` is false because the
    // Server closed it, and its problems stay: a competitor goes back to what
    // they were solving, and nothing more is accepted.
    const round0Problems = [
        problemSummary("R", "Rozgrzewka", "solved", 100, 1),
        problemSummary("S", "Sumy prefiksowe", "partial", 60, 3),
    ];
    const round0: Series = {
        id: "series-r0",
        slug: "runda-0",
        name: "Runda 0 — rozgrzewkowa",
        startDate: nowPlus(-days(1)),
        endDate: nowPlus(-days(1) + hours(3)),
        isOpen: false,
        problemCount: round0Problems.length,
        problems: round0Problems,
    };

    series.set(contestId, [round0, round1, round2, round3]);
    for (const problem of round0Problems) {
        problems.set(`${contestId}/${problem.slug}`,
            problemDetail(round0.id, problem, "standard-io@1", only(loopsStatement)));
    }
    withheld.set(round2.id, r2Problems);

    problems.set(`${contestId}/A`, problemDetail(round1.id, r1Problems[0], "standard-io@1", [
        // Two languages, so the switcher above the statement has something to
        // switch to and the fallback path is exercised by every other problem.
        statement(graphConnectivityStatement),
        statement(graphConnectivityStatementEn, "en"),
    ], {
        samples: [
            { input: "4 3\n1 2\n2 3\n3 4", output: "TAK", explanation: "Wszystkie wierzchołki leżą na jednej ścieżce." },
            { input: "4 2\n1 2\n3 4", output: "NIE" },
        ],
        attachments: [
            { name: "testy-przykladowe.zip", mimeType: "application/zip", sizeBytes: 2048, url: "#", sha256: fakeSha("testy-przykladowe.zip") },
        ],
        submissionsLeft: 17,
    }));
    problems.set(`${contestId}/B`, problemDetail(round1.id, r1Problems[1], "standard-io@1", only(shortestPathStatement), {
        limits: { timeMs: 2000, memoryMb: 512 },
        samples: [{ input: "3 3 1 3\n1 2 5\n2 3 5\n1 3 11", output: "10" }],
        attachments: [
            { name: "graf-przyklad.png", mimeType: "image/png", sizeBytes: 8192, url: "#", sha256: fakeSha("graf-przyklad.png") },
        ],
        submissionsLeft: 15,
    }));
    problems.set(`${contestId}/C`, problemDetail(round1.id, r1Problems[2], "standard-io@1", only(topologicalSortStatement), {
        samples: [{ input: "3 2\n1 2\n2 3", output: "1 2 3" }],
        submissionsLeft: 18,
    }));
    problems.set(`${contestId}/D`, problemDetail(round1.id, r1Problems[3], "standard-io@1", only(topologicalSortStatement), {
        // The manager turned limits off for this one, so the screen must cope
        // with them being absent rather than rendering "undefined".
        limits: undefined,
        submissionsLeft: 20,
    }));

    const contestSubmissions: SubmissionSummary[] = [
        {
            id: "sub-1", problemId: "problem-A", problemSlug: "A", problemName: "Spójność grafu",
            seriesId: round1.id, submittedAt: nowPlus(-minutes(4)), language: "cpp",
            state: "queued",
        },
        {
            id: "sub-2", problemId: "problem-B", problemSlug: "B", problemName: "Najkrótsza ścieżka",
            seriesId: round1.id, submittedAt: nowPlus(-minutes(9)), language: "cpp",
            state: "running",
        },
        {
            id: "sub-3", problemId: "problem-A", problemSlug: "A", problemName: "Spójność grafu",
            seriesId: round1.id, submittedAt: nowPlus(-minutes(22)), language: "cpp",
            state: "completed", score: 100, maxScore: 100, verdict: "Accepted",
        },
        {
            id: "sub-4", problemId: "problem-B", problemSlug: "B", problemName: "Najkrótsza ścieżka",
            seriesId: round1.id, submittedAt: nowPlus(-minutes(35)), language: "cpp",
            state: "completed", score: 40, maxScore: 100, verdict: "Wrong answer",
        },
        {
            id: "sub-5", problemId: "problem-C", problemSlug: "C", problemName: "Sortowanie topologiczne",
            seriesId: round1.id, submittedAt: nowPlus(-minutes(48)), language: "python",
            state: "completed", score: 0, maxScore: 100, verdict: "Time limit exceeded",
        },
        {
            id: "sub-6", problemId: "problem-A", problemSlug: "A", problemName: "Spójność grafu",
            seriesId: round1.id, submittedAt: nowPlus(-minutes(63)), language: "cpp",
            state: "failed", verdict: "Compilation error",
        },
        {
            id: "sub-7", problemId: "problem-C", problemSlug: "C", problemName: "Sortowanie topologiczne",
            seriesId: round1.id, submittedAt: nowPlus(-minutes(77)), language: "java",
            state: "completed", score: 0, maxScore: 100, verdict: "Runtime error",
        },
    ];
    submissions.set(contestId, contestSubmissions);

    for (const s of contestSubmissions) {
        const finished = s.state === "completed" || s.state === "failed";
        submissionDetails.set(s.id, {
            ...s,
            problemType: "standard-io@1",
            authorName: "Amy Horsefighter",
            attempts: [
                {
                    id: `${s.id}-job-1`,
                    attempt: 1,
                    startedAt: s.submittedAt,
                    finishedAt: finished ? s.submittedAt : undefined,
                    state: s.state,
                    verdict: s.verdict,
                    score: s.score,
                },
            ],
            // Derived from the score so the table agrees with the verdict above
            // it. A fixture that says 100/100 next to three failed tests reads
            // as a rendering bug.
            detail: finished
                ? standardIoDetail(testsFor(s.score))
                : { kind: "standard-io", version: 1, tests: [] },
            files: [{ name: "main.cpp", language: "cpp" }],
        });
        submissionFiles.set(s.id, new Map([["main.cpp", sampleCode]]));
    }

    questions.set(contestId, [
        {
            id: "q-1", kind: "announcement", topic: "Runda 2 rozpoczyna się o 18:00",
            body: "Przypominamy, że przerwa trwa 30 minut. Stanowiska pozostają zablokowane.",
            authorName: "Tomasz Wiśniewski", createdAt: nowPlus(-minutes(15)),
            isPublished: true, isRead: false,
        },
        {
            id: "q-2", kind: "question", topic: "Błąd w treści zadania A",
            body: "Czy w zadaniu A graf może być pusty, to znaczy mieć zero krawędzi?",
            authorName: "Jan Kowalski", createdAt: nowPlus(-minutes(40)),
            seriesId: round1.id, seriesName: round1.name,
            problemId: "problem-A", problemSlug: "A", problemName: "Spójność grafu",
            isPublished: true, isRead: false,
            answer: {
                body: "Tak, m może wynosić zero. Wtedy graf jest spójny tylko dla n = 1.",
                authorName: "Tomasz Wiśniewski",
                answeredAt: nowPlus(-minutes(32)),
            },
        },
        {
            id: "q-3", kind: "question", topic: "Limit pamięci w zadaniu B",
            body: "Czy limit 512 MB dotyczy również stosu?",
            authorName: "Amy Horsefighter", createdAt: nowPlus(-minutes(55)),
            // A question about a problem always names its series: the problem is
            // in one, and a scope sort would otherwise put this row among the
            // activity-wide questions.
            seriesId: round1.id, seriesName: round1.name,
            problemId: "problem-B", problemSlug: "B", problemName: "Najkrótsza ścieżka",
            isPublished: false, isRead: true,
        },
        {
            id: "q-4", kind: "question", topic: "Czy można korzystać z własnych notatek?",
            body: "Pytanie ogólne, niezwiązane z konkretnym zadaniem.",
            authorName: "Amy Horsefighter", createdAt: nowPlus(-hours(3)),
            isPublished: false, isRead: true,
        },
        ...Array.from({ length: 10 }, (_, i): Question => ({
            id: `q-filler-${i}`,
            kind: i % 4 === 0 ? "announcement" : "question",
            topic: `Pytanie archiwalne nr ${i + 1}`,
            body: "Treść pytania archiwalnego, zachowana dla paginacji.",
            authorName: i % 2 === 0 ? "Jan Kowalski" : "Anna Nowak",
            createdAt: nowPlus(-hours(5) - hours(i)),
            isPublished: true,
            isRead: i % 3 !== 0,
            answer: i % 2 === 0
                ? { body: "Odpowiedź udzielona przez organizatora.", authorName: "Tomasz Wiśniewski", answeredAt: nowPlus(-hours(4) - hours(i)) }
                : undefined,
        })),
    ]);

    // Runda 0's own standing: a second started round, so the picker has two
    // besides the combined board.
    seriesRankings.set(round0.id, {
        format: "icpc",
        frozen: false,
        startedAt: round0.startDate,
        me: "team-7",
        problems: round0Problems.map(p => ({ id: p.id, slug: p.slug, name: p.name })),
        rows: [
            { rank: 1, id: "team-2", name: "Uniwersytet Warszawski 2", solved: 2, penalty: 74, cells: { R: { attempts: 1, acceptedAt: 12 }, S: { attempts: 2, acceptedAt: 42 } } },
            { rank: 2, id: "team-7", name: "Politechnika Poznańska 3", solved: 2, penalty: 96, cells: { R: { attempts: 1, acceptedAt: 18 }, S: { attempts: 3, acceptedAt: 58 } } },
            { rank: 3, id: "team-1", name: "Politechnika Poznańska 1", solved: 1, penalty: 31, cells: { R: { attempts: 2, acceptedAt: 31 }, S: { attempts: 4 } } },
        ],
    });

    // The combined board: **totals only**. The per-problem cells belong to the
    // round whose problems they are, and a contest of three rounds would
    // otherwise be thirty columns wide.
    rankings.set(contestId, {
        format: "icpc",
        frozen: false,
        me: "team-7",
        rows: [
            { rank: 1, id: "team-1", name: "Politechnika Poznańska 1", solved: 5, penalty: 343 },
            { rank: 2, id: "team-2", name: "Uniwersytet Warszawski 2", solved: 5, penalty: 275 },
            { rank: 3, id: "team-7", name: "Politechnika Poznańska 3", solved: 4, penalty: 250 },
            { rank: 4, id: "team-4", name: "AGH 1", solved: 2, penalty: 178 },
            { rank: 5, id: "team-5", name: "Uniwersytet Jagielloński 1", solved: 1, penalty: 45 },
        ],
    });

    seriesRankings.set(round1.id, {
        format: "icpc",
        frozen: true,
        freezeAt: nowPlus(-minutes(30)),
        revealAt: nowPlus(hours(1)),
        startedAt: round1.startDate,
        me: "team-7",
        problems: r1Problems.map(p => ({ id: p.id, slug: p.slug, name: p.name })),
        rows: [
            { rank: 1, id: "team-1", name: "Politechnika Poznańska 1", solved: 4, penalty: 312, cells: { A: { attempts: 1, acceptedAt: 12 }, B: { attempts: 2, acceptedAt: 54 }, C: { attempts: 1, acceptedAt: 88 }, D: { attempts: 3, acceptedAt: 118 } } },
            { rank: 2, id: "team-2", name: "Uniwersytet Warszawski 2", solved: 3, penalty: 201, cells: { A: { attempts: 1, acceptedAt: 9 }, B: { attempts: 1, acceptedAt: 61 }, C: { attempts: 4, acceptedAt: 71 }, D: { attempts: 2 } } },
            { rank: 3, id: "team-7", name: "Politechnika Poznańska 3", solved: 2, penalty: 154, cells: { A: { attempts: 3, acceptedAt: 74 }, B: { attempts: 5, pending: true }, C: { attempts: 2 }, D: {} } },
            { rank: 4, id: "team-4", name: "AGH 1", solved: 2, penalty: 178, cells: { A: { attempts: 2, acceptedAt: 41 }, B: { attempts: 1, acceptedAt: 117 }, C: {}, D: {} } },
            { rank: 5, id: "team-5", name: "Uniwersytet Jagielloński 1", solved: 1, penalty: 45, cells: { A: { attempts: 1, acceptedAt: 45 }, B: { attempts: 3 }, C: {}, D: {} } },
        ],
    });

    // ----------------------------------------------------------------- course

    const courseId = "018f2c00-0000-7000-8000-000000000002";
    activities.push({
        id: courseId,
        slug: "PROG-1-LA",
        name: "Programowanie 1 — grupa LA",
        type: "course@1",
        rankingType: "points",
        timeZone: "Europe/Warsaw",
        state: "ongoing",
        membership: "enrolled",
        startDate: nowPlus(-days(30)),
        endDate: nowPlus(days(60)),
        // The emailed-link case: a group of students enrol themselves with the
        // password their lecturer gave them.
        joinPolicy: "password",
        // A course where somebody sees their own standing and nobody else's: the
        // ranking is one row, without a place.
        scoreVisibility: "participantOnly",
        hideEndedSeriesProblems: false,
        modules: { questions: true },
        documents: [],
        props: [
            { key: "Prowadzący", value: "Jan Kowalski" },
            { key: "Grupa", value: "LA" },
        ],
    });

    const w1Problems = [
        problemSummary("petle", "Pętle i sumy", "solved", 100, 2),
        problemSummary("tablice", "Tablice", "solved", 80, 4),
    ];
    const w2Problems = [
        problemSummary("rekurencja", "Rekurencja", "partial", 50, 1),
        problemSummary("sortowanie", "Sortowanie", "untouched", undefined, 0),
    ];

    series.set(courseId, [
        {
            id: "series-w1", slug: "zajecia-1", name: "Zajęcia 1 — podstawy",
            startDate: nowPlus(-days(21)), endDate: nowPlus(-days(14)),
            isOpen: true, problemCount: 2, problems: w1Problems,
        },
        {
            id: "series-w2", slug: "zajecia-2", name: "Zajęcia 2 — rekurencja",
            startDate: nowPlus(-days(7)), endDate: nowPlus(days(2)),
            isOpen: true, problemCount: 2, problems: w2Problems,
        },
        {
            id: "series-w3", slug: "zajecia-3", name: "Zajęcia 3 — struktury danych",
            startDate: nowPlus(days(5)), endDate: nowPlus(days(12)),
            isOpen: false, problemCount: 2,
        },
    ]);

    problems.set(`${courseId}/petle`, problemDetail("series-w1", w1Problems[0], "standard-io@1", only(loopsStatement), {
        samples: [{ input: "5", output: "15" }],
    }));
    problems.set(`${courseId}/tablice`, problemDetail("series-w1", w1Problems[1], "standard-io@1", only(arraysStatement), {
        samples: [{ input: "4\n1 2 3 4", output: "4 3 2 1" }],
    }));
    problems.set(`${courseId}/rekurencja`, problemDetail("series-w2", w2Problems[0], "standard-io@1", only(loopsStatement)));
    problems.set(`${courseId}/sortowanie`, problemDetail("series-w2", w2Problems[1], "standard-io@1", only(arraysStatement)));

    submissions.set(courseId, [
        {
            id: "sub-c1", problemId: "problem-rekurencja", problemSlug: "rekurencja", problemName: "Rekurencja",
            seriesId: "series-w2", submittedAt: nowPlus(-days(1)), language: "python",
            state: "completed", score: 50, maxScore: 100, verdict: "Partially accepted",
        },
        {
            id: "sub-c2", problemId: "problem-petle", problemSlug: "petle", problemName: "Pętle i sumy",
            seriesId: "series-w1", submittedAt: nowPlus(-days(16)), language: "python",
            state: "completed", score: 100, maxScore: 100, verdict: "Accepted",
        },
    ]);
    for (const s of submissions.get(courseId)!) {
        submissionDetails.set(s.id, {
            ...s,
            problemType: "standard-io@1",
            authorName: "Amy Horsefighter",
            attempts: [{ id: `${s.id}-job-1`, attempt: 1, startedAt: s.submittedAt, finishedAt: s.submittedAt, state: s.state, verdict: s.verdict, score: s.score }],
            detail: standardIoDetail([
                { status: "OK", timeMs: 15, memoryMb: 8, score: 10 },
                { status: "OK", timeMs: 18, memoryMb: 8, score: 10 },
            ]),
            files: [{ name: "solution.py", language: "python" }],
        });
        submissionFiles.set(s.id, new Map([["solution.py", "n = int(input())\nprint(n * (n + 1) // 2)\n"]]));
    }

    questions.set(courseId, [
        {
            id: "q-c1", kind: "announcement", topic: "Termin oddania zadań z zajęć 2",
            body: "Zadania z zajęć 2 należy oddać do niedzieli. Zgłoszenia po terminie nie są przyjmowane.",
            authorName: "Jan Kowalski", createdAt: nowPlus(-days(2)),
            seriesId: "series-w2", seriesName: "Zajęcia 2 — rekurencja",
            isPublished: true, isRead: false,
        },
    ]);

    const classBoard = (
        id: string,
        name: string,
        columns: ProblemSummary[],
        rows: unknown[],
    ) => ({
        format: "points",
        frozen: false,
        me: "student-me",
        series: [{ id, name, problems: columns.map((p: ProblemSummary) => ({ slug: p.slug, name: p.name, maxScore: 100 })) }],
        activeSeriesId: id,
        rows,
    });
    seriesRankings.set("series-w1", classBoard("series-w1", "Zajęcia 1 — podstawy", w1Problems, [
        { rank: 1, id: "student-1", name: "Anna Nowak", solved: 2, total: 200, bySeries: { "series-w1": { total: 200, byProblem: { petle: 100, tablice: 100 } } } },
        { rank: 2, id: "student-me", name: "Amy Horsefighter", solved: 2, total: 180, bySeries: { "series-w1": { total: 180, byProblem: { petle: 100, tablice: 80 } } } },
        { rank: 3, id: "student-3", name: "Piotr Wiśniewski", solved: 1, total: 150, bySeries: { "series-w1": { total: 150, byProblem: { petle: 100, tablice: 50 } } } },
    ]));
    seriesRankings.set("series-w2", classBoard("series-w2", "Zajęcia 2 — rekurencja", w2Problems, [
        { rank: 1, id: "student-1", name: "Anna Nowak", solved: 2, total: 180, bySeries: { "series-w2": { total: 180, byProblem: { rekurencja: 100, sortowanie: 80 } } } },
        { rank: 2, id: "student-me", name: "Amy Horsefighter", solved: 1, total: 50, bySeries: { "series-w2": { total: 50, byProblem: { rekurencja: 50 } } } },
        { rank: 3, id: "student-3", name: "Piotr Wiśniewski", solved: 0, total: 0, bySeries: { "series-w2": { total: 0, byProblem: {} } } },
    ]));

    rankings.set(courseId, {
        format: "points",
        frozen: false,
        me: "student-me",
        series: [
            { id: "series-w1", name: "Zajęcia 1 — podstawy", problems: w1Problems.map(p => ({ slug: p.slug, name: p.name, maxScore: 100 })) },
            { id: "series-w2", name: "Zajęcia 2 — rekurencja", problems: w2Problems.map(p => ({ slug: p.slug, name: p.name, maxScore: 100 })) },
        ],
        activeSeriesId: "series-w2",
        rows: [
            { rank: 1, id: "student-1", name: "Anna Nowak", solved: 4, total: 380, bySeries: { "series-w1": { total: 200, byProblem: { petle: 100, tablice: 100 } }, "series-w2": { total: 180, byProblem: { rekurencja: 100, sortowanie: 80 } } } },
            { rank: 2, id: "student-me", name: "Amy Horsefighter", solved: 3, total: 230, bySeries: { "series-w1": { total: 180, byProblem: { petle: 100, tablice: 80 } }, "series-w2": { total: 50, byProblem: { rekurencja: 50 } } } },
            { rank: 3, id: "student-3", name: "Piotr Wiśniewski", solved: 2, total: 150, bySeries: { "series-w1": { total: 150, byProblem: { petle: 100, tablice: 50 } }, "series-w2": { total: 0, byProblem: {} } } },
        ],
    });

    // ------------------------------------------------ finished, open, unknown

    const finishedId = "018f2c00-0000-7000-8000-000000000003";
    activities.push({
        id: finishedId,
        slug: "AMMPZ-2018",
        name: "Akademickie Mistrzostwa Polski 2018",
        type: "contest@1",
        rankingType: "icpc",
        timeZone: "Europe/Warsaw",
        state: "finished",
        membership: "enrolled",
        startDate: nowPlus(-days(400)),
        endDate: nowPlus(-days(400) + hours(5)),
        joinPolicy: "closed",
        scoreVisibility: "everyone",
        hideEndedSeriesProblems: false,
        // Its standings were published and then closed: the state a participant
        // meets when the results have been taken down again.
        rankingVisibleTo: nowPlus(-days(1)),
        modules: { questions: false },
        documents: [],
        finalScore: 3,
        maxScore: 8,
        props: [{ key: "Miejsce", value: "12 / 64" }],
    });
    series.set(finishedId, []);
    // A finished contest still has a board. An activity whose module is switched
    // on must have something to serve, or the screen asks for a document that
    // does not exist.
    rankings.set(finishedId, {
        format: "icpc", frozen: false, me: "team-me",
        problems: [{ slug: "A", name: "Zadanie A" }, { slug: "B", name: "Zadanie B" }],
        rows: [
            { rank: 1, id: "team-x", name: "Uniwersytet Warszawski 1", solved: 2, penalty: 96, cells: { A: { attempts: 1, acceptedAt: 21 }, B: { attempts: 2, acceptedAt: 55 } } },
            { rank: 2, id: "team-me", name: "Politechnika Poznańska 3", solved: 1, penalty: 63, cells: { A: { attempts: 3, acceptedAt: 23 }, B: { attempts: 1 } } },
        ],
    });

    const openId = "018f2c00-0000-7000-8000-000000000004";
    activities.push({
        id: openId,
        slug: "TRENING-OTWARTY",
        name: "Trening otwarty — zadania archiwalne",
        type: "contest@1",
        rankingType: "points",
        timeZone: "Europe/Warsaw",
        state: "ongoing",
        // Joinable, not joined. The list is also how a participant finds this.
        membership: "open",
        // Anybody may join, and there is no password to type.
        joinPolicy: "open",
        scoreVisibility: "everyone",
        hideEndedSeriesProblems: false,
        // And these standings are not open yet, which is the other half of the
        // window: a participant is told when rather than shown an empty table.
        rankingVisibleFrom: nowPlus(hours(3)),
        modules: { questions: false },
        documents: [],
        props: [],
    });
    series.set(openId, []);
    // Nobody has solved anything yet, so the board is empty rather than absent.
    rankings.set(openId, { format: "points", frozen: false, series: [], rows: [] });

    // Deliberately unsupported, to prove the controlled fallback. Every screen
    // must render a notice for this activity rather than break.
    const unknownId = "018f2c00-0000-7000-8000-000000000005";
    activities.push({
        id: unknownId,
        slug: "WARSZTAT-9",
        name: "Warsztat interaktywny (nieobsługiwany typ)",
        type: "workshop@9",
        rankingType: "elimination@9",
        timeZone: "Europe/Warsaw",
        state: "ongoing",
        membership: "invited",
        startDate: nowPlus(-hours(1)),
        endDate: nowPlus(hours(4)),
        joinPolicy: "closed",
        scoreVisibility: "everyone",
        hideEndedSeriesProblems: false,
        modules: { questions: true },
        documents: [],
        props: [],
    });
    const unknownProblem = problemSummary("guess", "Zgadywanka", "untouched", undefined, 0);
    series.set(unknownId, [{
        id: "series-u1", slug: "etap-1", name: "Etap 1",
        startDate: nowPlus(-hours(1)), endDate: nowPlus(hours(4)),
        isOpen: true, problemCount: 1, problems: [unknownProblem],
    }]);
    problems.set(`${unknownId}/guess`, problemDetail("series-u1", unknownProblem, "interactive@9", [statement(JSON.stringify(unknownTypeStatement, null, 2))], {
        samples: undefined,
        submitFields: [],
    }));
    submissions.set(unknownId, []);
    questions.set(unknownId, []);
    rankings.set(unknownId, { format: "elimination", rows: [] });

    // ------------------------------------------- reached from a link, not a list

    // Unlisted and password-protected: it is in nobody's list until they are in
    // it, and the only way there is the address somebody was sent. The state the
    // share link exists for, and the one the enrolment form has to draw.
    const invitedId = "018f2c00-0000-7000-8000-000000000006";
    activities.push({
        id: invitedId,
        slug: "PROG-1-LB",
        name: "Programowanie 1 — grupa LB",
        type: "course@1",
        rankingType: "points",
        timeZone: "Europe/Warsaw",
        state: "ongoing",
        // Not in it. This is the one the enrolment form is for.
        membership: "open",
        joinPolicy: "password",
        // Nobody but a manager: no ranking entry at all.
        scoreVisibility: "managersOnly",
        hideEndedSeriesProblems: false,
        modules: { questions: true },
        documents: [],
        startDate: nowPlus(-days(20)),
        endDate: nowPlus(days(70)),
        props: [{ key: "Prowadzący", value: "Jan Kowalski" }],
    });
    const lbProblems = [problemSummary("petle", "Pętle i sumy", "untouched", undefined, 0)];
    series.set(invitedId, [{
        id: "series-lb1", slug: "zajecia-1", name: "Zajęcia 1 — podstawy",
        startDate: nowPlus(-days(14)), endDate: nowPlus(days(7)),
        isOpen: true, problemCount: 1, problems: lbProblems,
    }]);
    problems.set(`${invitedId}/petle`, problemDetail("series-lb1", lbProblems[0], "standard-io@1", only(loopsStatement)));
    submissions.set(invitedId, []);
    questions.set(invitedId, []);

    // Filler, so pagination is exercised rather than assumed.
    for (let i = 0; i < 6; i++) {
        const id = `018f2c00-0000-7000-8000-00000000001${i}`;
        activities.push({
            id,
            slug: `ARCHIWUM-${2010 + i}`,
            name: `Zawody archiwalne ${2010 + i}`,
            type: "contest@1",
            rankingType: "icpc",
            timeZone: "Europe/Warsaw",
            state: "finished",
            membership: "enrolled",
            startDate: nowPlus(-days(1000 + i * 365)),
            endDate: nowPlus(-days(1000 + i * 365) + hours(5)),
            joinPolicy: "closed",
            scoreVisibility: "everyone",
            hideEndedSeriesProblems: false,
            modules: { questions: false },
            documents: [],
            finalScore: i,
            maxScore: 8,
            props: [],
        });
        series.set(id, []);
    }

    return {
        activities, series, problems, submissions, submissionDetails,
        submissionFiles, questions, rankings, seriesRankings, withheld,
    };
};
