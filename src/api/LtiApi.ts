/**
 * The LMS integration, from the Client's side.
 *
 * A launch arrives as a redirect from Moodle carrying a **ticket**, and this is
 * what turns that ticket into something to render. Everything else in this file
 * is what a manager reads about a placement afterwards.
 *
 * **Optional, and the interface has to survive its absence.** An installation
 * may run no LMS at all; the Server's LTI module is deletable by design, and
 * every screen here is reached only from a launch or from an activity that has
 * one. Nothing on the participant's ordinary path may depend on it.
 */

/**
 * What a launch resolved to, bought with the ticket the redirect carried.
 *
 * **The ticket rather than a query parameter, and that is the point.** §5.2 of
 * `docs/specs/LMS_INTEGRATION.md` requires the confined presentation to be
 * entered because of how the session was established, not because an address
 * said so — "a query parameter anybody may set is a way to make the full
 * interface look confined". A ticket is single-use, short-lived, and issued by
 * the Server to one person.
 */
export interface LaunchContext {
    /** The placement. What a manager's grade summary is asked about. */
    linkId: string;

    /** The activity this launch runs, and the only one it may reach. */
    activitySlug: string;

    /** Narrowed to one round, where the placement says so. */
    seriesId?: string;

    /** What the course is called at the platform. */
    contextTitle?: string;

    /**
     * The language the course is taken in (§5.4). The platform knows it and the
     * Client should not have to guess from the browser.
     */
    locale?: string;

    /**
     * Whether the platform framed this. A learner's launch is embedded; a
     * manager's configuration work opens in a window with the full interface.
     */
    embedded: boolean;

    /** Where "back to the course" goes, when the platform offered somewhere. */
    returnUrl?: string;
}

/**
 * How one placement's grades stand.
 *
 * Four of these are not failures and a screen must not draw them as such:
 * `deferred` is a freeze that has not lifted, `withheld` is an activity that
 * shows scores to managers only, and both are the integration behaving exactly
 * as configured.
 */
export interface GradeSummary {
    total: number;
    synchronised: number;
    pending: number;
    deferred: number;
    withheld: number;
    failed: number;

    /**
     * Grades the platform holds that disagree with what was sent — a teacher
     * editing one by hand, a course restored from a backup. Absent unless the
     * platform was actually asked, which costs a round trip per column.
     */
    drifted?: number;

    /** The last thing the platform refused with, in its own words. */
    lastError?: string;
}

/**
 * A platform this installation accepts launches from.
 *
 * <b>There is no field for a secret and there is no key here.</b> LTI
 * authenticates a tool by a signature, so a platform has no client secret to
 * hold — and the tool's private key never leaves the Server, by decision. A
 * screen cannot leak what its type cannot carry.
 */
export interface Platform {
    id: string;
    displayName: string;
    issuer: string;
    clientId: string;
    deploymentId: string;
    keySetUrl: string;
    authTokenUrl: string;
    authLoginUrl: string;

    /**
     * Whether this platform may say who somebody is, inside
     * {@link identityNamespace}. The most dangerous setting on the screen: a
     * platform trusted with it can hand itself any account inside that
     * directory.
     */
    isIdentityAuthority: boolean;

    /** The identity provider whose accounts it may claim, by slug. */
    identityNamespace?: string;

    /** Which custom parameter carries the username. */
    usernameClaim: string;

    enabled: boolean;

    /** The provider row it speaks through, so a grant's source can be found. */
    providerId: string;

    createdAt: string;
}

export interface PlatformInput {
    displayName: string;
    issuer: string;
    clientId: string;
    deploymentId: string;
    keySetUrl: string;
    authTokenUrl: string;
    authLoginUrl: string;
    isIdentityAuthority: boolean;
    identityNamespace?: string;
    usernameClaim?: string;
    enabled: boolean;
}

/**
 * What an operator types into the platform's own configuration.
 *
 * It exists so registering a tool is copying values off a screen rather than
 * assembling them from documentation and a base URL — which is where a wrong
 * redirect URI comes from, and a wrong redirect URI fails at the end of
 * somebody's first launch with an error from Moodle rather than from here.
 */
export interface ToolRegistration {
    toolUrl: string;
    loginUrl: string;
    redirectUri: string;
    keySetUrl: string;

    /**
     * The custom parameters the platform must send. `username=$User.username` is
     * the one identity linking rests on and the one easiest to leave out.
     */
    customParameters: string[];
}

/**
 * One course link: an activity of ours, as some course of theirs reaches it.
 *
 * **Why a manager needs to see these at all.** One activity may be placed in
 * more than one course — allowed, decided 2026-08-13 — but never silently,
 * because one activity then feeds two gradebooks. The launch refuses until
 * somebody accepts it, and this list is where they find the thing to accept.
 */
export interface Placement {
    id: string;
    platformId: string;
    platformName: string;

    /** What the course is called at the platform, and its identifier there. */
    contextTitle: string;
    contextId: string;

    activityId: string;
    activitySlug: string;
    activityName: string;

    /**
     * Whether this activity is reached from more than one course at all. Carried
     * apart from the acceptance so a screen can stay quiet about the ordinary
     * case rather than asking about something nobody is sharing.
     */
    shared: boolean;

    /** Whether somebody has accepted that sharing. */
    sharingAcknowledged: boolean;

    createdAt: string;
}

/**
 * One person on a course's roster, as the platform describes them.
 *
 * **Everything but `subject` may be absent, and that is the point.** A platform
 * discloses what its administrator configured it to disclose; measured against
 * Moodle 5.2.2 the username arrives only when the tool may send names *and* the
 * roster is asked for one placement. A screen that assumes a name is there shows
 * a column of blanks and no reason for them.
 */
