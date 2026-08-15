import {
    GradeSummary, LaunchContext, LtiApi, Placement, Platform, PlatformInput, RosterEnrolment,
    RosterEntry, RosterView, ToolRegistration,
} from "../LtiApi";
import { conflict, invalid, notFound } from "./refuse";

/**
 * A launch, without a Moodle.
 *
 * It exists so the embedded interface can be worked on at all: the real thing
 * needs a platform, a registered tool and somebody clicking an activity in a
 * course, which is not a loop anybody can hold open while adjusting a layout.
 *
 * <b>It launches an activity this fake actually has.</b> Naming one it does not
 * produces a confined shell around a page that cannot load — a blank rectangle,
 * which is exactly what a broken launch looks like and took twenty minutes to
 * tell apart from one. Every fixture here is one side of a world stated once.
 *
 * <b>The ticket is checked rather than waved through.</b> A fake that accepted
 * any string would let a screen be built against a rule the Server does not
 * have — and the rule is the whole point of the ticket: single use, and only for
 * the person it was issued to.
 */
export class LtiApiFake implements LtiApi {
    /** Tickets nobody has spent yet. Seeded below, spent by `claimLaunch`. */
    private readonly tickets = new Map<string, LaunchContext>();

    private grades: GradeSummary = {
        total: 24,
        synchronised: 21,
        pending: 1,
        deferred: 2,
        withheld: 0,
        failed: 0,
    };

    constructor() {
        // The address a developer opens by hand: `/lti/launched?ticket=demo`.
        this.tickets.set("demo", {
            linkId: "link-1",
            activitySlug: "AMMPZ-2019",
            contextTitle: "Algorytmy i struktury danych",
            locale: "pl",
            embedded: true,
            returnUrl: "https://moodle.invalid/course/view.php?id=1",
        });
        // The same launch as a manager would get it: a window, full interface.
        this.tickets.set("demo-window", {
            linkId: "link-1",
            activitySlug: "AMMPZ-2019",
            contextTitle: "Algorytmy i struktury danych",
            locale: "pl",
            embedded: false,
        });
    }

    /**
     * One platform, registered the way the reference stack is. Enough for the
     * screen to have something to draw and for a second registration to collide
     * with something.
     */
    private platforms: Platform[] = [{
        id: "platform-1",
        displayName: "Moodle WMiI",
        issuer: "https://moodle.wmii.invalid",
        clientId: "AlG0Judge",
        deploymentId: "3",
        keySetUrl: "https://moodle.wmii.invalid/mod/lti/certs.php",
        authTokenUrl: "https://moodle.wmii.invalid/mod/lti/token.php",
        authLoginUrl: "https://moodle.wmii.invalid/mod/lti/auth.php",
        isIdentityAuthority: true,
        identityNamespace: "uwm-sso",
        usernameClaim: "username",
        enabled: true,
        providerId: "provider-lti-1",
        createdAt: "2026-08-14T09:00:00.000Z",
    }];

    /**
     * Two placements of one activity, which is the case the screen exists for:
     * a second course reached the same activity and nobody has accepted that, so
     * its launches are refused until somebody does.
     */
    private placements: Placement[] = [{
        id: "placement-1",
        platformId: "platform-1",
        platformName: "Moodle WMiI",
        contextTitle: "Algorytmy i struktury danych — grupa LA",
        contextId: "41",
        activityId: "activity-ammpz",
        activitySlug: "AMMPZ-2019",
        activityName: "Akademickie Mistrzostwa Polski w Programowaniu Zespołowym 2019",
        shared: true,
        sharingAcknowledged: true,
        createdAt: "2026-08-14T09:10:00.000Z",
    }, {
        id: "placement-2",
        platformId: "platform-1",
        platformName: "Moodle WMiI",
        contextTitle: "Algorytmy i struktury danych — grupa LB",
        contextId: "42",
        activityId: "activity-ammpz",
        activitySlug: "AMMPZ-2019",
        activityName: "Akademickie Mistrzostwa Polski w Programowaniu Zespołowym 2019",
        shared: true,
        sharingAcknowledged: false,
        createdAt: "2026-08-14T11:30:00.000Z",
    }];

