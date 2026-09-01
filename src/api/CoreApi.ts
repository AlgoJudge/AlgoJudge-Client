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
 * One way the signed-in person signs in, as their own account screen needs to
 * describe it.
 *
 * `deletionUrl` is **configuration, not discovery** — OIDC standardises no such
 * address. Absent means this installation knows of no page where the identity
 * itself can be ended, and the screen then offers only what it can do by
 * itself. Never guess one: a wrong link sends somebody who wants to leave to a
 * 404 on a domain that is not ours.
 */
export type AccountLink = {
    providerSlug: string,
    displayName: string,
    accountUrl?: string,
    deletionUrl?: string,
    linkedAt: string,
};


/**
 * What a signed-out screen may know about the installation.
 *
 * Read before the login and registration screens render, because both change
 * shape with it: an instance that accepts no sign-ups must not show a form that
 * takes them.
 */
export interface InstanceInfo {
    /**
     * What this installation calls itself — the operator's name for it, beside
     * the product's own.
     *
     * A reader has to be able to tell whose installation they are looking at:
     * the mark says it to somebody who recognises the mark, and the name says it
     * to everybody else. Shown beside the logo, and in the window title as
     * `AlgoJudge | <name>`.
     *
     * **Absent is a real state**, not a missing field: an installation that has
     * not been named shows the product's name alone rather than a made-up one.
     * That is why there is no default here — a default would make "not named"
     * indistinguishable from "named AlgoJudge".
     */
    name?: string,
    /** Shipped **off**: accounts are created by an organiser or arrive by SSO. */
    localRegistrationEnabled: boolean,
    /** Whether the registration form must collect an address. */
    requireEmail: boolean,
    /** Whether an address must be confirmed before the account can sign in. */
    requireConfirmedEmail: boolean,
    /**
     * A reference to every document currently in force, one per kind per
     * language. The text itself is fetched from `fileApi` by whoever is about to
     * show it — see {@link InstanceDocumentRef}.
     *
     * **Every document is optional**, the front pages as much as the legal ones,
     * and an empty list is a legitimate answer. Which documents exist is read
     * from here and nowhere else: there was a second field saying which legal
     * ones were published, and two answers to one question disagree the moment
     * something is withdrawn.
     */
    documents: InstanceDocumentRef[],
    /**
     * The instance's own mark. Absent means it has not set one, and the Client
     * shows the placeholder it ships with — visibly a placeholder, so an
     * unconfigured instance reads as unconfigured.
     */
    logo?: InstanceLogo,
    /**
     * A mark per language, for an institution whose wordmark is not the same in
     * two of them. A language without one uses `logo`, exactly as a statement
     * without a translation uses `content.md`.
     */
    logoTranslations?: LocalisedLogo[],
    /**
     * Whether the mark appears in the application shell. False is how an
     * operator turns it off; a page that wants no picture simply does not
     * reference one, because the operator writes the page.
     */
    showLogo: boolean,
    /**
     * Whether the sign-in screen offers the login-and-password form.
     *
     * **Presentation only.** The endpoint stays open — administrators and
     * temporary accounts still sign in that way, and `?admin=true` brings the
     * form back for them.
     */
    showLocalSignIn: boolean,
    /**
     * The identity providers this installation offers, for the buttons on the
     * sign-in screen.
     *
     * It arrives here because it has to be readable **before anybody has signed
     * in** — which is the whole point of a sign-in button — and this is the one
     * answer a signed-out screen already fetches. A name and a slug and nothing
     * else: the issuer, the client id and the claim mapping are an operator's
     * business and are read behind `provider:manage`.
     *
     * An empty list is the ordinary case and means no buttons, not an error.
     */
    providers: PublicProvider[],
    /**
     * Whether a person may remove their own account here. Shipped on; an
     * installation may close it.
     */
    accountDeletionEnabled: boolean,
    /**
     * Whether this installation may send submissions to a service it does not
     * run. Shipped off.
     *
     * Public alongside every other instance setting, deliberately: it is the
     * fact a privacy notice is written from, and it names no service and no
     * address — only whether the door is open.
     */
    externalJudgingEnabled: boolean,
    /**
     * The operator's colours and typeface. **Absent means the installation has
     * set none**, and the Client draws the theme it ships with.
     *
     * The values travel here rather than as a file reference, unlike every
     * document beside them: the shell needs them before the first paint, and a
     * second round trip would guarantee a flash of the wrong colours on every
     * arrival.
     */
    theme?: InstanceTheme,
}

/**
 * What an installation looks like.
 *
 * **Every colour is optional and absent means the product's default** — never
 * black and never empty. The Server omits a key nobody set rather than sending
 * `null`, so a reader must treat *not there* and *not set* as one thing.
 */
