import { CoreApi, User } from "../CoreApi";
import { CoreEventDispatcherImpl } from "../impl/CoreEventDispatcherImpl";
import { HttpClient } from "./HttpClient";

/** Shape returned by the Server's `/identity/manage/info` endpoint. */
interface IdentityInfo {
    email: string;
}

export class CoreApiHttp implements CoreApi {
    private user: User | undefined = undefined;

    constructor(
        private readonly http: HttpClient,
        readonly eventDispatcher: CoreEventDispatcherImpl
    ) { }

    async login(email: string, password: string, signal: AbortSignal): Promise<void> {
        await this.http.request<void>("/identity/login", "POST", {
            query: { useSessionCookies: true },
            body: { email, password },
            signal,
        });
        await this.refreshUser(signal);
    }

    async register(email: string, password: string, signal: AbortSignal): Promise<void> {
        await this.http.request<void>("/identity/register", "POST", {
            body: { email, password },
            signal,
        });
    }

    getUser(): User | undefined {
        return this.user;
    }

    /**
     * Reads the current session from the Server. The Server exposes only the
     * email address today, so `username` and `name` fall back to it until the
     * identity contract carries them.
     */
    async refreshUser(signal: AbortSignal): Promise<User | undefined> {
        try {
            const info = await this.http.request<IdentityInfo>("/identity/manage/info", "GET", { signal });
            this.user = info.email
                ? { username: info.email, name: info.email, email: info.email }
                : undefined;
        } catch {
            this.user = undefined;
        }
        return this.user;
    }
}
