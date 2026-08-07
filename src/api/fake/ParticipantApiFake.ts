import { ParticipantEventDispatcherImpl } from "../impl/ParticipantEventDispatcher";
import {
    Activity,
    ActivityFilter,
    AskQuestionInput,
    EnrolInput,
    JobState,
    Page,
    ParticipantApi,
    ProblemDetail,
    Question,
    QuestionFilter,
    Series,
    SubmissionDetail,
    SubmissionFilter,
    SeriesChange,
    SubmissionSummary,
    SubmitPayload,
} from "../ParticipantApi";
import { FakeActivities, SeriesRelay } from "./FakeActivities";
import { maySubmit, mayReadProblems } from "../seriesState";
import { FakeFiles } from "./FileApiFake";
import { createDataset, Dataset, OPENING_SERIES_DELAY } from "./fixtures";
import { board, BoardPart } from "./fixtures/scoreboard";
import { ForbiddenError } from "../ApiError";
import { Utils } from "./Utils";
import { sha256 } from "../../utils/sha256";

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

/**
 * Everything leaves the fake as a copy.
 *
 * Without this the fake hands out the very objects it goes on to mutate, and a
 * view that stores one in state gets an object that changes underneath it. React
 * then compares the new value to the old, finds the same reference, and skips the
 * render — so a screen silently stops updating while the data behind it moves.
 * A real HTTP API cannot do that; a fake that can is lying about the contract.
 */
