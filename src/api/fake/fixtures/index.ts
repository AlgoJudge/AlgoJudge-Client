import { StatementRef } from "../../FileApi";
import {
    Activity,
    ActivityState,
    ProblemDetail,
    ProblemStatus,
    ProblemSummary,
    Question,
    Series,
    SubmissionDetail,
    SubmissionSummary,
} from "../../ParticipantApi";
import { openByClock, seriesState } from "../../seriesState";
// Type-only, as `documents.ts` does it: the fixtures say what is stored and are
// handed the store rather than reaching for one of their own.
import type { FakeFiles } from "../FileApiFake";
import { attemptFiles, sourceFiles } from "./attachments";
import { fakeSha } from "./problems";
import {
    SeedActivity, SeedAssignment, SeedAttempt, SeedSeries, WORLD,
    attemptId, attemptTime, displayName, fractionOf, maxPointsOf, meOf, pointsOf,
} from "./world";
import { languageLabel } from "../../../components/editor/languages";

export { OPENING_SERIES_DELAY } from "./world";

/**
 * The dataset the fake API serves, projected from the seed.
 *
 * This file used to **state** every activity, beside `fixtures/activities.ts`
 * stating the same ones for the manager. The two disagreed — about the contest's
 * name, its rounds, the problems in them — and every "the manager changed it and
 * the participant never saw it" defect came from that. Both are projections of
 * `world.ts` now.
 *
 * What a participant sees that a manager does not — a problem's status, a best
 * score, how many submissions are left — is **derived from the reader's own
 * attempts**, which is the same record the submissions list and the board are
 * built from. A summary claiming five attempts beside a list holding two is a
 * shape this can no longer take.
 */

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
    /** Problems whose series has not opened yet, held back until it does. */
    withheld: Map<string, ProblemSummary[]>;
    /**
     * The seed each activity was projected from, keyed by activity id.
     *
     * Kept so the boards can be **computed when asked** rather than prepared at
     * load: the combined board is the rounds whose window is open, and one
     * assembled this morning would still not hold the round whose window opens
     * at six.
     */
    seeds: Map<string, SeedActivity>;
}

/**
 * What the reader made of one problem, from what they sent at it.
 *
 * Judged on the Runner's scale — full marks is full marks whatever the problem
 * counts for — and only the numbers beside it are rescaled.
 */
const statusOf = (attempts: SeedAttempt[]): ProblemStatus => {
    if (attempts.length === 0) return "untouched";
    const best = Math.max(...attempts.map(attempt => fractionOf(attempt) ?? 0));
    // The whole of the scale is a solve, whatever that scale is.
    if (best >= 1) return "solved";
    return best > 0 ? "partial" : "attempted";
};

// Compared as fractions: two attempts at one problem may have been marked out
// of different maxima.
const bestOf = (attempts: SeedAttempt[]): number | undefined =>
    attempts.length === 0 ? undefined : Math.max(...attempts.map(attempt => fractionOf(attempt) ?? 0));

/** Where the activity has one, the state its dates put it in. */
const stateOf = (activity: SeedActivity, now: number): ActivityState => {
    if (activity.endDate !== undefined && Date.parse(activity.endDate) <= now) return "finished";
    if (activity.startDate !== undefined && Date.parse(activity.startDate) > now) return "upcoming";
    return "ongoing";
};