export interface RosterEntry {
    /** The platform's own identifier for them. Always present. */
    subject: string;

    roles: string[];
    name?: string;
    email?: string;

    /** The username the **platform** asserts, which is not our account's login. */
    assertedUsername?: string;

    /** The platform's word for whether they are still in the course. */
    status?: string;

    /** The AlgoJudge account behind them, where one is known. */
    userId?: string;
    userName?: string;

    /**
     * `confirmed` — they launched and we saw them. `provisional` — a roster said
     * so and nobody has verified it. Absent when nobody is matched at all.
     */
    strength?: string;
}

/** What the platform disclosed, counted rather than assumed. */
export interface RosterDisclosure {
    withUsername: number;
    withEmail: number;
    withName: number;
}

export interface RosterView {
    contextId: string;
    contextTitle: string;
    readAt: string;
    total: number;

    /** How many already have an AlgoJudge account behind them. */
    known: number;

    members: RosterEntry[];
    disclosed: RosterDisclosure;
}

/** Somebody the roster named and this installation would not place. */
export interface RosterSkip {
    subject: string;
    name?: string;

    /**
     * `noUsername`, `unknownAccount`, `outsideNamespace`, `inactive`. Each is
     * somebody a teacher may be expecting to see, so none of them is silent.
     */
    reason: string;
}

export interface RosterEnrolment {
    read: number;
    linked: number;
    granted: number;
    skipped: RosterSkip[];
}

/**
 * A registration somebody here is expecting.
 *
 * **The address is the whole of it.** It carries a one-time code, and handing it
 * over is what admits a platform — so it is shown once, copied, and read as
 * spent afterwards.
 */
export interface RegistrationInvitation {
    id: string;
    note: string;
    registrationUrl: string;
    expiresAt: string;
    usedAt?: string | null;
    platformId?: string | null;
}

/** What a platform asked this tool to place, and what may be placed. */
export interface DeepLinkChoosing {
    contextTitle: string;
    acceptMultiple: boolean;
    embedded: boolean;
    locale?: string | null;
    activities: DeepLinkCandidate[];
}

export interface DeepLinkCandidate {
    id: string;
    slug: string;
    name: string;
}

/**
 * The signed answer and where it goes.
 *
 * **Posted as a form by the browser, never followed here.** The platform expects
 * the person's own browser carrying the platform's own cookie, at an address
 * that checks a session key it issued.
 */
export interface DeepLinkAnswer {
    returnUrl: string;
    jwt: string;
}

export interface LtiApi {
    listPlatforms(signal: AbortSignal): Promise<Platform[]>;
    registerPlatform(input: PlatformInput, signal: AbortSignal): Promise<Platform>;
    updatePlatform(id: string, input: PlatformInput, signal: AbortSignal): Promise<Platform>;
    deletePlatform(id: string, signal: AbortSignal): Promise<void>;

    /** What to paste into the platform. Same for all of them; read per platform. */
    getRegistration(id: string, signal: AbortSignal): Promise<ToolRegistration>;

    /**
     * Exchanges the ticket a launch redirected with for its context. Fails if
     * the ticket is spent, expired, or belongs to somebody else.
     */
    claimLaunch(ticket: string, signal: AbortSignal): Promise<LaunchContext>;

    /**
     * @param verify ask the platform what it actually holds, rather than
     * trusting what was last sent. Off by default because it costs a request per
     * column — and the only thing that catches a score a platform accepted and
     * quietly dropped.
     */
    getGrades(linkId: string, verify: boolean, signal: AbortSignal): Promise<GradeSummary>;

    /** Sends everything postable again. Returns how many were queued. */
    resyncGrades(linkId: string, signal: AbortSignal): Promise<number>;

    /** Every course link, newest first; narrowed to one activity when asked. */
    listPlacements(activityId: string | undefined, signal: AbortSignal): Promise<Placement[]>;

    /**
     * Accepts that this activity is reached from more than one course, which is
     * what unblocks a launch refused for want of that decision.
     *
     * **Not reversible here, deliberately.** Withdrawing would leave a gradebook
     * holding scores from an activity that no longer admits it feeds two;
     * removing the placement at the platform is the honest way back.
     */
    acknowledgeSharing(placementId: string, signal: AbortSignal): Promise<Placement>;

    /**
     * The course's roster, read from the platform now.
     *
     * **Read when somebody asks, never on a timer** (decided 2026-08-15). This
     * is a university's Moodle; a screen that refreshed on a schedule would be
     * traffic they never asked for.
     */
    getRoster(placementId: string, signal: AbortSignal): Promise<RosterView>;

    /**
     * Puts that roster into the activity. Answers what it did and — the part
     * worth reading — whom it declined to place, and why.
     */
    enrolFromRoster(placementId: string, signal: AbortSignal): Promise<RosterEnrolment>;

    /** Registrations somebody here is expecting, newest first. */
    listInvitations(signal: AbortSignal): Promise<RegistrationInvitation[]>;

    /** Expects one, and answers with the address to hand over. */
    invite(note: string, signal: AbortSignal): Promise<RegistrationInvitation>;

    /** Calls it off. The row stays, expired, so the list still says it happened. */
    revokeInvitation(id: string, signal: AbortSignal): Promise<void>;

    /** What a platform asked to place, for the screen that picks it. */
    openChoosing(code: string, signal: AbortSignal): Promise<DeepLinkChoosing>;

    /** Answers the platform. Spends the choosing. */
    answerChoosing(
        code: string, activityIds: string[], signal: AbortSignal): Promise<DeepLinkAnswer>;
}
