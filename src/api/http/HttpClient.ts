import { ApiError, ProblemDocument, toApiError, UnauthorizedError } from "../ApiError";

export type SystemMessageType = "success" | "info" | "warning" | "error";

/**
 * The verbs the transport speaks.
 *
 * It spoke GET and POST only until 2026-08-06, which is why deleting something
 * was `POST /x/delete`. The contract calls itself resource-oriented, and the
 * Server is about to be written against these paths — the cheapest moment to
 * have the verbs is before that, not after.
 */
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface HttpRequestOptions {
    query?: Record<string, string | number | boolean>;
    body?: unknown;
    signal?: AbortSignal;
}

/**
 * Thin transport used by the HTTP API implementations. It owns URL building,
 * cookie-based credentials and the mapping from HTTP status to an ApiError.
 * It reports every failure through `report` so that the UI can surface it
 * without each caller having to.
 */
export class HttpClient {
    constructor(
        private readonly baseUrl: string,
        private readonly report: (message: string, type: SystemMessageType) => void,
        /**
         * Called when the Server refuses a request for want of a session. The
         * provider drops the session and the route guard does the rest — without
         * it a session that expires mid-visit leaves every screen spinning.
         */
        private readonly onUnauthorized: () => void = () => { }
    ) { }

    public async request<T>(
        path: string,
        method: HttpMethod,
        options: HttpRequestOptions = {}
    ): Promise<T> {
        options.signal?.throwIfAborted();

        const params = new URLSearchParams(
            Object.entries(options.query ?? {}).map(([key, value]) => [key, String(value)])
        );
        const search = params.toString();
        const url = this.baseUrl + path + (search ? "?" + search : "");

        // FormData passes through untouched: serialising it would destroy the
        // upload, and the browser has to set the multipart boundary itself.
        const isForm = options.body instanceof FormData;

        const response = await fetch(url, {
            method,
            body: options.body === undefined
                ? undefined
                : isForm ? options.body as FormData : JSON.stringify(options.body),
            headers: isForm ? undefined : new Headers({ "content-type": "application/json" }),
            credentials: "include",
            signal: options.signal,
        });

        if (!response.ok) throw await this.fail(response);

        try {
            return await response.json() as T;
        } catch { /* several endpoints answer with an empty body */ }
        return {} as T;
    }

    /** For endpoints answering with a file rather than a document. */
    public async download(path: string, signal?: AbortSignal): Promise<Blob> {
        signal?.throwIfAborted();
        const response = await fetch(this.baseUrl + path, { credentials: "include", signal });
        if (!response.ok) throw await this.fail(response);
        return await response.blob();
    }

    /**
     * One place where a failed response becomes an error.
     *
     * The body is read before anything is decided: the Server answers
     * `application/problem+json`, and its `code` is what tells a rejected value
     * apart from a name already taken. A body that is missing or unreadable is
     * not itself a failure — the status alone still names the case.
     */
    private async fail(response: Response): Promise<ApiError> {
        const problem = await readProblem(response);
        const error = toApiError(response.status, problem);

        if (error instanceof UnauthorizedError) {
            // Not a message to show; a session that ended, which the provider
            // has to hear about.
            this.onUnauthorized();
        } else {
            this.report(error.message, "error");
        }
        return error;
    }
}

const readProblem = async (response: Response): Promise<ProblemDocument | undefined> => {
    const type = response.headers.get("content-type") ?? "";
    if (!type.includes("json")) return undefined;
    try {
        return await response.json() as ProblemDocument;
    } catch {
        // A Server that promised JSON and sent something else is a fault worth
        // reporting by status alone, rather than one worth crashing the caller.
        return undefined;
    }
};