export const createDataset = (files: FakeFiles): Dataset => {
    const now = Date.now();
    const activities: Activity[] = [];
    const series = new Map<string, Series[]>();
    const problems = new Map<string, ProblemDetail>();
    const submissions = new Map<string, SubmissionSummary[]>();
    const submissionDetails = new Map<string, SubmissionDetail>();
    const submissionFiles = new Map<string, Map<string, string>>();
    const questions = new Map<string, Question[]>();
    const withheld = new Map<string, ProblemSummary[]>();
    const seeds = new Map<string, SeedActivity>();

    /**
     * Stores a statement and answers with the reference the participant gets.
     *
     * The fixtures used to hand the text straight to the screen. They store it
     * now, because that is where it comes from — the same file the manager
     * uploaded, read back by id. A fake that skipped the store could not be
     * wrong in the way the real one can.
     */
    const statement = (
        activity: SeedActivity,
        assignment: SeedAssignment,
        text: string,
        language?: string,
    ): StatementRef => {
        // Named by where it is used, not by what it holds: one library problem
        // is attached in several places, and one name would make them one file.
        // A statement is Markdown unless the problem says otherwise. The one that
        // says otherwise arrived by import and has a PDF and nothing else.
        const pdf = assignment.problem.statementIsPdf === true && language === undefined;
        const leaf = pdf ? "content.pdf" : language ? `content-${language}.md` : "content.md";
        const name = `${activity.id}/${assignment.slug}/${leaf}`;
        const stored = files.seedText(name, pdf ? "application/pdf" : "text/markdown", text);
        return { name: leaf, language, fileId: stored.id, sha256: stored.sha256, sizeBytes: stored.sizeBytes };
    };

    for (const activity of WORLD) {
        seeds.set(activity.id, activity);
        const me = meOf(activity);

        activities.push({
            id: activity.id,
            slug: activity.slug,
            name: activity.name,
            type: activity.type,
            rankingType: activity.rankingType,
            timeZone: activity.timeZone,
            state: stateOf(activity, now),
            membership: activity.membership,
            startDate: activity.startDate,
            endDate: activity.endDate,
            joinPolicy: activity.joinPolicy,
            scoreVisibility: activity.scoreVisibility,
            hideEndedSeriesProblems: activity.hideEndedSeriesProblems,
            modules: activity.modules,
            // Filled in from `FakeActivities`, which is where an activity's
            // documents live: the manager screen publishes into it and this side
            // serves what is there, so the two cannot come to disagree.
            documents: [],
            props: activity.props ?? [],
        });

        // ─────────────────────────────────────────────────────────── series
        const list: Series[] = [];
        for (const seed of activity.series) {
            // Two steps, in the Server's order: the scheduler decides whether
            // the round is open, and everything else reads that decision. One
            // step computing the state from the dates would be the Client
            // deciding for itself what the Server stores.
            const isOpen = openByClock(seed, now);
            const state = seriesState({ ...seed, isOpen }, now);
            const summaries = seed.assignments.map((assignment): ProblemSummary => {
                const mine = (seed.attempts ?? []).filter(attempt =>
                    attempt.contestant === me?.id && attempt.problem === assignment.slug);
                return {
                    id: `problem-${assignment.slug}`,
                    slug: assignment.slug,
                    name: displayName(assignment),
                    status: statusOf(mine),
                    // On the assignment's scale: 80 out of the Runner's hundred
                    // is 40 where the problem is worth 50.
                    bestScore: pointsOf(assignment, bestOf(mine)),
                    maxScore: maxPointsOf(assignment),
                    attempts: mine.length,
                };
            });

            // A round that has not started discloses nothing — at most how many
            // problems it holds, and only where the manager allowed that. The
            // ones it holds wait in `withheld` until its start passes.
            const upcoming = state === "upcoming";
            if (upcoming) withheld.set(seed.id, summaries);

            list.push({
                id: seed.id,
                slug: seed.slug,
                name: seed.name,
                startDate: seed.startDate,
                endDate: seed.endDate,
                isOpen,
                // The window travels; the freeze does not. Telling a participant
                // when the board stopped moving would announce exactly what the
                // freeze is hiding, so the Server keeps that instant.
                rankingVisibleFrom: seed.rankingVisibleFrom,
                rankingVisibleTo: seed.rankingVisibleTo,
                problemCount: upcoming && !seed.revealProblemCount ? undefined : summaries.length,
                problems: upcoming ? undefined : summaries,
            });

            // ───────────────────────────────────────────────────── problems
            for (const assignment of seed.assignments) {
                const summary = summaries.find(s => s.slug === assignment.slug)!;
                const ceiling = assignment.maxSubmissions ?? activity.maxSubmissionsPerProblem;
                problems.set(`${activity.id}/${assignment.slug}`, {
                    id: summary.id,
                    slug: assignment.slug,
                    name: displayName(assignment),
                    type: assignment.problem.type ?? "standard-io@1",
                    seriesId: seed.id,
                    status: summary.status,
                    bestScore: summary.bestScore,
                    maxScore: summary.maxScore,
                    attempts: summary.attempts,
                    statements: [
                        statement(activity, assignment, assignment.problem.statement),
                        ...Object.entries(assignment.problem.translations ?? {}).map(([language, text]) =>
                            statement(activity, assignment, text, language)),
                    ],
                    attachments: (assignment.problem.attachments ?? []).map(file => ({
                        ...file, url: "#", sha256: fakeSha(file.name),
                    })),
                    samples: assignment.problem.samples,
                    // **The three documents, projected from the seed's one
                    // list.** `config` is what the Runner refuses against,
                    // `spec` is what the select offers, `props` is what a
                    // header reads out. They agree here; a fixture where they
                    // disagreed would be describing a misconfigured assignment.
                    config: {
                        type: assignment.problem.type ?? "standard-io@1",
                        languages: activity.languages,
                        limits: assignment.problem.limits
                            ?? { timeMs: 1000, memoryBytes: 256 * 1024 * 1024 },
                        // **Both axes, because the screen has to show both and
                        // one of them is easy to get wrong.** Group 2 states its
                        // own time, so it is judged under that whatever language
                        // the solution is in — and the per-language row below
                        // reaches only the groups that state none. A fixture
                        // with one axis would let that mistake ship.
                        groups: [
                            { group: 0, points: 0, examples: true },
                            { group: 1, points: 40 },
                            { group: 2, points: 60, limits: { timeMs: 4000 } },
                        ],
                        overrideLimits: { python: { timeMs: 3000 } },
                    },
                    spec: {
                        type: assignment.problem.type ?? "standard-io@1",
                        languages: activity.languages,
                    },
                    props: {
                        type: assignment.problem.type ?? "standard-io@1",
                        languages: activity.languages
                            .map(id => languageLabel(assignment.problem.type, id))
                            .join(", "),
                    },
                    maxUploadBytes: assignment.maxUploadBytes ?? activity.maxUploadBytes,
                    // What is left, not what the ceiling is: counted off the same
                    // attempts the list is built from.
                    submissionsLeft: ceiling === undefined ? undefined : Math.max(0, ceiling - summary.attempts),
                    submitFields: assignment.problem.submitFields ?? [
                        { kind: "code", name: "source", label: "Kod źródłowy" },
                        { kind: "file", name: "file", label: "Plik z rozwiązaniem", accept: [".cpp", ".py", ".java", ".zip"] },
                    ],
                });
            }
        }
        series.set(activity.id, list);

        // ────────────────────────────────────────────────────── submissions
        const mine: SubmissionSummary[] = [];
        for (const seed of activity.series) {
            for (const attempt of seed.attempts ?? []) {
                if (attempt.contestant !== me?.id) continue;
                const assignment = seed.assignments.find(a => a.slug === attempt.problem);
                if (!assignment) continue;
                const finished = attempt.state === "completed" || attempt.state === "failed";
                const summary: SubmissionSummary = {
                    id: attemptId(seed.id, attempt),
                    problemId: `problem-${assignment.slug}`,
                    problemSlug: assignment.slug,
                    problemName: displayName(assignment),
                    seriesId: seed.id,
                    submittedAt: attemptTime(seed, attempt),
                    state: attempt.state,
                    verdict: attempt.verdict,
                    score: pointsOf(assignment, fractionOf(attempt)),
                    maxScore: attempt.score === undefined ? undefined : maxPointsOf(assignment),
                };
                mine.push(summary);

                submissionDetails.set(summary.id, {
                    ...summary,
                    problemType: assignment.problem.type ?? "standard-io@1",
                    authorName: me?.userName ?? "",
                    attempts: [{
                        id: `${summary.id}-job-1`,
                        attempt: 1,
                        startedAt: summary.submittedAt,
                        finishedAt: finished ? summary.submittedAt : undefined,
                        state: summary.state,
                        verdict: summary.verdict,
                        score: summary.score,
                        // Everything the Runner attached. The filtering happens
                        // where the data leaves — `getSubmission` — so a manager
                        // changing the table changes what yesterday's
                        // submissions show, which is what a manager expects.
                        files: attemptFiles(files, seed, attempt),
                    }],
                    files: sourceFiles(files, seed, attempt),
                });
            }
        }
        // Newest first, which is the order both the screen and the panel read.
        mine.sort((a, b) => Date.parse(b.submittedAt) - Date.parse(a.submittedAt));
        submissions.set(activity.id, mine);

        questions.set(activity.id, questionsFor(activity));
    }

    return {
        activities, series, problems, submissions, submissionDetails,
        submissionFiles, questions, withheld, seeds,
    };
};