const copy = <T>(value: T): T => structuredClone(value);

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
    private readonly data: Dataset;
    private readonly timers: ReturnType<typeof setTimeout>[] = [];
    private started = false;

    constructor(
        private readonly events: ParticipantEventDispatcherImpl,
        files: FakeFiles,
        shared: FakeActivities,
    ) {
        this.data = createDataset(files);
        shared.onSeriesChanged(relay => this.applyRelay(relay));
    }

    dataset(): Dataset {
        this.start();
        return this.data;
    }

    /** Started on first use rather than in the constructor, so an unused fake stays idle. */
    private start(): void {
        if (this.started) return;
        this.started = true;

        const contest = this.data.activities[0];

        // A queued submission works its way through the states, and a running one
        // finishes. Found by their state rather than named: the ids come from
        // where an attempt sits in the seed, and a screen watching a hard-coded
        // one would go quiet the day somebody reorders a round.
        const unfinished = (state: JobState) =>
            this.data.submissions.get(contest.id)?.find(s => s.state === state)?.id;
        const queued = unfinished("queued");
        const running = unfinished("running");

        if (queued) {
            this.after(6000, () => this.setSubmissionState(contest.id, queued, "running"));
            this.after(15000, () => this.completeSubmission(contest.id, queued, 100, "Accepted"));
        }
        if (running) {
            this.after(9000, () => this.completeSubmission(contest.id, running, 65, "Partially accepted"));
        }

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

    /**
     * What a problem's standing becomes, from a result that just arrived.
     *
     * `score` absent means nothing has been judged yet — a submission was only
     * made. **The attempt is counted here, on the submission**, not when the
     * judging finishes: an attempt is something somebody did, and counting it on
     * the verdict left the badge saying two while the list held three, and
     * counted a seeded submission a second time the moment its Runner replied.
     */
    private updateProblemStatus(activityId: string, problemSlug: string, score?: number): void {
        for (const s of this.data.series.get(activityId) ?? []) {
            const problem = s.problems?.find(p => p.slug === problemSlug);
            if (!problem) continue;
            if (score === undefined) {
                problem.attempts += 1;
                if (problem.status === "untouched") problem.status = "attempted";
            } else if (problem.bestScore === undefined || score > problem.bestScore) {
                problem.bestScore = score;
            }
            if (problem.bestScore !== undefined) {
                problem.status = problem.bestScore === 0 ? "attempted"
                    : problem.bestScore >= (problem.maxScore ?? 100) ? "solved"
                    : "partial";
            }

            // The detail carries the same standing as the summary, so it has to
            // move with it or the statement screen shows a stale badge.
            const detail = this.data.problems.get(`${activityId}/${problemSlug}`);
            if (detail) {
                detail.status = problem.status;
                detail.bestScore = problem.bestScore;
                detail.attempts = problem.attempts;
            }

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
        this.announce(activityId, target, "opened");
    }

    /**
     * What a manager did to a series, arriving from the other half of the fake.
     *
     * The Server has one series and one socket and needs none of this; here the
     * two halves keep their own view of a series, so what crosses is the few
     * fields that moved.
     */
    applyRelay(relay: SeriesRelay): void {
        const target = this.data.series.get(relay.activityId)?.find(s => s.id === relay.seriesId);
        if (!target) return;
        if (relay.startDate !== undefined) target.startDate = relay.startDate;
        if (relay.endDate !== undefined) target.endDate = relay.endDate;
        if (relay.name !== undefined) target.name = relay.name;
        if (relay.pausedAt !== undefined) target.pausedAt = relay.pausedAt ?? undefined;
        if (relay.isOpen !== undefined) {
            target.isOpen = relay.isOpen;
            // A closed series discloses nothing, which is what makes hiding the
            // statements during a pause work without a field of its own.
            if (!relay.isOpen) {
                this.data.withheld.set(target.id, target.problems ?? []);
                target.problems = undefined;
            } else {
                target.problems = this.data.withheld.get(target.id) ?? target.problems ?? [];
                this.data.withheld.delete(target.id);
            }
        }
        this.announce(relay.activityId, target, relay.change);
    }

    private announce(activityId: string, series: Series, change: SeriesChange): void {
        this.events.dispatchEvent({
            type: "seriesChanged",
            data: { activityId, series: { ...series }, change },
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

    /**
     * Records that somebody tried a problem, before anything has judged it.
     *
     * Counted on the submission rather than on the verdict, which is where it
     * used to be: a badge saying two beside a list holding three, and a seeded
     * submission counted a second time the moment its Runner replied.
     */
    countAttempt(activityId: string, problemSlug: string): void {
        this.updateProblemStatus(activityId, problemSlug);
    }

    /** Puts a freshly submitted solution through the same lifecycle. */
    scheduleEvaluation(activityId: string, submissionId: string): void {
        this.after(2500, () => this.setSubmissionState(activityId, submissionId, "running"));
        this.after(7000, () => this.completeSubmission(activityId, submissionId, 100, "Accepted"));
    }
}

/**
 * The ranking as somebody who may see only their own score receives it: their
 * row alone, and no place on it.
 *
 * The payload is opaque to everything but the renderer, so this touches the two
 * fields every format shares — `rows` and the `me` marker in them — and leaves
 * the rest as it is.
 */
const onlyMyRow = (ranking: unknown): unknown => {
    if (typeof ranking !== "object" || ranking === null) return ranking;
    const document = ranking as { rows?: unknown, me?: unknown };
    if (!Array.isArray(document.rows)) return ranking;
    const mine = document.rows.filter(row =>
        typeof row === "object" && row !== null && (row as { id?: unknown }).id === document.me);
    return {
        ...document,
        rows: mine.map(row => {
            const { rank, ...rest } = row as { rank?: unknown };
            void rank;
            return rest;
        }),
    };
};

export class ParticipantApiFake implements ParticipantApi {
    readonly eventDispatcher: ParticipantEventDispatcherImpl = new ParticipantEventDispatcherImpl();
    private readonly state: FakeParticipantState;

    constructor(
        files: FakeFiles,
        /** Shared with the manager fake: one owner for what an activity publishes. */
        private readonly shared: FakeActivities,
        private sleepMs: number = 300,
    ) {
        this.state = new FakeParticipantState(this.eventDispatcher, files, shared);
    }

    async getActivities(filter: ActivityFilter, signal: AbortSignal): Promise<Page<Activity>> {
        await this.settle(signal);
        const { activities } = this.state.dataset();
        const states = filter.states ?? [];
        const types = filter.types ?? [];
        const matched = activities
            // What the Server withholds, the fake withholds: an activity that is
            // closed, or hidden from people who are not in it, is not in the
            // answer at all. Filtering it in a screen would be a rule anybody
            // could turn off with the developer tools.
            .filter(a => this.shared.isListed(a.id, this.isMember(a)))
            .filter(a =>
                (states.length === 0 || states.includes(a.state)) &&
                (types.length === 0 || types.includes(a.type.split("@")[0])));
        return copy(paginate(matched.map(a => this.dressed(a)), filter.page, filter.pageSize));
    }

    async getActivity(idOrSlug: string, signal: AbortSignal): Promise<Activity> {
        await this.settle(signal);
        const { activities } = this.state.dataset();
        const activity = activities.find(a => a.id === idOrSlug || a.slug === idOrSlug);
        // Answered even when the reader is not in it: the activity's own page is
        // how somebody decides whether to join, and it needs the welcome
        // document and the policy to draw the form.
        return activity ? copy(this.dressed(activity)) : notFound("Activity");
    }

    async enroll(idOrSlug: string, input: EnrolInput, signal: AbortSignal): Promise<Activity> {
        await this.settle(signal);
        const { activities } = this.state.dataset();
        const activity = activities.find(a => a.id === idOrSlug || a.slug === idOrSlug);
        if (!activity) return notFound("Activity");
        // Throws exactly as the Server will, and the form tells a wrong password
        // from a refusal by the code on the error.
        this.shared.join(activity.id, input.password);
        const joined = this.dressed(activity);
        // Being in an activity changes what every screen showing it may draw —
        // the sidebar most of all — so it is announced rather than left for the
        // one screen that asked to notice.
        this.eventDispatcher.dispatchEvent({
            type: "activityUpdated",
            data: { activity: copy(joined) },
        });
        return copy(joined);
    }

    /**
     * The activity as it leaves the fake: its documents and its join policy come
     * from the shared store, so publishing one in the manager screen shows up
     * here without a reload.
     */
    private dressed(activity: Activity): Activity {
        // Whatever a manager last saved wins over what the fixtures said: the
        // two halves keep their own activity, and a setting that never crossed
        // is a setting that looks like it did nothing.
        const settings = this.shared.settingsOf(activity.id);
        return {
            ...activity,
            ...settings,
            membership: this.isMember(activity) ? "enrolled" : activity.membership,
            joinPolicy: this.shared.enrolmentOf(activity.id).policy,
            documents: this.shared.documentsOf(activity.id),
        };
    }

    /**
     * The activity **as it leaves the fake**, with whatever a manager saved on
     * top of it. Reading the fixture directly was the bug this exists to
     * prevent: a setting saved in the panel had no effect on the rule that
     * decides what a participant may read.
     */
    private activityOf(activityId: string): Activity | undefined {
        const found = this.state.dataset().activities.find(a => a.id === activityId);
        return found ? this.dressed(found) : undefined;
    }

    private isMember(activity: Activity): boolean {
        return activity.membership === "enrolled" || this.shared.hasJoined(activity.id);
    }

    async getSeries(activityId: string, signal: AbortSignal): Promise<Series[]> {
        await this.settle(signal);
        const activity = this.activityOf(activityId);
        // The rule is applied **here**, where the Server applies it. It used to
        // be the fixtures' business — a series was withheld by having no
        // problems written on it — so a setting that withholds them, like an
        // activity closing its finished rounds, had nowhere to take effect.
        return copy((this.state.dataset().series.get(activityId) ?? []).map(series =>
            mayReadProblems(series, activity ?? {})
                ? series
                : { ...series, problems: undefined }));
    }

    async getProblem(activityId: string, problemSlug: string, signal: AbortSignal): Promise<ProblemDetail> {
        await this.settle(signal);
        const problem = this.state.dataset().problems.get(`${activityId}/${problemSlug}`);
        if (!problem) return notFound("Problem");
        // The address of a problem is guessable and gets shared, so the series
        // is asked here and not only where the list is drawn. A series whose
        // problems are withheld withholds them from everybody who types the
        // address too — which is the whole of what hiding them means.
        const activity = this.activityOf(activityId);
        const series = this.state.dataset().series.get(activityId)
            ?.find(s => s.id === problem.seriesId);
        if (series && !mayReadProblems(series, activity ?? {})) return notFound("Problem");
        return copy(problem);
    }

    async getSubmissions(activityId: string, filter: SubmissionFilter, signal: AbortSignal): Promise<Page<SubmissionSummary>> {
        await this.settle(signal);
        const all = this.state.dataset().submissions.get(activityId) ?? [];
        const states = filter.states ?? [];
        const matched = all.filter(s =>
            (!filter.problemId || s.problemId === filter.problemId) &&
            (!filter.seriesId || s.seriesId === filter.seriesId) &&
            (states.length === 0 || states.includes(s.state)));
        return copy(paginate(matched, filter.page, filter.pageSize ?? 10));
    }

    // The activity is part of the route and of the real endpoint's authorisation,
    // but the fake keeps submissions in one map keyed by id, so it goes unused.
    async getSubmission(_activityId: string, submissionId: string, signal: AbortSignal): Promise<SubmissionDetail> {
        await this.settle(signal);
        const detail = this.state.dataset().submissionDetails.get(submissionId);
        return detail ? copy(detail) : notFound("Submission");
    }

    async getSubmissionFile(_activityId: string, submissionId: string, name: string, signal: AbortSignal): Promise<string> {
        await this.settle(signal);
        return this.state.dataset().submissionFiles.get(submissionId)?.get(name) ?? notFound("File");
    }

    async submit(activityId: string, problemSlug: string, payload: SubmitPayload, signal: AbortSignal): Promise<SubmissionSummary> {
        await this.settle(signal);
        const data = this.state.dataset();
        const problem = data.problems.get(`${activityId}/${problemSlug}`) ?? notFound("Problem");

        // Refused here as the Server refuses it: a series that has not started,
        // has been stopped, or has ended takes nothing, whatever a screen let
        // somebody press.
        const series = data.series.get(activityId)?.find(s => s.id === problem.seriesId);
        if (series && !maySubmit(series)) {
            throw new ForbiddenError(
                "This series is not accepting submissions", "series.closed");
        }

        // Same rule as every other upload: the Server recomputes and refuses a
        // mismatch rather than storing a claim about the bytes.
        const bytes = payload.file ?? new TextEncoder().encode(payload.code ?? "");
        if (payload.sha256 !== undefined && await sha256(bytes) !== payload.sha256) {
            Utils.throwError("The submission does not match its checksum and was not accepted");
        }

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
            problemType: problem.type,
            authorName: "Amy Horsefighter",
            attempts: [{ id: `${id}-job-1`, attempt: 1, startedAt: summary.submittedAt, state: "queued" }],
            detail: { kind: "standard-io", version: 1, tests: [] },
            files: [{ name: fileName, language: payload.language }],
        });
        data.submissionFiles.set(id, new Map([[fileName, payload.code ?? "// wysłano jako plik"]]));

        // Counted now, because that is when it happened. The verdict changes
        // what the problem is worth, not how many times it was tried.
        this.state.countAttempt(activityId, problem.slug);

        this.eventDispatcher.dispatchEvent({
            type: "submissionStateChanged",
            data: { activityId, submission: { ...summary } },
        });
        this.state.scheduleEvaluation(activityId, id);
        return copy(summary);
    }

    async getRanking(activityId: string, seriesId: string | undefined, signal: AbortSignal): Promise<unknown> {
        await this.settle(signal);
        const data = this.state.dataset();
        const seed = data.seeds.get(activityId);
        if (seed === undefined) return notFound("Ranking");

        // Computed on the call, not prepared at load. The combined board is the
        // rounds whose window is open, and one assembled this morning would still
        // not hold the round whose window opens at six — which is exactly the
        // sort of thing a prepared board got wrong. The timing comes from the
        // **live** series, so a round a manager just moved is counted from where
        // it now starts.
        const parts: BoardPart[] = seed.series
            .map(part => ({
                seed: part,
                live: (data.series.get(activityId) ?? []).find(s => s.id === part.id),
            }))
            .filter((part): part is BoardPart => part.live !== undefined);
        const ranking = board(seed, parts, seriesId, Date.now());

        const activity = data.activities.find(a => a.id === activityId);
        // Reduced here because the Server reduces it there. Under
        // `participantOnly` the reader gets their own row and no place: a
        // standing among people whose scores they may not see is not a standing,
        // and sending the whole board with the places stripped would disclose
        // exactly what the setting withholds.
        if (activity?.scoreVisibility === "participantOnly") {
            return copy(onlyMyRow(ranking));
        }
        return copy(ranking);
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

        // Sorted on the Server, because the page is cut afterwards: sorting in
        // the Client would order the twenty rows it happens to hold.
        const order = filter.order === "asc" ? 1 : -1;
        const sorted = [...matched].sort((a, b) => {
            switch (filter.sortBy) {
                // A question about the activity at large belongs at the end of a
                // scope sort rather than at the top: it is the least specific.
                case "series": return order * (a.seriesName ?? "\uffff").localeCompare(b.seriesName ?? "\uffff");
                case "problem": return order * (a.problemSlug ?? "\uffff").localeCompare(b.problemSlug ?? "\uffff");
                default: return order * a.createdAt.localeCompare(b.createdAt);
            }
        });
        return copy(paginate(sorted, filter.page, filter.pageSize ?? 10));
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
        return copy(question);
    }

    async markQuestionRead(activityId: string, questionId: string, signal: AbortSignal): Promise<void> {
        await this.settle(signal);
        const question = this.state.dataset().questions.get(activityId)?.find(q => q.id === questionId);
        if (question) question.isRead = true;
    }

    /** Latency, then the abort check — so a cancelled view never sees a result. */
    private async settle(signal: AbortSignal): Promise<void> {
        await Utils.sleep(this.sleepMs);
        signal.throwIfAborted();
    }
}
