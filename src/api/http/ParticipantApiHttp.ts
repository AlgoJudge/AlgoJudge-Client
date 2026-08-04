import {
    Activity,
    ActivityFilter,
    AskQuestionInput,
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
import { ParticipantEventDispatcherImpl } from "../impl/ParticipantEventDispatcher";
import { HttpClient, HttpRequestOptions } from "./HttpClient";

/**
 * The participant API over REST.
 *
 * Paths follow the decided contract: resource-oriented, versioned in the path,
 * filtering by query parameter rather than by a parallel endpoint. The base URL
 * carries the `/v1` prefix, so an installation can serve either
 * `api.algojudge.app/v1` or `algojudge.app/api/v1` from one build.
 *
 * **These endpoints do not exist on the Server yet.** Until they do, every call
 * here answers 404 and the fake implementation is what the screens run against —
 * which is the point of `VITE_APP_USE_FAKE_API`.
 */
export class ParticipantApiHttp implements ParticipantApi {
    readonly eventDispatcher: ParticipantEventDispatcherImpl = new ParticipantEventDispatcherImpl();

    constructor(private readonly http: HttpClient) { }

    getActivities(filter: ActivityFilter, signal: AbortSignal): Promise<Page<Activity>> {
        return this.http.request<Page<Activity>>("/activities", "GET", {
            signal,
            query: query({
                page: filter.page,
                pageSize: filter.pageSize,
                state: filter.states?.join(","),
                type: filter.types?.join(","),
            }),
        });
    }

    getActivity(idOrSlug: string, signal: AbortSignal): Promise<Activity> {
        return this.http.request<Activity>(`/activities/${encodeURIComponent(idOrSlug)}`, "GET", { signal });
    }

    getSeries(activityId: string, signal: AbortSignal): Promise<Series[]> {
        return this.http.request<Series[]>(`/activities/${encodeURIComponent(activityId)}/series`, "GET", { signal });
    }

    getProblem(activityId: string, problemSlug: string, signal: AbortSignal): Promise<ProblemDetail> {
        return this.http.request<ProblemDetail>(
            `/activities/${encodeURIComponent(activityId)}/problems/${encodeURIComponent(problemSlug)}`,
            "GET", { signal });
    }

    getSubmissions(activityId: string, filter: SubmissionFilter, signal: AbortSignal): Promise<Page<SubmissionSummary>> {
        return this.http.request<Page<SubmissionSummary>>(
            `/activities/${encodeURIComponent(activityId)}/submissions`, "GET", {
                signal,
                query: query({
                    page: filter.page,
                    pageSize: filter.pageSize,
                    problemId: filter.problemId,
                    seriesId: filter.seriesId,
                    state: filter.states?.join(","),
                }),
            });
    }

    getSubmission(activityId: string, submissionId: string, signal: AbortSignal): Promise<SubmissionDetail> {
        return this.http.request<SubmissionDetail>(
            `/activities/${encodeURIComponent(activityId)}/submissions/${encodeURIComponent(submissionId)}`,
            "GET", { signal });
    }

    async getSubmissionFile(activityId: string, submissionId: string, name: string, signal: AbortSignal): Promise<string> {
        const file = await this.http.request<{ content: string }>(
            `/activities/${encodeURIComponent(activityId)}/submissions/${encodeURIComponent(submissionId)}/files/${encodeURIComponent(name)}`,
            "GET", { signal });
        return file.content;
    }

    submit(activityId: string, problemSlug: string, payload: SubmitPayload, signal: AbortSignal): Promise<SubmissionSummary> {
        // Multipart, because a submission may be a file. The transport leaves
        // FormData alone and lets the browser set the boundary.
        const form = new FormData();
        if (payload.language) form.append("language", payload.language);
        if (payload.code !== undefined) form.append("code", payload.code);
        if (payload.file) form.append("file", payload.file, payload.file.name);

        return this.http.request<SubmissionSummary>(
            `/activities/${encodeURIComponent(activityId)}/problems/${encodeURIComponent(problemSlug)}/submissions`,
            "POST", { signal, body: form });
    }

    getRanking(activityId: string, signal: AbortSignal): Promise<unknown> {
        return this.http.request<unknown>(`/activities/${encodeURIComponent(activityId)}/ranking`, "GET", { signal });
    }

    getQuestions(activityId: string, filter: QuestionFilter, signal: AbortSignal): Promise<Page<Question>> {
        return this.http.request<Page<Question>>(
            `/activities/${encodeURIComponent(activityId)}/questions`, "GET", {
                signal,
                query: query({
                    page: filter.page,
                    pageSize: filter.pageSize,
                    search: filter.search,
                    kind: filter.kind,
                    seriesId: filter.seriesId,
                    problemId: filter.problemId,
                    sortBy: filter.sortBy,
                    order: filter.order,
                }),
            });
    }

    askQuestion(activityId: string, input: AskQuestionInput, signal: AbortSignal): Promise<Question> {
        return this.http.request<Question>(
            `/activities/${encodeURIComponent(activityId)}/questions`, "POST", { signal, body: input });
    }

    async markQuestionRead(activityId: string, questionId: string, signal: AbortSignal): Promise<void> {
        await this.http.request<void>(
            `/activities/${encodeURIComponent(activityId)}/questions/${encodeURIComponent(questionId)}/read`,
            "POST", { signal });
    }

    getRules(activityId: string, signal: AbortSignal): Promise<unknown> {
        return this.http.request<unknown>(`/activities/${encodeURIComponent(activityId)}/rules`, "GET", { signal });
    }
}

/** Drops absent parameters so they never reach the URL as `undefined`. */
function query(values: Record<string, string | number | undefined>): HttpRequestOptions["query"] {
    return Object.fromEntries(
        Object.entries(values).filter((entry): entry is [string, string | number] => entry[1] !== undefined)
    );
}
