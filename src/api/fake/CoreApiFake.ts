import { UnauthorizedError } from "../ApiError";
import {
    CoreApi,
    InstanceDocument,
    InstanceDocumentKind,
    InstanceInfo,
    ProfileInput,
    RegisterInput,
    Session,
} from "../CoreApi";
import { CoreEventDispatcherImpl } from "../impl/CoreEventDispatcherImpl";
import { legalDocument, legalDocumentKinds } from "./fixtures/legal";
import { instancePage } from "./fixtures/instancePages";
import { Utils } from "./Utils";

/**
 * Signing in, without a Server.
 *
 * Three accounts, one password, and the rules the Server will enforce: a wrong
 * password is refused, ten wrong ones lock the account for an hour, the current
 * password is checked before it changes, and an account owned by an identity
 * provider may not edit itself here.
 *
 * The session is kept in `sessionStorage` because a cookie is what the real
 * transport uses: a reload has to leave somebody signed in, and a fake that
 * forgot would teach every screen to expect a sign-out that will not happen.
 */

const PASSWORD = "Test1!";
const SESSION_KEY = "algojudge.fake.session";

/**
 * Who is signed in, for the other fakes.
 *
 * The real implementations learn this from the cookie the transport sends, so
 * every one of them answers for the caller. Here the session lives in
 * `sessionStorage`, and a fake that answered for a fixed user would make a
 * screen that hides what somebody may not do impossible to test.
 */
export const signedInUserId = (): string | undefined =>
    sessionStorage.getItem(SESSION_KEY) ?? undefined;
const INSTANCE_KEY = "algojudge.fake.instance";
const MIN_PASSWORD = 12;
const MAX_ATTEMPTS = 10;
const LOCKOUT_MS = 60 * 60 * 1000;

interface Account extends Session {
    password: string;
    failedAttempts: number;
    lockedUntil?: number;
    /** Set once the account has been anonymized; it signs in no more. */
    anonymized?: boolean;
}

/** Ids and logins match `fixtures/permissions.ts`, so a session names a real person. */
const createAccounts = (): Account[] => [
    {
        userId: "user-me",
        username: "amy",
        firstName: "Amy",
        lastName: "Horsefighter",
        email: "amy@example.edu.pl",
        emailConfirmed: true,
        isLocal: true,
        password: PASSWORD,
        failedAttempts: 0,
    },
    {
        userId: "user-kowalski",
        username: "jkowalski",
        firstName: "Jan",
        lastName: "Kowalski",
        email: "j.kowalski@example.edu.pl",
        emailConfirmed: true,
        isLocal: true,
        password: PASSWORD,
        failedAttempts: 0,
    },
    {
        // Somebody with no rights at all beyond taking part. Every screen that
        // hides what a person may not do is only worth anything if the fake can
        // be this account, so it exists for the same reason the manager does.
        userId: "user-nowak",
        username: "anowak",
        firstName: "Anna",
        lastName: "Nowak",
        email: "a.nowak@example.edu.pl",
        emailConfirmed: true,
        isLocal: true,
        password: PASSWORD,
        failedAttempts: 0,
    },
    {
        // Owned by the identity provider: the profile is read-only here, the
        // password is not ours to change, and the account cannot delete itself.
        userId: "user-admin",
        username: "john",
        firstName: "John",
        lastName: "Smith",
        email: "john.smith@algojudge.pl",
        emailConfirmed: true,
        isLocal: false,
        password: PASSWORD,
        failedAttempts: 0,
    },
];

const toSession = (account: Account): Session => ({
    userId: account.userId,
    username: account.username,
    firstName: account.firstName,
    lastName: account.lastName,
    email: account.email,
    emailConfirmed: account.emailConfirmed,
    isLocal: account.isLocal,
});

export class CoreApiFake implements CoreApi {
    readonly eventDispatcher: CoreEventDispatcherImpl = new CoreEventDispatcherImpl();

    private accounts = createAccounts();
    private signedInAs: string | undefined = CoreApiFake.restore();
    private instance: InstanceInfo = CoreApiFake.restoreInstance();

    constructor(private sleepMs: number = 300) { }