export interface InstanceTheme {
    light?: ThemeColours,
    dark?: ThemeColours,
    fontFamily?: string,
    fontFamilyHeadings?: string,
    /** The faces to draw with, already resolved to addresses. */
    fonts: InstanceFont[],
    /** The file this was published from, so the panel can offer it back. */
    fileId: string,
    sha256: string,
}

/**
 * One colour scheme, stated in full.
 *
 * A dark scheme worked out from a light one fails a contrast floor
 * unpredictably, and `verify-theme.mjs` asserts one — so both are set rather
 * than one derived.
 */
export interface ThemeColours {
    /* Brand. One hex each; the ten Mantine shades are generated from it, which
       is why one value reaches a pale tile, a rule and dark text on it. */
    primary?: string,
    secondary?: string,
    accent?: string,
    /**
     * Its own key rather than a shade of `primary`: in an identity system a
     * link is usually a different hue, not a lighter brand colour.
     */
    link?: string,

    /* Surface and text. */
    body?: string,
    surface?: string,
    text?: string,
    dimmed?: string,
    border?: string,

    /* The shell. Hover and muted are mixed from these with `color-mix()` rather
       than asked for, so they track whatever the operator set. */
    navBackground?: string,
    navText?: string,
    navActiveBackground?: string,
    navActiveText?: string,
    headerBackground?: string,
    headerText?: string,
}

/**
 * One font face, as an `@font-face` needs it.
 *
 * **The address is the Server's, built from a stored file.** An operator names
 * a face they uploaded and never writes a URL — which is what keeps a value
 * somebody typed out of a request somebody else's browser makes.
 */
export interface InstanceFont {
    /** The name the file was published under, and what a theme calls it by. */
    name: string,
    family: string,
    weight: number,
    style: string,
    url: string,
    sha256: string,
    sizeBytes: number,
}

/** What a signed-out screen is told about one provider. */
export interface PublicProvider {
    /** Appears in the sign-in path, so it is what the button links to. */
    slug: string,
    displayName: string,
}

/**
 * The instance's logo, as a stored file.
 *
 * It carries a checksum because every stored file does — the rule has no
 * exception for pictures.
 */
export interface InstanceLogo {
    url: string,
    mimeType: string,
    sizeBytes: number,
    sha256: string,
}

export interface LocalisedLogo {
    /** BCP-47 subtag, as a statement translation carries. */
    language: string,
    logo: InstanceLogo,
}

/**
 * A document an instance publishes, written by its operator.
 *
 * Instance configuration rather than product content: the operator is the data
 * controller, and each installation has its own. `algojudge.pl` describes the
 * project and processes nothing, so the text does not live there.
 *
 * The front pages and the legal documents are one kind of thing — `content.md`
 * an operator writes, drawn by the renderer that draws a problem statement — so
 * they are one endpoint and, in stage 9, one screen to edit.
 */
export type InstanceDocumentKind = LegalDocumentKind | "welcome" | "home";

/** The four documents whose absence is a legal question rather than a design one. */
export type LegalDocumentKind = "terms" | "privacy" | "cookies" | "accessibility";

/**
 * Where one instance document lives, and what a screen needs before it has the
 * text.
 *
 * The documents do not travel in the instance response — a privacy policy is
 * tens of kilobytes per language and the configuration is read on every arrival
 * — but their **references** do, because `/instance` is fetched anyway. The
 * reader's language is picked from these and the text is fetched once, with
 * `fileApi.getText`.
 *
 * There is one of these per kind **per language**, as `content-<language>.md` is
 * to a statement. The one with no `language` is what the operator wrote first
 * and is the fallback: a policy nobody translated is still the policy.
 */
export interface InstanceDocumentRef {
    kind: InstanceDocumentKind,
    /** BCP-47 subtag. Absent on the document the operator wrote first. */
    language?: string,
    /** Absent on the front pages: their heading is inside the document. */
    title?: string,
    /**
     * When this revision came into force.
     *
     * Instance documents are **versioned**: publishing a new one adds a
     * revision rather than replacing the last, so "which policy was in force on
     * the third of August" stays answerable — a question that gets asked about a
     * privacy policy for real, and by somebody who is owed an answer. The reader
     * is served the newest revision whose `validFrom` has passed, which also
     * lets an operator publish new terms ahead of the date they take effect.
     *
     * Absent on a document that shipped with the software: a template names the
     * wrong controller and is in force over nothing.
     */
    validFrom?: string,
    /**
     * True while the operator is still using what shipped with the software.
     * A template names the wrong controller, so the screen has to say so out
     * loud rather than let it pass for a policy.
     */
    isTemplate: boolean,
    /** The stored text, read with `fileApi.getText`. */
    fileId: string,
    sha256: string,
    sizeBytes: number,
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
    /**
     * **The Server does not read this.** Registration is ASP.NET Core Identity's
     * own `MapIdentityApi` handler, which binds no such field — so the consent is
     * asked for in the browser and recorded nowhere. It said "refused without it,
     * and recorded with the account" until 2026-09-01, and `RegisterPage`
     * demanded a tick on the strength of that sentence even where the
     * installation published no terms to tick.
     *
     * Kept on the wire because the fake enforces it, and because it is the field
     * a Server that recorded consent would read.
     */
    acceptedTerms: boolean,
}