    /**
     * A roster with one of each case, because the screen exists for the cases
     * rather than for the happy row: somebody already known, somebody who can be
     * linked, somebody the platform will not name, and somebody who has left.
     *
     * Shaped from a roster measured against Moodle 5.2.2 — short role names, and
     * a username that is the platform's assertion rather than our login.
     */
    private roster: RosterEntry[] = [{
        subject: "3",
        roles: ["Learner"],
        name: "Jan Kowalski",
        email: "j.kowalski@example.edu.pl",
        assertedUsername: "jkowalski",
        status: "Active",
        userId: "user-kowalski",
        userName: "jkowalski",
        strength: "confirmed",
    }, {
        subject: "4",
        roles: ["Learner"],
        name: "Anna Nowak",
        email: "a.nowak@example.edu.pl",
        assertedUsername: "anowak",
        status: "Active",
    }, {
        subject: "5",
        roles: ["Instructor"],
        name: "Tomasz Wi\u015bniewski",
        status: "Active",
    }, {
        subject: "6",
        roles: ["Learner"],
        name: "Agnieszka Lis",
        assertedUsername: "alis",
        status: "Inactive",
    }];

    private nextId = 2;

    async listPlatforms(): Promise<Platform[]> {
        return this.platforms.map(platform => ({ ...platform }));
    }

    async registerPlatform(input: PlatformInput): Promise<Platform> {
        // The Server refuses the same deployment twice, and so does this: a
        // screen built against a fake that accepts it would never show the
        // conflict a real operator meets.
        if (this.platforms.some(p =>
            p.issuer === input.issuer.trim()
            && p.clientId === input.clientId.trim()
            && p.deploymentId === input.deploymentId.trim())) {
            throw conflict("That deployment of that client is already registered");
        }
        requireNamespace(input);

        const platform: Platform = {
            ...normalise(input),
            id: `platform-${this.nextId}`,
            providerId: `provider-lti-${this.nextId}`,
            createdAt: new Date().toISOString(),
        };
        this.nextId++;
        this.platforms.push(platform);
        return { ...platform };
    }

    async updatePlatform(id: string, input: PlatformInput): Promise<Platform> {
        const existing = this.platforms.find(p => p.id === id);
        if (!existing) throw notFound("Platform");

        // The key is not editable, exactly as the Server refuses it: changing it
        // would repoint everybody this platform ever launched.
        if (existing.issuer !== input.issuer.trim()
            || existing.clientId !== input.clientId.trim()
            || existing.deploymentId !== input.deploymentId.trim()) {
            throw invalid(
                "The issuer, client id and deployment id cannot be changed. Register another platform instead");
        }
        requireNamespace(input);

        Object.assign(existing, normalise(input), { id: existing.id, providerId: existing.providerId, createdAt: existing.createdAt });
        return { ...existing };
    }

    async deletePlatform(id: string): Promise<void> {
        const at = this.platforms.findIndex(p => p.id === id);
        if (at < 0) throw notFound("Platform");
        this.platforms.splice(at, 1);
    }

    async getRegistration(id: string): Promise<ToolRegistration> {
        if (!this.platforms.some(p => p.id === id)) throw notFound("Platform");
        return {
            toolUrl: "https://api.algojudge.invalid/api/v1/lti/launch",
            loginUrl: "https://api.algojudge.invalid/api/v1/lti/login",
            redirectUri: "https://api.algojudge.invalid/api/v1/lti/launch",
            keySetUrl: "https://api.algojudge.invalid/api/v1/lti/jwks.json",
            customParameters: ["username=$User.username", "context_history=$Context.id.history"],
        };
    }