    /**
     * The session this browser already holds — or one named in the address.
     *
     * `?fakeUser=jkowalski` signs in as that account. It exists so a screenshot
     * or a demo can start signed in as somebody specific, and it is safe because
     * it lives in the fake: the HTTP implementation has no such thing, and the
     * fake only runs when an installation has no Server configured or has asked
     * for it explicitly.
     */
    /**
     * The instance settings, which stage 9 will make a screen.
     *
     * Until then the fake takes them from the address so the registration path
     * can be seen at all: `?fakeRegistration=on` turns local sign-ups on,
     * `&fakeRequireEmail=on` makes the address mandatory, and
     * `&fakeConfirmEmail=on` makes an unconfirmed address unable to sign in.
     * Each choice sticks until it is changed or the tab closes.
     */
    private static restoreInstance(): InstanceInfo {
        // The shipped default: accounts come from an organiser or from SSO.
        const defaults: InstanceInfo = {
            localRegistrationEnabled: false,
            requireEmail: false,
            requireConfirmedEmail: false,
            legalDocuments: legalDocumentKinds(),
            // No logo: this instance has not set one, so the Client shows the
            // placeholder it ships with. `?fakeLogo=off` turns the mark off
            // entirely, which is what an operator who wants none does.
            showLogo: true,
        };

        // Merged over the defaults rather than trusting what was stored. A tab
        // that kept settings written by an older build has an object missing
        // whatever was added since, and reading a field that is not there is how
        // `undefined.map` reaches a screen.
        const stored = sessionStorage.getItem(INSTANCE_KEY);
        let instance = defaults;
        if (stored) {
            try {
                instance = { ...defaults, ...JSON.parse(stored) as Partial<InstanceInfo> };
            } catch {
                instance = defaults;
            }
        }
        if (!Array.isArray(instance.legalDocuments)) instance.legalDocuments = defaults.legalDocuments;

        const query = new URLSearchParams(window.location.search);
        const flag = (name: string): boolean | undefined => {
            const value = query.get(name);
            return value === null ? undefined : value === "on" || value === "true" || value === "1";
        };

        const registration = flag("fakeRegistration");
        const requireEmail = flag("fakeRequireEmail");
        const confirmEmail = flag("fakeConfirmEmail");
        const logo = flag("fakeLogo");
        if (registration !== undefined) instance.localRegistrationEnabled = registration;
        if (requireEmail !== undefined) instance.requireEmail = requireEmail;
        if (confirmEmail !== undefined) instance.requireConfirmedEmail = confirmEmail;
        if (logo !== undefined) instance.showLogo = logo;

        sessionStorage.setItem(INSTANCE_KEY, JSON.stringify(instance));
        return instance;
    }

    private static restore(): string | undefined {
        const wanted = new URLSearchParams(window.location.search).get("fakeUser");
        if (wanted) {
            const account = createAccounts().find(a => a.username === wanted);
            if (account) {
                sessionStorage.setItem(SESSION_KEY, account.userId);
                return account.userId;
            }
        }
        return sessionStorage.getItem(SESSION_KEY) ?? undefined;
    }

    async getInstanceInfo(signal: AbortSignal): Promise<InstanceInfo> {
        await this.settle(signal);
        return { ...this.instance };
    }

    async getInstanceDocument(kind: InstanceDocumentKind, signal: AbortSignal): Promise<InstanceDocument | undefined> {
        await this.settle(signal);
        // The front pages and the legal documents are one kind of thing: text
        // the operator owns, in the format the Client renders.
        const document = kind === "welcome" || kind === "home" ? instancePage(kind) : legalDocument(kind);
        return document ? { ...document } : undefined;
    }

    async getSession(signal: AbortSignal): Promise<Session | undefined> {
        await this.settle(signal);
        const account = this.accounts.find(a => a.userId === this.signedInAs && !a.anonymized);
        return account ? { ...toSession(account) } : undefined;
    }

    async login(login: string, password: string, signal: AbortSignal): Promise<Session> {
        await this.settle(signal);
        const needle = login.trim().toLowerCase();
        const account = this.accounts.find(a =>
            !a.anonymized
            && (a.username.toLowerCase() === needle || (a.email ?? "").toLowerCase() === needle));

        // The same answer for an unknown login as for a wrong password: telling
        // the two apart tells a stranger which accounts exist.
        if (!account) throw new UnauthorizedError();

        if (this.instance.requireConfirmedEmail && !account.emailConfirmed) {
            Utils.throwError("Confirm the address before signing in");
        }

        if (account.lockedUntil && account.lockedUntil > Date.now()) {
            Utils.throwError("Too many attempts. The account is locked for an hour.");
        }

        if (account.password !== password) {
            account.failedAttempts += 1;
            if (account.failedAttempts >= MAX_ATTEMPTS) {
                account.lockedUntil = Date.now() + LOCKOUT_MS;
                account.failedAttempts = 0;
                Utils.throwError("Too many attempts. The account is locked for an hour.");
            }
            throw new UnauthorizedError();
        }

        account.failedAttempts = 0;
        account.lockedUntil = undefined;
        this.signedInAs = account.userId;
        sessionStorage.setItem(SESSION_KEY, account.userId);
        return { ...toSession(account) };
    }