/**
 * How far the Server has withdrawn from service.
 *
 * `level` is a **string, not a union of the three words**, and read by
 * comparison rather than by exhaustive match. A level a newer Server invents
 * must not break a Client that has never heard of it, and the safe reading of an
 * unknown one is "not open" — which is what every reader here does.
 */
export interface Maintenance {
    /** `open` | `draining` | `closed`, today. */
    level: string;
    /** When the operator asked. Shown, never computed with. */
    since?: string;
    /** What the operator typed, shown to whoever is looking at the page. */
    reason?: string;
}

/**
 * What `/health` answers — **at every level, always 200**.
 *
 * It is the one endpoint that keeps answering while the rest of the Server
 * refuses, which is what makes a window escapable: this is what the Client polls
 * to learn it may come back.
 */
export interface Health {
    status: string;
    /** Absent while the Server is open, which is the ordinary case. */
    maintenance?: Maintenance;
}

export type CoreEventType = "systemMessage" | "sessionExpired" | "maintenanceChanged";
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

/**
 * An operator threw the maintenance switch, either way.
 *
 * Sent to everybody, because a window is not scoped by any permission. **Both
 * directions travel on it**: a Client told only that the Server was going away
 * would sit on a maintenance page until somebody reloaded it.
 *
 * It is an accelerator, not the source: the poll against `/health` is what a
 * Client that was not connected relies on, and the two agree because they carry
 * the same document.
 */
export type MaintenanceChangedEvent = Event<"maintenanceChanged", { maintenance: Maintenance }>;

export interface CoreEventDispatcher {
    addEventListener(type: "systemMessage", listener: (evt: SystemMessageEvent) => void, signal: AbortSignal): void;
    addEventListener(type: "sessionExpired", listener: (evt: SessionExpiredEvent) => void, signal: AbortSignal): void;
    addEventListener(type: "maintenanceChanged", listener: (evt: MaintenanceChangedEvent) => void, signal: AbortSignal): void;
    addEventListener<T extends CoreEventType, V>(type: T, listener: (evt: CoreEvent<T, V>) => void, signal: AbortSignal): void;
}

export interface CoreApi {
    readonly eventDispatcher: CoreEventDispatcher;

    /** What the installation admits to a screen nobody has signed in to. */
    getInstanceInfo(signal: AbortSignal): Promise<InstanceInfo>;

    /**
     * Whether the Server is serving, and if not, how far it has withdrawn.
     *
     * **Anonymous, and the only call that keeps working during a window.** It is
     * how a Client that has been put behind the maintenance page finds out it
     * may come back — so it must never be routed through anything that needs a
     * session, and it must never be the thing a window blocks.
     */
    getHealth(signal: AbortSignal): Promise<Health>;

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

    /**
     * The ways this person can sign in, and where each of them is managed.
     *
     * Its own call rather than a field on the session: the session is read on
     * every page load and this is wanted by one screen.
     */
    getAccountLinks(signal: AbortSignal): Promise<AccountLink[]>;

    /** Everything held about the signed-in person, as a document they can keep. */
    exportData(signal: AbortSignal): Promise<Blob>;

    /**
     * Anonymizes the account and ends the session. Immediate and irreversible:
     * submissions and results survive under an identifier that no longer names
     * anybody.
     *
     * **The local account's channel**, and it asks for the password to prove it.
     * An account owned by a provider has none and uses {@link unlinkProvider}.
     */
    deleteAccount(password: string, signal: AbortSignal): Promise<void>;

    /**
     * De-registers this account from an identity provider — or from every one of
     * them, when no provider is named.
     *
     * **Not a deletion, and not a rename of one.** What it removes is a way of
     * signing in. The account is emptied only if that was the last one: no other
     * provider link, and no local password. Somebody who keeps another way in
     * keeps their account, with one fewer door.
     *
     * It asks for no password because an account owned by a provider has none.
     */
    unlinkProvider(providerId: string | undefined, signal: AbortSignal): Promise<void>;
}
