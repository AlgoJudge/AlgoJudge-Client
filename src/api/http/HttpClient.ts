import {
    ApiError,
    ForbiddenError,
    ProblemDocument,
    ServiceUnavailableError,
    toApiError,
    UnauthorizedError,
    UnreachableError,
} from "../ApiError";
import { DEVICE_HEADER, deviceId } from "../../utils/deviceId";

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
        private readonly onUnauthorized: () => void = () => { },
        /**
         * Called when the Server is away rather than refusing.
         *
         * Its own callback beside `report`, because showing "Server responded
         * with status 503" in a toast is the wrong answer to an outage: nothing
         * the person did caused it and nothing they can do fixes it. The gate
         * above the router acts on this instead.
         */
        private readonly onUnavailable: (error: ServiceUnavailableError) => void = () => { }
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

        // **Headers on both branches now, and only `content-type` is the
        // FormData exception.** It used to be `isForm ? undefined : …`, which
        // meant an upload could carry no header of ours at all — and the one
        // request that most wants the device id is the submission, which is a
        // FormData. What must still be omitted is `content-type`: the browser
        // writes it itself, with the multipart boundary, and ours would replace
        // a boundary the body actually uses with one it does not.
        const headers = new Headers();
        if (!isForm) headers.set("content-type", "application/json");
        const device = deviceId();
        if (device) headers.set(DEVICE_HEADER, device);

        const response = await this.send(url, {
            method,
            body: options.body === undefined
                ? undefined
                : isForm ? options.body as FormData : JSON.stringify(options.body),
            headers,
            credentials: "include",
            signal: options.signal,
        });

        if (!response.ok) throw await this.fail(response);

        try {
            return await response.json() as T;
        } catch (error) {
            // **A body that could not be read is not an empty one.** Several
            // endpoints answer with nothing and `{}` is the right answer for
            // those — but the same line swallowed a read the caller had aborted
            // and handed the screen a successful page with no `items`. Sixteen
            // screens put `result.items` straight into state, so the next render
            // threw on `undefined` instead of anything reporting a cancelled
            // request. `useApiEffect` already discards an aborted run; it never
            // got the chance, because this said the request had succeeded.
            if (options.signal?.aborted) throw error;
        }
        return {} as T;
    }

    /** For endpoints answering with a file rather than a document. */
    public async download(path: string, signal?: AbortSignal): Promise<Blob> {
        signal?.throwIfAborted();
        const response = await this.send(this.baseUrl + path, { credentials: "include", signal });
        if (!response.ok) throw await this.fail(response);
        return await response.blob();
    }

    /**
     * `fetch`, with the case that never produces a response.
     *
     * **A dead proxy rejects rather than answering**, so it never reaches
     * `fail` and never became an `ApiError` at all — it surfaced as a raw
     * `TypeError: Failed to fetch` at whichever screen happened to be asking.
     * That is the shape a whole-installation outage actually has, and it was the
     * one case the transport could not see.
     *
     * An aborted request is not an outage and is rethrown untouched: a screen
     * that unmounted mid-request must not put the interface behind a
     * maintenance page.
     */
    private async send(url: string, init: RequestInit): Promise<Response> {
        try {
            return await fetch(url, init);
        } catch (cause) {
            if (init.signal?.aborted) throw cause;
            const error = new UnreachableError(undefined, cause);
            this.onUnavailable(error);
            throw error;
        }
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
        const error = toApiError(response.status, problem, retryAfter(response));

        if (error instanceof ServiceUnavailableError) {
            // Not a message to show either: an outage is not something the
            // person asking did, and a toast saying so would be one more thing
            // on a screen that is about to be replaced anyway.
            this.onUnavailable(error);
        } else if (error instanceof UnauthorizedError || endsTheSession(error)) {
            // Not a message to show; a session that ended, which the provider
            // has to hear about.
            //
            // **An account that has been stopped ends it too**, though the
            // Server answers 403 rather than 401. The alternative is a toast on
            // every request from an account that can make none of them, in the
            // Server's own English, over a screen that will never finish
            // loading. The login screen is the honest destination.
            this.onUnauthorized();
        } else {
            this.report(error.message, "error");
        }
        return error;
    }
}

/**
 * Whether the refusal is about the account rather than about the request.
 *
 * Two codes, and both mean the same thing to a screen: nothing this person asks
 * for will work until somebody changes the account. `Authorization/BlockedGate`
 * on the Server is what answers them.
 */
const endsTheSession = (error: ApiError): boolean =>
    error instanceof ForbiddenError
    && (error.code === "account.blocked" || error.code === "account.expired");

/**
 * `Retry-After`, seconds form only.
 *
 * The header may also carry an HTTP date, which is deliberately not read: acting
 * on one means trusting the browser's clock and the Server's to agree, and the
 * difference between them is unbounded. Absent means "the Server did not say",
 * which falls back to the Client's own backoff — the safe direction, because the
 * fallback waits rather than spinning.
 */
const retryAfter = (response: Response): number | undefined => {
    const header = response.headers.get("retry-after");
    if (!header) return undefined;
    const seconds = Number(header.trim());
    return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
};

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