    async logout(signal: AbortSignal): Promise<void> {
        await this.settle(signal);
        this.signedInAs = undefined;
        sessionStorage.removeItem(SESSION_KEY);
    }

    async register(input: RegisterInput, signal: AbortSignal): Promise<void> {
        await this.settle(signal);
        if (!this.instance.localRegistrationEnabled) {
            // Refused whatever the form sends: an instance that takes no sign-ups
            // must refuse them at the door, not only in the screen that draws it.
            Utils.throwError("This instance does not accept sign-ups");
        }

        const username = (input.username ?? "").trim();
        if (username.length === 0) Utils.throwError("A login is required");
        if (this.accounts.some(a => a.username.toLowerCase() === username.toLowerCase())) {
            Utils.throwError("That login is taken");
        }
        if (this.instance.requireEmail && !(input.email ?? "").trim()) {
            Utils.throwError("This instance requires an email address");
        }
        if (input.password.length < MIN_PASSWORD) {
            Utils.throwError(`A password needs at least ${MIN_PASSWORD} characters`);
        }
        if (!input.acceptedTerms) Utils.throwError("The terms have to be accepted");

        this.accounts = [...this.accounts, {
            userId: `user-${username}`,
            username,
            firstName: input.firstName?.trim() || undefined,
            lastName: input.lastName?.trim() || undefined,
            email: input.email?.trim() || undefined,
            // Nothing confirms an address here, so a new one never is. With
            // `requireConfirmedEmail` on, that is what stops the account signing
            // in — which is the point of being able to turn the flag on at all.
            emailConfirmed: false,
            isLocal: true,
            password: input.password,
            failedAttempts: 0,
        }];
    }

    async updateProfile(input: ProfileInput, signal: AbortSignal): Promise<Session> {
        await this.settle(signal);
        const account = this.requireAccount();
        this.assertLocal(account);

        if (input.username !== undefined) {
            const username = input.username.trim();
            if (username.length === 0) Utils.throwError("A login is required");
            if (this.accounts.some(a => a.userId !== account.userId
                && a.username.toLowerCase() === username.toLowerCase())) {
                Utils.throwError("That login is taken");
            }
            account.username = username;
        }
        if (input.firstName !== undefined) account.firstName = input.firstName.trim() || undefined;
        if (input.lastName !== undefined) account.lastName = input.lastName.trim() || undefined;
        if (input.email !== undefined) {
            const email = input.email.trim() || undefined;
            // A changed address is an unconfirmed address, whatever the old one
            // was worth.
            if (email !== account.email) account.emailConfirmed = false;
            account.email = email;
        }
        return { ...toSession(account) };
    }

    async changePassword(currentPassword: string, newPassword: string, signal: AbortSignal): Promise<void> {
        await this.settle(signal);
        const account = this.requireAccount();
        this.assertLocal(account);
        if (account.password !== currentPassword) {
            Utils.throwError("The current password is wrong");
        }
        if (newPassword.length < 12) {
            Utils.throwError("A password needs at least 12 characters");
        }
        account.password = newPassword;
    }

    async exportData(signal: AbortSignal): Promise<Blob> {
        await this.settle(signal);
        const account = this.requireAccount();
        // The account row is the part this API holds. The Server's export also
        // carries submissions, questions and grants; the shape is the same.
        const document = {
            exportedAt: new Date().toISOString(),
            account: toSession(account),
            note: "Fake export: the Server's version also carries submissions, questions and grants.",
        };
        return new Blob([JSON.stringify(document, null, 2)], { type: "application/json" });
    }

    async deleteAccount(password: string, signal: AbortSignal): Promise<void> {
        await this.settle(signal);
        const account = this.requireAccount();
        this.assertLocal(account);
        if (account.password !== password) {
            Utils.throwError("The password is wrong");
        }
        // Anonymized rather than removed: results stay attached to a row that no
        // longer names anybody.
        account.anonymized = true;
        account.username = `deleted-${account.userId.slice(-4)}`;
        account.firstName = undefined;
        account.lastName = undefined;
        account.email = undefined;
        this.signedInAs = undefined;
        sessionStorage.removeItem(SESSION_KEY);
    }

    private requireAccount(): Account {
        const account = this.accounts.find(a => a.userId === this.signedInAs);
        if (!account) throw new UnauthorizedError();
        return account;
    }

    private assertLocal(account: Account): void {
        if (!account.isLocal) {
            Utils.throwError("This account is managed by the identity provider");
        }
    }

    private async settle(signal: AbortSignal): Promise<void> {
        await Utils.sleep(this.sleepMs);
        signal.throwIfAborted();
    }
}
