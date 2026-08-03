import { ParticipantEventDispatcherImpl } from "../impl/ParticipantEventDispatcher";
import {
    Activity,
    ActivityFilter,
    AskQuestionInput,
    JobState,
    Page,
    ParticipantApi,
    ProblemDetail,
    Question,
    QuestionFilter,
    Series,
    SubmissionDetail,
    SubmissionFilter,
    SubmissionSummary,
    SubmitPayload,
} from "../ParticipantApi";
import { createDataset, Dataset, OPENING_SERIES_DELAY } from "./fixtures";
import { Utils } from "./Utils";

const DEFAULT_PAGE_SIZE = 5;

/** Server-side paging, simulated. Views must not slice a full list themselves. */
const paginate = <T>(items: T[], page = 1, pageSize = DEFAULT_PAGE_SIZE): Page<T> => {
    const first = pageSize * (page - 1);
    return {
        items: items.slice(first, first + pageSize),
        total: items.length,
        page,
        pageSize,
    };
};

const notFound = (what: string): never => Utils.throwError(`${what} does not exist`);

/**
 * Holds the fake state and runs a small scripted timeline over it.
 *
 * The timeline exists because four screens are specified as refreshed by
 * WebSocket events. If the fake never dispatched, that behaviour would not be
 * built until a Server existed to dispatch — which is the wrong order to
 * discover a bug in it.
 */
class FakeParticipantState {
    private readonly data: Dataset = createDataset();
    private readonly timers: ReturnType<typeof setTimeout>[] = [];
    private started = false;

    constructor(private readonly events: ParticipantEventDispatcherImpl) {}

    dataset(): Dataset {
        this.start();
        return this.data;
    }

    /** Started on first use rather than in the constructor, so an unused fake stays idle. */
    private start(): void {
        if (this.started) return;
        this.started = true;

        const contest = this.data.activities[0];

        // A queued submission works its way through the states.
        this.after(6000, () => this.setSubmissionState(contest.id, "sub-1", "running"));
        this.after(15000, () => this.completeSubmission(contest.id, "sub-1", 100, "Accepted"));
        this.after(9000, () => this.completeSubmission(contest.id, "sub-2", 65, "Partially accepted"));

        // The closed round reaches its start and reveals what it was holding.
        this.after(OPENING_SERIES_DELAY, () => this.openSeries(contest.id, "series-r2"));

        // A pending question is answered.
        this.after(20000, () => this.answerQuestion(contest.id, "q-3"));
    }

    private after(ms: number, f: () => void): void {
        this.timers.push(setTimeout(f, ms));
    }

    private setSubmissionState(activityId: string, submissionId: string, state: JobState): void {
        const summary = this.data.submissions.get(activityId)?.find(s => s.id === submissionId);
        const detail = this.data.submissionDetails.get(submissionId);
        if (!summary || !detail) return;
        summary.state = state;
        detail.state = state;
        detail.attempts[0].state = state;
        this.events.dispatchEvent({
            type: "submissionStateChanged",
            data: { activityId, submission: { ...summary } },
        });
    }

    private completeSubmission(activityId: string, submissionId: string, score: number, verdict: string): void {
        const summary = this.data.submissions.get(activityId)?.find(s => s.id === submissionId);
        const detail = this.data.submissionDetails.get(submissionId);
        if (!summary || !detail) return;

        summary.state = "completed";
        summary.score = score;
        summary.maxScore = 100;
        summary.verdict = verdict;

        Object.assign(detail, {
            state: summary.state,
            score,
            maxScore: 100,
            verdict,
        });
        detail.attempts[0] = {
            ...detail.attempts[0],
            state: "completed",
            finishedAt: new Date().toISOString(),
            verdict,
            score,
        };
        detail.detail = {
            kind: "standard-io",
            version: 1,
            limits: { timeMs: 1000, memoryMb: 256 },
            tests: Array.from({ length: 4 }, (_, i) => ({
                no: i + 1,
                status: score === 100 || i === 0 ? "OK" : "ERROR",
                timeMs: 20 + i * 5,
                memoryMb: 12,
                score: score === 100 || i === 0 ? 10 : 0,
                maxScore: 10,
                note: score === 100 || i === 0 ? "" : "Zła odpowiedź",
            })),
        };

        this.events.dispatchEvent({
            type: "submissionStateChanged",
            data: { activityId, submission: { ...summary } },
        });
        this.updateProblemStatus(activityId, summary.problemSlug, score);
        this.events.dispatchEvent({ type: "rankingChanged", data: { activityId } });
    }

