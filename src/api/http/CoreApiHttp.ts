import { ForbiddenError, UnauthorizedError } from "../ApiError";
import {
    AccountLink,
    CoreApi,
    Health,
    InstanceInfo,
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

    getHealth(signal: AbortSignal): Promise<Health> {
        return this.http.request<Health>("/health", "GET", { signal });
    }

    async getSession(signal: AbortSignal): Promise<Session | undefined> {
        try {
            return await this.http.request<Session>("/account", "GET", { signal });
        } catch (error) {
            // **Only a refusal means "nobody is signed in".**
            //
            // This swallowed everything until 2026-08-09, so a Server that was
            // down answered the question "who is signed in" with "nobody" — and
            // the guard above sent a signed-in person to the login screen, where
            // signing in also failed. An outage looked like a sign-out, which is
            // the worst reading of it available.
            if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
                return undefined;
            }
            throw error;
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
        return this.http.request<Session>("/account", "PUT", { signal, body: input });
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

    async getAccountLinks(signal: AbortSignal): Promise<AccountLink[]> {
        return await this.http.request<AccountLink[]>("/account/links", "GET", { signal });
    }

    async deleteAccount(password: string, signal: AbortSignal): Promise<void> {
        await this.http.request<void>("/account/delete", "POST", { signal, body: { password } });
    }

    async unlinkProvider(providerId: string | undefined, signal: AbortSignal): Promise<void> {
        // A different path from `/account/delete`, not a rename of it: that one
        // is the local account's and asks for a password.
        await this.http.request<void>(
            "/account/deletion-requests", "POST", { signal, body: { providerId } });
    }
}