// ───────────────────────────────────────────────────────────────── questions

/**
 * Questions and announcements, still written by hand.
 *
 * They are not doubly stated — the manager's list and this one are two views of
 * one conversation and neither derives the other — so they stay as prose. What
 * they do have to agree with is which round they hang off, which is why the
 * series ids come from the seed.
 */
const questionsFor = (activity: SeedActivity): Question[] => {
    const round1 = activity.series.find(s => s.id === "series-r1");
    const week2 = activity.series.find(s => s.id === "series-w2");
    const minutesAgo = (n: number) => new Date(Date.now() - n * 60000).toISOString();
    const hoursAgo = (n: number) => minutesAgo(n * 60);
    // Read from the seed, not written out: a question naming a problem has to
    // name it the way the screen does, and a manager who renames an assignment
    // renames it everywhere it is quoted.
    const named = (series: SeedSeries | undefined, slug: string): string => {
        const assignment = series?.assignments.find(a => a.slug === slug);
        return assignment ? displayName(assignment) : slug;
    };

    if (round1) {
        return [
            {
                id: "q-1", kind: "announcement", topic: "Runda 2 rozpoczyna się o 18:00",
                body: "Przypominamy, że przerwa trwa 30 minut. Stanowiska pozostają zablokowane.",
                authorName: "Tomasz Wiśniewski", createdAt: minutesAgo(15),
                isPublished: true, isRead: false,
            },
            {
                id: "q-2", kind: "question", topic: "Błąd w treści zadania A",
                body: "Czy w zadaniu A graf może być pusty, to znaczy mieć zero krawędzi?",
                authorName: "Jan Kowalski", createdAt: minutesAgo(40),
                seriesId: round1.id, seriesName: round1.name,
                problemId: "problem-A", problemSlug: "A", problemName: named(round1, "A"),
                isPublished: true, isRead: false,
                answer: {
                    body: "Tak, m może wynosić zero. Wtedy graf jest spójny tylko dla n = 1.",
                    authorName: "Tomasz Wiśniewski",
                    answeredAt: minutesAgo(32),
                },
            },
            {
                id: "q-3", kind: "question", topic: "Limit pamięci w zadaniu B",
                body: "Czy limit 512 MB dotyczy również stosu?",
                authorName: "Amy Horsefighter", createdAt: minutesAgo(55),
                // A question about a problem always names its series: the problem
                // is in one, and a scope sort would otherwise put this row among
                // the activity-wide questions.
                seriesId: round1.id, seriesName: round1.name,
                problemId: "problem-B", problemSlug: "B", problemName: named(round1, "B"),
                isPublished: false, isRead: true,
            },
            {
                id: "q-4", kind: "question", topic: "Czy można korzystać z własnych notatek?",
                body: "Pytanie ogólne, niezwiązane z konkretnym zadaniem.",
                authorName: "Amy Horsefighter", createdAt: hoursAgo(3),
                isPublished: false, isRead: true,
            },
            ...Array.from({ length: 10 }, (_, i): Question => ({
                id: `q-filler-${i}`,
                kind: i % 4 === 0 ? "announcement" : "question",
                topic: `Pytanie archiwalne nr ${i + 1}`,
                body: "Treść pytania archiwalnego, zachowana dla paginacji.",
                authorName: i % 2 === 0 ? "Jan Kowalski" : "Anna Nowak",
                createdAt: hoursAgo(5 + i),
                isPublished: true,
                isRead: i % 3 !== 0,
                answer: i % 2 === 0
                    ? { body: "Odpowiedź udzielona przez organizatora.", authorName: "Tomasz Wiśniewski", answeredAt: hoursAgo(4 + i) }
                    : undefined,
            })),
        ];
    }

    if (week2) {
        return [{
            id: "q-c1", kind: "announcement", topic: "Termin oddania zadań z zajęć 2",
            body: "Zadania z zajęć 2 należy oddać do niedzieli. Zgłoszenia po terminie nie są przyjmowane.",
            authorName: "Jan Kowalski", createdAt: hoursAgo(48),
            seriesId: week2.id, seriesName: week2.name,
            isPublished: true, isRead: false,
        }];
    }

    return [];
};

/** One round of one activity, paired with what the seed says about it. */
export const seedSeriesOf = (seed: SeedActivity, seriesId: string): SeedSeries | undefined =>
    seed.series.find(s => s.id === seriesId);