    private updateProblemStatus(activityId: string, problemSlug: string, score: number): void {
        for (const s of this.data.series.get(activityId) ?? []) {
            const problem = s.problems?.find(p => p.slug === problemSlug);
            if (!problem) continue;
            problem.attempts += 1;
            if (problem.bestScore === undefined || score > problem.bestScore) {
                problem.bestScore = score;
            }
            problem.status = problem.bestScore === 0 ? "attempted"
                : problem.bestScore >= (problem.maxScore ?? 100) ? "solved"
                : "partial";
            this.events.dispatchEvent({
                type: "problemStatusChanged",
                data: { activityId, problem: { ...problem } },
            });
            return;
        }
    }

    private openSeries(activityId: string, seriesId: string): void {
        const target = this.data.series.get(activityId)?.find(s => s.id === seriesId);
        if (!target || target.isOpen) return;
        target.isOpen = true;
        target.problems = this.data.withheld.get(seriesId) ?? [];
        this.data.withheld.delete(seriesId);
        this.events.dispatchEvent({
            type: "sectionOpened",
            data: { activityId, series: { ...target } },
        });
    }

    private answerQuestion(activityId: string, questionId: string): void {
        const question = this.data.questions.get(activityId)?.find(q => q.id === questionId);
        if (!question) return;
        question.answer = {
            body: "Limit pamięci obejmuje cały proces, ze stosem włącznie.",
            authorName: "Tomasz Wiśniewski",
            answeredAt: new Date().toISOString(),
        };
        question.isPublished = true;
        question.isRead = false;
        this.events.dispatchEvent({
            type: "questionAnswered",
            data: { activityId, question: { ...question } },
        });
    }

    /** Puts a freshly submitted solution through the same lifecycle. */
    scheduleEvaluation(activityId: string, submissionId: string): void {
        this.after(2500, () => this.setSubmissionState(activityId, submissionId, "running"));
        this.after(7000, () => this.completeSubmission(activityId, submissionId, 100, "Accepted"));
    }
}

export class ParticipantApiFake implements ParticipantApi {
    readonly eventDispatcher: ParticipantEventDispatcherImpl = new ParticipantEventDispatcherImpl();
    private readonly state = new FakeParticipantState(this.eventDispatcher);

    constructor(private sleepMs: number = 300) {}

    async getActivities(filter: ActivityFilter, signal: AbortSignal): Promise<Page<Activity>> {
        await this.settle(signal);
        const { activities } = this.state.dataset();
        const states = filter.states ?? [];
        const types = filter.types ?? [];
        const matched = activities.filter(a =>
            (states.length === 0 || states.includes(a.state)) &&
            (types.length === 0 || types.includes(a.type.split("@")[0])));
        return paginate(matched, filter.page, filter.pageSize);
    }

    async getActivity(idOrSlug: string, signal: AbortSignal): Promise<Activity> {
        await this.settle(signal);
        const { activities } = this.state.dataset();
        return activities.find(a => a.id === idOrSlug || a.slug === idOrSlug)
            ?? notFound("Activity");
    }

    async getSeries(activityId: string, signal: AbortSignal): Promise<Series[]> {
        await this.settle(signal);
        return this.state.dataset().series.get(activityId) ?? [];
    }

    async getProblem(activityId: string, problemSlug: string, signal: AbortSignal): Promise<ProblemDetail> {
        await this.settle(signal);
        return this.state.dataset().problems.get(`${activityId}/${problemSlug}`)
            ?? notFound("Problem");
    }

    async getSubmissions(activityId: string, filter: SubmissionFilter, signal: AbortSignal): Promise<Page<SubmissionSummary>> {
        await this.settle(signal);
        const all = this.state.dataset().submissions.get(activityId) ?? [];
        const states = filter.states ?? [];
        const matched = all.filter(s =>
            (!filter.problemId || s.problemId === filter.problemId) &&
            (!filter.seriesId || s.seriesId === filter.seriesId) &&
            (states.length === 0 || states.includes(s.state)));
        return paginate(matched, filter.page, filter.pageSize ?? 10);
    }

    // The activity is part of the route and of the real endpoint's authorisation,
    // but the fake keeps submissions in one map keyed by id, so it goes unused.
    async getSubmission(_activityId: string, submissionId: string, signal: AbortSignal): Promise<SubmissionDetail> {
        await this.settle(signal);
        return this.state.dataset().submissionDetails.get(submissionId) ?? notFound("Submission");
    }

    async getSubmissionFile(_activityId: string, submissionId: string, name: string, signal: AbortSignal): Promise<string> {
        await this.settle(signal);
        return this.state.dataset().submissionFiles.get(submissionId)?.get(name) ?? notFound("File");
    }

