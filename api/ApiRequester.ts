import EventDispatcher, { EventType } from "./EventDispatcher";

class UnauthorizedError extends Error {
    constructor() {
        super("Unauthorized")
    }
}
class ForbiddenError extends Error {
    constructor() {
        super("Forbidden")
    }
}
class InvalidStatusError extends Error {
    constructor() {
        super("Invalid status")
    }
}

class ApiRequester {
    constructor(private baseUrl: string, private eventDispatcher: EventDispatcher) { }

    public async request<T>(
        path: string,
        method: "GET" | "POST",
        query: Record<string, string | number | boolean> = {},
        body: BodyInit | undefined = undefined
    ): Promise<T> {
        const params = new URLSearchParams(
            Object.entries(query ?? {}).map(([key, value]) => [key, String(value)])
        );
        const url = this.baseUrl + path + "?" + params;
        const res = await fetch(url, {
            method,
            body,
            headers: new Headers({ 'content-type': 'application/json' }),
            credentials: "include"
        });
        if (res.status == 401) {
            this.eventDispatcher.dispatch(EventType.UNAUTHORIZED);
            throw new UnauthorizedError();
        } else if (res.status == 403) {
            this.eventDispatcher.dispatch(EventType.FORBIDDEN);
            throw new ForbiddenError();
        } else if (res.status != 200) {
            this.eventDispatcher.dispatch(EventType.INVALID_STATUS_CODE);
            throw new InvalidStatusError();
        }
        try {
            return await res.json() as T;
        } catch { /* an empty body is not an error for every endpoint */ }
        return {} as T;
    }
}

export { UnauthorizedError }
export default ApiRequester;