    async claimLaunch(ticket: string): Promise<LaunchContext> {
        const context = this.tickets.get(ticket);
        if (!context) throw notFound("Launch");
        // Spent, exactly as the Server spends it. A screen that reloads and
        // still works would be a screen built against the wrong rule.
        this.tickets.delete(ticket);
        return context;
    }

    async getGrades(linkId: string, verify: boolean): Promise<GradeSummary> {
        if (linkId !== "link-1") throw notFound("Placement");
        return verify ? { ...this.grades, drifted: 1 } : { ...this.grades };
    }

    async getRoster(placementId: string): Promise<RosterView> {
        if (!this.placements.some(p => p.id === placementId)) throw notFound("Placement");

        const members = this.roster.map(m => ({ ...m }));
        return {
            contextId: "41",
            contextTitle: "Algorytmy i struktury danych — grupa LA",
            readAt: new Date().toISOString(),
            total: members.length,
            known: members.filter(m => m.userId).length,
            members,
            disclosed: {
                withUsername: members.filter(m => m.assertedUsername).length,
                withEmail: members.filter(m => m.email).length,
                withName: members.filter(m => m.name).length,
            },
        };
    }

    async enrolFromRoster(placementId: string): Promise<RosterEnrolment> {
        if (!this.placements.some(p => p.id === placementId)) throw notFound("Placement");

        const skipped = this.roster
            .filter(m => m.status === "Inactive" || !m.assertedUsername)
            .map(m => ({
                subject: m.subject,
                name: m.name,
                reason: m.status === "Inactive" ? "inactive" : "noUsername",
            }));

        // The one who could be linked now is, so a second run reads differently
        // — the screen has to survive being used twice.
        const newlyLinked = this.roster.filter(
            m => m.assertedUsername && m.status !== "Inactive" && !m.userId);
        for (const member of newlyLinked) {
            member.userId = "user-" + member.assertedUsername;
            member.userName = member.assertedUsername;
            member.strength = "provisional";
        }

        return {
            read: this.roster.length,
            linked: newlyLinked.length,
            granted: this.roster.filter(m => m.userId && m.status !== "Inactive").length,
            skipped,
        };
    }

    async listPlacements(activityId: string | undefined): Promise<Placement[]> {
        return this.placements
            .filter(p => !activityId || p.activityId === activityId)
            .map(p => ({ ...p }));
    }

    async acknowledgeSharing(placementId: string): Promise<Placement> {
        const placement = this.placements.find(p => p.id === placementId);
        if (!placement) throw notFound("Placement");
        // One way only, the way the Server has it: there is no un-accepting.
        placement.sharingAcknowledged = true;
        return { ...placement };
    }

    async resyncGrades(linkId: string): Promise<number> {
        if (linkId !== "link-1") throw notFound("Placement");
        const queued = this.grades.synchronised + this.grades.pending + this.grades.failed;
        this.grades = { ...this.grades, synchronised: 0, pending: queued, failed: 0 };
        return queued;
    }
}

/** Trimmed the way the Server trims it, so the screen sees the stored form. */
const normalise = (input: PlatformInput) => ({
    displayName: input.displayName.trim(),
    issuer: input.issuer.trim(),
    clientId: input.clientId.trim(),
    deploymentId: input.deploymentId.trim(),
    keySetUrl: input.keySetUrl.trim(),
    authTokenUrl: input.authTokenUrl.trim(),
    authLoginUrl: input.authLoginUrl.trim(),
    isIdentityAuthority: input.isIdentityAuthority,
    identityNamespace: input.identityNamespace?.trim() || undefined,
    usernameClaim: input.usernameClaim?.trim() || "username",
    enabled: input.enabled,
});

/**
 * Authority over everything is not a namespace. The Server refuses this
 * combination and the screen has to meet the refusal here too, or it would be
 * built against a rule that only exists on one side.
 */
const requireNamespace = (input: PlatformInput): void => {
    if (input.isIdentityAuthority && !input.identityNamespace?.trim()) {
        throw invalid(
            "A platform trusted to assert identity must name the namespace it is trusted within");
    }
};
