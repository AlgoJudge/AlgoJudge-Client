import { Event } from "./Event";

/**
 * Signing in, the signed-in account, and the few instance facts a signed-out
 * screen has to know.
 *
 * One notion of "the current user" lives here and nowhere else. The Client used
 * to hold two — one invented by the auth provider and one read from the Server —
 * which is how a reload could sign somebody out of the interface while their
 * session was still perfectly valid.
 */

export interface Session {
    userId: string,
    username: string,
    firstName?: string,
    lastName?: string,
    email?: string,
    emailConfirmed: boolean,
    /**
     * False for an account owned by an identity provider. An SSO account may not
     * change its own name, login, address or password here, and cannot delete
     * itself: those belong to whoever owns the identity.
     */
    isLocal: boolean,
}

/**
 * What a signed-out screen may know about the installation.
 *
 * Read before the login and registration screens render, because both change
 * shape with it: an instance that accepts no sign-ups must not show a form that
 * takes them.
 */
export interface InstanceInfo {
    /** Shipped **off**: accounts are created by an organiser or arrive by SSO. */
    localRegistrationEnabled: boolean,
    /** Whether the registration form must collect an address. */
    requireEmail: boolean,
    /** Whether an address must be confirmed before the account can sign in. */
    requireConfirmedEmail: boolean,
    /** Which documents this instance publishes. Empty is a legitimate answer. */
    legalDocuments: LegalDocumentKind[],
}

/**
 * The documents an instance publishes.
 *
 * Instance configuration rather than product content: the operator is the data
 * controller, and each installation has its own. `algojudge.pl` describes the
 * project and processes nothing, so the text does not live there.
 */
export type LegalDocumentKind = "terms" | "privacy" | "cookies" | "accessibility";

export interface LegalDocument {
    kind: LegalDocumentKind,
    title: string,
    /** `content.md` source, rendered by the same renderer a statement uses. */
    content: string,
    updatedAt?: string,
    /**
     * True while the operator is still using what shipped with the software.
     * A template names the wrong controller, so the screen has to say so out
     * loud rather than let it pass for a policy.
     */
    isTemplate: boolean,
}

export interface ProfileInput {
    firstName?: string,
    lastName?: string,
    /** Changing it is a rename: the login is what other people see. */
    username?: string,
    email?: string,
}

export interface RegisterInput extends ProfileInput {
    password: string,
    /** Refused without it, and recorded with the account. */
    acceptedTerms: boolean,
}

export type CoreEventType = "systemMessage" | "sessionExpired";
export type CoreEvent<T extends CoreEventType, V> = Event<T, V>;

export type SystemMessageEvent = Event<"systemMessage", {
    message: string,
    type: "success" | "info" | "warning" | "error",
}>;

/**
 * The Server refused a request because the session is gone. Dispatched by the
 * transport, so a session that expires mid-visit ends at the login screen rather
 * than in screens that spin for ever.
 */
export type SessionExpiredEvent = Event<"sessionExpired", Record<string, never>>;

export interface CoreEventDispatcher {
    addEventListener(type: "systemMessage", listener: (evt: SystemMessageEvent) => void, signal: AbortSignal): void;
    addEventListener(type: "sessionExpired", listener: (evt: SessionExpiredEvent) => void, signal: AbortSignal): void;
    addEventListener<T extends CoreEventType, V>(type: T, listener: (evt: CoreEvent<T, V>) => void, signal: AbortSignal): void;
}

export interface CoreApi {
    readonly eventDispatcher: CoreEventDispatcher;

    /** What the installation admits to a screen nobody has signed in to. */
    getInstanceInfo(signal: AbortSignal): Promise<InstanceInfo>;

    /** One published document, or undefined where the instance has none. */
    getLegalDocument(kind: LegalDocumentKind, signal: AbortSignal): Promise<LegalDocument | undefined>;

    /**
     * The session the browser already holds, or undefined when there is none.
     * Called once on load: the cookie is the truth, and the Client asks for it
     * rather than remembering one of its own.
     */
    getSession(signal: AbortSignal): Promise<Session | undefined>;

    /** `login` is a username or an email address; the Server accepts either. */
    login(login: string, password: string, signal: AbortSignal): Promise<Session>;
    logout(signal: AbortSignal): Promise<void>;

    register(input: RegisterInput, signal: AbortSignal): Promise<void>;

    updateProfile(input: ProfileInput, signal: AbortSignal): Promise<Session>;
    changePassword(currentPassword: string, newPassword: string, signal: AbortSignal): Promise<void>;

    /** Everything held about the signed-in person, as a document they can keep. */
    exportData(signal: AbortSignal): Promise<Blob>;

    /**
     * Anonymizes the account and ends the session. Immediate and irreversible:
     * submissions and results survive under an identifier that no longer names
     * anybody.
     */
    deleteAccount(password: string, signal: AbortSignal): Promise<void>;
}
