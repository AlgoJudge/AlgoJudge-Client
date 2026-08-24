import { ParticipantEventDispatcherImpl } from "../impl/ParticipantEventDispatcher";
import {
    Activity,
    ActivityFilter,
    MyGroup,
    ActivityResults,
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
    SUBMISSION_SOURCE,
} from "../ParticipantApi";
import { FakeActivities, SeriesRelay } from "./FakeActivities";
import { FakeAccess } from "./FakeAccess";
import { FakeExclusions } from "./FakeExclusions";
import { displacerFor, FakeLockdown, isLocked } from "./FakeLockdown";
import { WORLD } from "./fixtures/world";
import { AttachmentRule } from "../ManagerApi";
import { maySubmit, mayReadProblems, SeriesTiming } from "../seriesState";
import { FakeFiles } from "./FileApiFake";
import { createDataset, Dataset, OPENING_SERIES_DELAY } from "./fixtures";
import { activityResults, resultOf } from "./fixtures/results";
import { attemptFiles, readableBy } from "./fixtures/attachments";
import { attemptId, meOf, SeedAttempt, SeedSeries } from "./fixtures/world";
import { rankingWindow } from "../rankingWindow";
import { ForbiddenError } from "../ApiError";
import { Utils } from "./Utils";
import { sha256 } from "../../utils/sha256";
import { checksumMismatch, forbidden, notFound } from "./refuse";
import { languageOf } from "../../components/submission/offered";

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
    private readonly shared: FakeActivities;
    private readonly timers: ReturnType<typeof setTimeout>[] = [];
    /**
     * Rounds whose pause took the statements with it.
     *
     * Held here rather than on the series, because no response carries it: the
     * Server withholds by leaving `problems` out, and a field invented here
     * would be the fake serving something the real transport never does.
     */
    private readonly hidden = new Set<string>();
    private started = false;

    constructor(
        private readonly events: ParticipantEventDispatcherImpl,
        private readonly files: FakeFiles,
        shared: FakeActivities,
        private readonly access: FakeAccess,
    ) {
        this.data = createDataset(files);
        this.shared = shared;
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

        // Each round's two ranking instants, wired from the dates it actually
        // holds. A contest's freeze lifts when the round ends and a window opens
        // when the organiser said, so in this seed neither lands inside a short
        // visit — the timers exist so the path is real, not so it can be watched.
        for (const activity of this.data.activities) {
            for (const seed of this.data.seeds.get(activity.id)?.series ?? []) {
                this.at(seed.rankingRevealAt, () =>
                    this.announceRanking(activity.id, seed.id, "unfrozen"));
                this.at(seed.rankingVisibleFrom, () =>
                    this.announceRanking(activity.id, seed.id, "windowOpened"));
            }
        }
    }

    private after(ms: number, f: () => void): void {
        this.timers.push(setTimeout(f, ms));
    }

    /** The same, at an instant. Anything already past has nothing to announce. */
    private at(when: string | undefined, f: () => void): void {
        if (when === undefined) return;
        const delay = Date.parse(when) - Date.now();
        if (delay > 0) this.after(delay, f);
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
        // What the Runner attached, filtered as it leaves. The activity's table
        // decides which names reach a participant, and this is one.
        // Stored whole; what a participant may read is decided where it leaves.
        const judged = this.attemptOf(activityId, submissionId);
        if (judged) {
            detail.attempts[0].files = attemptFiles(this.files, judged.series,
                { ...judged.attempt, state: "completed", score, verdict });
        }

        this.events.dispatchEvent({
            type: "submissionStateChanged",
            data: { activityId, submission: { ...summary } },
        });
        this.updateProblemStatus(activityId, summary.problemSlug, score);

        // The verdict goes back into the seed, so the feed and the board agree
        // with the submissions list rather than merely being told about it.
        const seeded = this.attemptOf(activityId, submissionId);
        if (seeded) {
            seeded.attempt.state = "completed";
            seeded.attempt.score = score;
            seeded.attempt.verdict = verdict;
        }
        this.announceResult(activityId, submissionId);
    }

    /**
     * Pushes one result, filtered exactly as the feed is.
     *
     * A result inside a freeze goes out **withheld**, not omitted: the socket
     * cannot be a way around the rule the endpoint applies, and a board still
     * has to learn that somebody submitted.
     */
    private announceResult(activityId: string, submissionId: string): void {
        const seeded = this.attemptOf(activityId, submissionId);
        const activity = this.data.activities.find(a => a.id === activityId);
        if (!seeded || !activity) return;

        const live = (this.data.series.get(activityId) ?? []).find(s => s.id === seeded.series.id);
        // A round whose window is shut says nothing at all — there is no board
        // for this to be a change to.
        if (!live || !rankingWindow(live).visible) return;
        if (activity.scoreVisibility === "managersOnly") return;

        // Filtered exactly as the endpoint filters: the socket must not be a
        // way around the rule the feed applies.
        const result = resultOf(seeded.series, seeded.attempt, Date.now(),
            this.access.holds("ranking:read:unfrozen", activityId));
        if (!result) return;
        this.events.dispatchEvent({
            type: "rankingChanged",
            data: { activityId, change: "result", seriesId: seeded.series.id, result },
        });
    }

    /**
     * A freeze ends, or a round's board opens.
     *
     * Neither carries data: they mean "what you hold is now incomplete", and
     * only the Server knows what it was withholding. The screen refetches.
     */
    private announceRanking(activityId: string, seriesId: string, change: "unfrozen" | "windowOpened"): void {
        this.events.dispatchEvent({
            type: "rankingChanged",
            data: { activityId, change, seriesId },
        });
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
        if (relay.pausedAt === null) this.hidden.delete(target.id);
        if (relay.hideProblems === true) this.hidden.add(target.id);

        if (relay.isOpen !== undefined) {
            target.isOpen = relay.isOpen;

            // Shutting a round no longer means hiding what is in it: a pause
            // shuts every round, and only the ones the manager asked about lose
            // their statements. An ended round keeps them — it is over, not
            // secret — so the statements go only where they were asked to.
            const conceal = !relay.isOpen && (relay.hideProblems === true || this.isUpcoming(target));

            if (conceal) {
                this.data.withheld.set(target.id, target.problems ?? []);
                target.problems = undefined;
            } else if (relay.isOpen || !this.hidden.has(target.id)) {
                target.problems = this.data.withheld.get(target.id) ?? target.problems ?? [];
                this.data.withheld.delete(target.id);
            }
        }
        this.announce(relay.activityId, target, relay.change);
    }

    /** A round whose start has not arrived discloses nothing that is in it. */
    private isUpcoming(series: Series): boolean {
        return series.startDate !== undefined && Date.parse(series.startDate) > Date.now();
    }

    /** Whether the pause in force over this round took its statements with it. */
    hidesProblems(seriesId: string): boolean {
        return this.hidden.has(seriesId);
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
     *
     * Written **into the seed**, because the seed is what the results feed is
     * built from. A submission recorded only in the submissions list would show
     * on the panel, move the board once by the pushed event, and then vanish
     * from it on the next refetch.
     */
    countAttempt(activityId: string, seriesId: string, problemSlug: string, language: string): string {
        this.updateProblemStatus(activityId, problemSlug);

        const seed = this.data.seeds.get(activityId);
        const series = seed?.series.find(s => s.id === seriesId);
        const me = seed ? meOf(seed) : undefined;
        if (!series || !me) return `sub-${Math.random().toString(36).slice(2, 10)}`;

        const attempt: SeedAttempt = {
            contestant: me.id,
            problem: problemSlug,
            // Minutes since the round started, which is how every attempt states
            // its time — so this one is counted for a penalty like any other.
            at: series.startDate === undefined
                ? 0
                : Math.max(0, Math.round((Date.now() - Date.parse(series.startDate)) / 60000)),
            language,
            state: "queued",
        };
        series.attempts = [...(series.attempts ?? []), attempt];
        return attemptId(series.id, attempt);
    }

    /** The seeded attempt behind a submission, so a verdict can be written back. */
    private attemptOf(activityId: string, submissionId: string): {
        series: SeedSeries; attempt: SeedAttempt;
    } | undefined {
        const seed = this.data.seeds.get(activityId);
        for (const series of seed?.series ?? []) {
            const attempt = (series.attempts ?? []).find(a => attemptId(series.id, a) === submissionId);
            if (attempt) return { series, attempt };
        }
        return undefined;
    }

    // **`languagesFor` was here and is gone.** It answered "what may this
    // activity be written in", which stopped being an activity's question on
    // 2026-08-22: the allowed set is on the assignment, in `config` for the
    // Runner and `spec` for the form, and both travel with the problem.

    rulesFor(activityId: string): AttachmentRule[] {
        return this.shared.settingsOf(activityId)?.attachmentVisibility
            ?? this.data.seeds.get(activityId)?.attachmentVisibility
            ?? [];
    }

    /** Stores bytes in the same store every other file lives in. */
    store(name: string, mimeType: string, text: string) {
        return this.files.seedText(name, mimeType, text);
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

export class ParticipantApiFake implements ParticipantApi {
    readonly eventDispatcher: ParticipantEventDispatcherImpl = new ParticipantEventDispatcherImpl();
    private readonly state: FakeParticipantState;

    constructor(
        files: FakeFiles,
        /** Shared with the manager fake: one owner for what an activity publishes. */
        private readonly shared: FakeActivities,
        /** And one owner for the grants, so this feed can enforce them. */
        private readonly access: FakeAccess,
        /** And one owner for which submissions count. */
        private readonly exclusions: FakeExclusions,
        /** And one for what a running round puts out of reach. */
        private readonly lockdown: FakeLockdown,
        private sleepMs: number = 300,
    ) {
        this.state = new FakeParticipantState(this.eventDispatcher, files, shared, access);
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
    /**
     * The reader's own group here, with everyone in it.
     *
     * **Their own only.** Whose roster anybody else may read is the ranking's
     * question, and the activity's roster setting answers it.
     */
    private myGroupOf(activityId: string): MyGroup | undefined {
        const me = this.access.me();
        const mine = this.access.grants.find(
            g => g.activityId === activityId && g.userId === me);
        const group = mine?.groupId
            ? this.access.groups.find(g => g.id === mine.groupId)
            : undefined;
        if (group === undefined) return undefined;

        return {
            id: group.id,
            name: group.name,
            description: group.description,
            members: this.access.grants
                .filter(g => g.groupId === group.id)
                .map(g => g.userName)
                .sort((a, b) => a.localeCompare(b)),
        };
    }

    private dressed(activity: Activity): Activity {
        // Whatever a manager last saved wins over what the fixtures said: the
        // two halves keep their own activity, and a setting that never crossed
        // is a setting that looks like it did nothing.
        const settings = this.shared.settingsOf(activity.id);
        const state = this.lockdownState();
        return {
            ...activity,
            ...settings,
            membership: this.isMember(activity) ? "enrolled" : activity.membership,
            joinPolicy: this.shared.enrolmentOf(activity.id).policy,
            documents: this.shared.documentsOf(activity.id),
            group: this.myGroupOf(activity.id),
            // **Here, where every activity leaves.** The list and the page are
            // the same seam, so neither can say something the other does not.
            locked: this.lockdown.locksActivity(state, activity.id)
                ? { seriesName: displacerFor(state, activity.id)?.seriesName ?? "" }
                : undefined,
        };
    }

    /**
     * A round's rank, from the seed.
     *
     * The participant's `Series` carries no rank and must not: it is the
     * manager's setting, and what reaches a participant is its **effect**. A
     * fake that put it on their model would be answering a question the Server
     * refuses.
     */
    private importanceOf(seriesId: string): number {
        for (const activity of WORLD) {
            for (const series of activity.series) {
                if (series.id === seriesId) return series.importance ?? 0;
            }
        }
        return 0;
    }

    /**
     * What is out of reach for this reader now.
     *
     * Computed per call rather than held, because the address is a property of
     * the request in the real thing and a round opens while somebody is looking
     * at the screen. **Nobody is exempt here**: the fake's participant is never
     * the staff of anything, and `Grant.IsSystem` is the manager panel's.
     */
    private lockdownState() {
        const mine = this.state.dataset().activities
            .filter(a => this.isMember(a))
            .map(a => a.id);
        return this.lockdown.state(mine);
    }

    /**
     * The rounds of one activity this reader cannot reach.
     *
     * **An activity-scoped floor leaves the activity open**, so the board, the
     * submission list and the questions stopped being answerable with "all of it
     * or none of it". Mirrors `ISeriesLockdown.UnreachableRoundsAsync`.
     */
    private unreachableRounds(activityId: string): Set<string> {
        const state = this.lockdownState();
        const rounds = this.state.dataset().series.get(activityId) ?? [];
        return new Set(rounds
            .filter(series => state.hidden.has(series.id)
                || isLocked(state, activityId, this.importanceOf(series.id)))
            .map(series => series.id));
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

    /**
     * A series as the disclosure rule needs it.
     *
     * The one thing the wire does not carry is whether the pause hid the
     * statements; the fake knows, because it is standing in for the Server that
     * decides. Everything else comes off the series itself.
     */
    private timingOf(series: Series): SeriesTiming {
        return { ...series, hideProblemsWhilePaused: this.state.hidesProblems(series.id) };
    }

    async getSeries(activityId: string, signal: AbortSignal): Promise<Series[]> {
        await this.settle(signal);
        const activity = this.activityOf(activityId);
        // The rule is applied **here**, where the Server applies it. It used to
        // be the fixtures' business — a series was withheld by having no
        // problems written on it — so a setting that withholds them, like an
        // activity closing its finished rounds, had nowhere to take effect.
        // **Hidden is absent, displaced is present and says so.** A round
        // restricted to an address this reader is not at leaves no trace — its
        // dates and its problem count are exactly what it withholds.
        const state = this.lockdownState();
        const rounds = this.state.dataset().series.get(activityId) ?? [];

        return copy(rounds
            .filter(series => !state.hidden.has(series.id))
            .map(series => {
                const displaced = isLocked(state, activityId, this.importanceOf(series.id));
                const readable = !displaced && mayReadProblems(this.timingOf(series), activity ?? {});
                return {
                    ...series,
                    problems: readable ? series.problems : undefined,
                    problemCount: displaced ? undefined : series.problemCount,
                    locked: displaced
                        ? { seriesName: displacerFor(state, activityId)?.seriesName ?? "" }
                        : undefined,
                };
            }));
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
        if (series && !mayReadProblems(this.timingOf(series), activity ?? {})) return notFound("Problem");
        return copy(problem);
    }

    async getSubmissions(activityId: string, filter: SubmissionFilter, signal: AbortSignal): Promise<Page<SubmissionSummary>> {
        await this.settle(signal);
        const all = this.state.dataset().submissions.get(activityId) ?? [];
        const states = filter.states ?? [];
        // Their own work in a round out of reach goes with the round — during an
        // examination, re-reading last week's accepted solution is the thing
        // this exists to stop.
        const unreachable = this.unreachableRounds(activityId);
        const matched = all.filter(s =>
            (!filter.problemId || s.problemId === filter.problemId) &&
            (!filter.seriesId || s.seriesId === filter.seriesId) &&
            !unreachable.has(s.seriesId) &&
            (states.length === 0 || states.includes(s.state)));
        // **Stamped here**, where it leaves, rather than in the dataset: a
        // manager's ruling arrives during the visit, and a row built before it
        // would keep saying the submission counts.
        return copy(paginate(matched.map(s => this.ruled(s)), filter.page, filter.pageSize ?? 10));
    }

    // The activity is part of the route and of the real endpoint's authorisation,
    // but the fake keeps submissions in one map keyed by id, so it goes unused.
    async getSubmission(activityId: string, submissionId: string, signal: AbortSignal): Promise<SubmissionDetail> {
        await this.settle(signal);
        const detail = this.state.dataset().submissionDetails.get(submissionId);
        if (!detail) return notFound("Submission");
        // Addressed by id, so it walks past the list that hides it — the Server
        // refuses it here and so must this.
        if (this.unreachableRounds(activityId).has(detail.seriesId)) {
            return forbidden("This round is out of reach", "series.displaced");
        }
        // **Here**, where it leaves. The activity says which names a participant
        // may read; a name it does not name is theirs to see only if somebody
        // said so. Filtering when the dataset was built would have frozen
        // yesterday's submissions against today's setting.
        const rules = this.state.rulesFor(activityId);
        return copy({
            ...this.ruled(detail),
            files: readableBy(rules, detail.files, false),
            attempts: detail.attempts.map(attempt => ({
                ...attempt,
                files: readableBy(rules, attempt.files, false),
            })),
        });
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

        // **The language is not refused here any more, and that mirrors the
        // Server.** It read a `language` field and compared it with a list on
        // the activity; the language is one member of an opaque document now,
        // and the refusal is the Runner's — against the assignment's `config`,
        // where a language id means something.
        //
        // A fake that still refused would be the one place in the product where
        // the old rule survived, and screens would be written against it.

        // Same rule as every other upload: the Server recomputes and refuses a
        // mismatch rather than storing a claim about the bytes.
        const bytes = payload.file ?? new TextEncoder().encode(payload.code ?? "");
        if (payload.sha256 !== undefined && await sha256(bytes) !== payload.sha256) {
            checksumMismatch("The submission does not match its checksum and was not accepted");
        }

        // Recorded in the seed first, because that is what the results feed and
        // every count are built from — and the id comes from where it landed, so
        // the submissions list and the board name the same submission.
        const language = languageOf(payload.props) ?? "";
        const id = this.state.countAttempt(activityId, problem.seriesId, problem.slug, language);
        // The sender names pasted source now; the Server has no table to do it
        // with. A fake that invented one would hide the field going missing.
        const fileName = payload.file?.name ?? payload.fileName ?? "main.txt";
        const summary: SubmissionSummary = {
            id,
            problemId: problem.id,
            problemSlug: problem.slug,
            problemName: problem.name,
            seriesId: problem.seriesId,
            submittedAt: new Date().toISOString(),
            props: payload.props,
            state: "queued",
            excluded: false,
        };

        data.submissions.set(activityId, [summary, ...(data.submissions.get(activityId) ?? [])]);
        data.submissionDetails.set(id, {
            ...summary,
            problemType: problem.type,
            authorName: "Amy Horsefighter",
            // Nothing has judged it, so the attempt has attached nothing.
            attempts: [{
                id: `${id}-job-1`, attempt: 1,
                startedAt: summary.submittedAt, state: "queued", files: [],
            }],
            // The source is stored like every other file, so the screen reads it
            // by id rather than through an endpoint of its own.
            files: [(() => {
                const stored = this.state.store(
                    `${id}/${fileName}`, "text/plain", payload.code ?? "// wysłano jako plik");
                return {
                    name: SUBMISSION_SOURCE,
                    fileName,
                    fileId: stored.id,
                    sha256: stored.sha256,
                    sizeBytes: stored.sizeBytes,
                };
            })()],
        });

        this.eventDispatcher.dispatchEvent({
            type: "submissionStateChanged",
            data: { activityId, submission: { ...summary } },
        });
        this.state.scheduleEvaluation(activityId, id);
        return copy(summary);
    }

    async getResults(activityId: string, seriesId: string | undefined, signal: AbortSignal): Promise<ActivityResults> {
        await this.settle(signal);
        const data = this.state.dataset();
        const seed = data.seeds.get(activityId);
        if (seed === undefined) return notFound("Results");

        // Assembled on the call, not prepared at load: what may leave depends on
        // the clock — a window that opens at six, a freeze that ends at seven —
        // and the timing comes from the **live** series, so a round a manager
        // just moved is counted from where it now starts.
        const activity = this.activityOf(activityId);
        // The displaced round loses its column and the rest of the board stays.
        const unreachable = this.unreachableRounds(activityId);
        return copy(activityResults({
            seed,
            live: (data.series.get(activityId) ?? []).filter(s => !unreachable.has(s.id)),
            seriesId,
            scoreVisibility: activity?.scoreVisibility ?? "managersOnly",
            // Decided here because the Server decides it here. It used to be the
            // screen's, which drew a board out of a feed it had been sent none
            // of: five rows, no columns, everybody on nought.
            unfrozen: this.access.holds("ranking:read:unfrozen", activityId),
            now: Date.now(),
            // Who competes as whom, read off the grants the manager screens
            // write — so a group made a moment ago is a row a moment later.
            groups: {
                of: new Map(this.access.grants
                    .filter(g => g.activityId === activityId && g.groupId !== undefined)
                    .flatMap(g => {
                        const group = this.access.groups.find(x => x.id === g.groupId);
                        return group ? [[g.userId, group] as const] : [];
                    })),
                showMembers: this.access.showGroupMembers.has(activityId),
            },
            // And which submissions count, read off the same store the manager
            // screen rules on.
            excluded: id => this.exclusions.has(id),
        }));
    }

    /** One submission, carrying whatever ruling stands against it now. */
    private ruled<T extends SubmissionSummary>(submission: T): T {
        return { ...submission, excluded: this.exclusions.has(submission.id) };
    }

    async getQuestions(activityId: string, filter: QuestionFilter, signal: AbortSignal): Promise<Page<Question>> {
        await this.settle(signal);
        const all = this.state.dataset().questions.get(activityId) ?? [];
        const search = filter.search?.trim().toLowerCase();
        // Filtering happens before paging. The reverse — which the old screen
        // did — silently filters only the page that happens to be visible.
        // A question about a round out of reach goes with it; one about the
        // activity carries no round and stays, because an announcement is how
        // the organiser explains the lockdown.
        const unreachable = this.unreachableRounds(activityId);
        const matched = all.filter(q =>
            (!search || q.topic.toLowerCase().includes(search)) &&
            (!filter.kind || q.kind === filter.kind) &&
            (!filter.seriesId || q.seriesId === filter.seriesId) &&
            (q.seriesId === undefined || !unreachable.has(q.seriesId)) &&
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
