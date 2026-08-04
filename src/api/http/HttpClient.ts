import { ForbiddenError, InvalidStatusError, UnauthorizedError } from "../ApiError";

export type SystemMessageType = "success" | "info" | "warning" | "error";

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
        method: "GET" | "POST",
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

        if (response.status === 401) {
            this.onUnauthorized();
            throw new UnauthorizedError();
        }
        if (response.status === 403) {
            this.report("Forbidden", "error");
            throw new ForbiddenError();
        }
        if (!response.ok) {
            this.report(`Server responded with status ${response.status}`, "error");
            throw new InvalidStatusError(response.status);
        }

        try {
            return await response.json() as T;
        } catch { /* several endpoints answer with an empty body */ }
        return {} as T;
    }

    /** For endpoints answering with a file rather than a document. */
    public async download(path: string, signal?: AbortSignal): Promise<Blob> {
        signal?.throwIfAborted();
        const response = await fetch(this.baseUrl + path, { credentials: "include", signal });
        if (response.status === 401) {
            this.onUnauthorized();
            throw new UnauthorizedError();
        }
        if (response.status === 403) {
            this.report("Forbidden", "error");
            throw new ForbiddenError();
        }
        if (!response.ok) {
            this.report(`Server responded with status ${response.status}`, "error");
            throw new InvalidStatusError(response.status);
        }
        return await response.blob();
    }
}