    async submit(activityId: string, problemSlug: string, payload: SubmitPayload, signal: AbortSignal): Promise<SubmissionSummary> {
        await this.settle(signal);
        const data = this.state.dataset();
        const problem = data.problems.get(`${activityId}/${problemSlug}`) ?? notFound("Problem");

        const id = `sub-${Math.random().toString(36).slice(2, 10)}`;
        const fileName = payload.file?.name ?? `solution.${payload.language ?? "txt"}`;
        const summary: SubmissionSummary = {
            id,
            problemId: problem.id,
            problemSlug: problem.slug,
            problemName: problem.name,
            seriesId: problem.seriesId,
            submittedAt: new Date().toISOString(),
            language: payload.language,
            state: "queued",
        };

        data.submissions.set(activityId, [summary, ...(data.submissions.get(activityId) ?? [])]);
        data.submissionDetails.set(id, {
            ...summary,
            authorName: "Amy Horsefighter",
            attempts: [{ id: `${id}-job-1`, attempt: 1, startedAt: summary.submittedAt, state: "queued" }],
            detail: { kind: "standard-io", version: 1, tests: [] },
            files: [{ name: fileName, language: payload.language }],
        });
        data.submissionFiles.set(id, new Map([[fileName, payload.code ?? "// wysłano jako plik"]]));

        this.eventDispatcher.dispatchEvent({
            type: "submissionStateChanged",
            data: { activityId, submission: { ...summary } },
        });
        this.state.scheduleEvaluation(activityId, id);
        return summary;
    }

    async getRanking(activityId: string, signal: AbortSignal): Promise<unknown> {
        await this.settle(signal);
        return this.state.dataset().rankings.get(activityId) ?? notFound("Ranking");
    }

    async getQuestions(activityId: string, filter: QuestionFilter, signal: AbortSignal): Promise<Page<Question>> {
        await this.settle(signal);
        const all = this.state.dataset().questions.get(activityId) ?? [];
        const search = filter.search?.trim().toLowerCase();
        // Filtering happens before paging. The reverse — which the old screen
        // did — silently filters only the page that happens to be visible.
        const matched = all.filter(q =>
            (!search || q.topic.toLowerCase().includes(search)) &&
            (!filter.kind || q.kind === filter.kind) &&
            (!filter.seriesId || q.seriesId === filter.seriesId) &&
            (!filter.problemId || q.problemId === filter.problemId));

        const direction = filter.direction === "asc" ? 1 : -1;
        const sorted = [...matched].sort((a, b) => {
            switch (filter.sort) {
                case "topic": return direction * a.topic.localeCompare(b.topic);
                case "author": return direction * a.authorName.localeCompare(b.authorName);
                default: return direction * a.createdAt.localeCompare(b.createdAt);
            }
        });
        return paginate(sorted, filter.page, filter.pageSize ?? 10);
    }

    async askQuestion(activityId: string, input: AskQuestionInput, signal: AbortSignal): Promise<Question> {
        await this.settle(signal);
        const data = this.state.dataset();
        const problem = input.problemId
            ? [...data.problems.values()].find(p => p.id === input.problemId)
            : undefined;
        const question: Question = {
            id: `q-${Math.random().toString(36).slice(2, 10)}`,
            kind: "question",
            topic: input.topic,
            body: input.body,
            authorName: "Amy Horsefighter",
            createdAt: new Date().toISOString(),
            seriesId: input.seriesId ?? problem?.seriesId,
            problemId: problem?.id,
            problemSlug: problem?.slug,
            problemName: problem?.name,
            // A question reaches other participants only once a manager
            // publishes it, so it starts unpublished.
            isPublished: false,
            isRead: true,
        };
        data.questions.set(activityId, [question, ...(data.questions.get(activityId) ?? [])]);
        return question;
    }

    async markQuestionRead(activityId: string, questionId: string, signal: AbortSignal): Promise<void> {
        await this.settle(signal);
        const question = this.state.dataset().questions.get(activityId)?.find(q => q.id === questionId);
        if (question) question.isRead = true;
    }

    async getRules(activityId: string, signal: AbortSignal): Promise<unknown> {
        await this.settle(signal);
        return this.state.dataset().rules.get(activityId) ?? notFound("Rules");
    }

    /** Latency, then the abort check — so a cancelled view never sees a result. */
    private async settle(signal: AbortSignal): Promise<void> {
        await Utils.sleep(this.sleepMs);
        signal.throwIfAborted();
    }
}
