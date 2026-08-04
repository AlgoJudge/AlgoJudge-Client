import {
    CoreApi,
    InstanceInfo,
    LegalDocument,
    LegalDocumentKind,
    ProfileInput,
    RegisterInput,
    Session,
} from "../CoreApi";
import { CoreEventDispatcherImpl } from "../impl/CoreEventDispatcherImpl";
import { HttpClient } from "./HttpClient";

/**
 * Signing in over REST.
 *
 * `MapIdentityApi` provides registration and sign-in and **nothing else** — no
 * logout, no account screen, no export, no deletion. Everything under `/account`
 * is an endpoint the Server has yet to grow and answers 404 until it does, which
 * is the arrangement every other contract in this repository already has.
 */
export class CoreApiHttp implements CoreApi {
    constructor(
        private readonly http: HttpClient,
        readonly eventDispatcher: CoreEventDispatcherImpl
    ) { }

    getInstanceInfo(signal: AbortSignal): Promise<InstanceInfo> {
        return this.http.request<InstanceInfo>("/instance", "GET", { signal });
    }

    async getLegalDocument(kind: LegalDocumentKind, signal: AbortSignal): Promise<LegalDocument | undefined> {
        try {
            return await this.http.request<LegalDocument>(
                `/instance/legal/${encodeURIComponent(kind)}`, "GET", { signal });
        } catch {
            // An instance that publishes no such document is not an error; the
            // screen says it is missing rather than that something broke.
            return undefined;
        }
    }

    async getSession(signal: AbortSignal): Promise<Session | undefined> {
        try {
            return await this.http.request<Session>("/account", "GET", { signal });
        } catch {
            // Having no session is not a failure; it is the answer to the
            // question this method asks.
            return undefined;
        }
    }

    async login(login: string, password: string, signal: AbortSignal): Promise<Session> {
        // The field is called `email`, but the endpoint hands it to
        // `PasswordSignInAsync`, which takes a user name — which is how an
        // account with no address signs in at all.
        await this.http.request<void>("/identity/login", "POST", {
            query: { useSessionCookies: true },
            body: { email: login, password },
            signal,
        });
        return await this.http.request<Session>("/account", "GET", { signal });
    }

    async logout(signal: AbortSignal): Promise<void> {
        // Not part of `MapIdentityApi`: the Server has to end the cookie session
        // itself, or signing out only forgets it in this tab.
        await this.http.request<void>("/identity/logout", "POST", { signal });
    }

    async register(input: RegisterInput, signal: AbortSignal): Promise<void> {
        await this.http.request<void>("/identity/register", "POST", { signal, body: input });
    }

    updateProfile(input: ProfileInput, signal: AbortSignal): Promise<Session> {
        return this.http.request<Session>("/account", "POST", { signal, body: input });
    }

    async changePassword(currentPassword: string, newPassword: string, signal: AbortSignal): Promise<void> {
        await this.http.request<void>("/account/password", "POST", {
            signal,
            body: { currentPassword, newPassword },
        });
    }

    exportData(signal: AbortSignal): Promise<Blob> {
        return this.http.download("/account/export", signal);
    }

    async deleteAccount(password: string, signal: AbortSignal): Promise<void> {
        await this.http.request<void>("/account/delete", "POST", { signal, body: { password } });
    }
}
