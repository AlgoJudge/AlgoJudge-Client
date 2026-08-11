import { DeletionRequest, IdentityProvider } from "../../ManagerApi";

/**
 * The identity providers an installation has registered, and the deletion
 * queue they feed.
 *
 * **Two providers, not one.** One is the case that hides every mistake — a list
 * that renders, an ordering that never matters, a slug that always resolves.
 * Two is where a screen has to keep them apart.
 *
 * No secret is stored here, because none is readable: the contract has no field
 * for one on the way out, and what the panel gets is whether one is set. The
 * fake would be lying about the shape of the answer if it kept one.
 */

export const createProviders = (): IdentityProvider[] => [
    {
        id: "018f2c00-0000-7000-8000-0000000000d1",
        slug: "university",
        displayName: "Uczelniane SSO",
        issuer: "https://login.example.edu/realms/students",
        clientId: "algojudge",
        scopes: "openid profile email",
        enabled: true,
        accountUrl: "https://login.example.edu/realms/students/account",
        // Where the identity itself ends, which is not where it is edited.
        deletionUrl: "https://login.example.edu/realms/students/account/#/personal-info",
        // Keycloak's shape: one claim holding an object. Authentik's is a
        // repeated `groups`, which the other provider below uses — both are
        // ordinary, and an installation should not have to know which it has.
        claimPath: "realm_access.roles",
        unmappedBehavior: "deny",
        deletionChannelEnabled: false,
        hasClientSecret: true,
        hasDeletionSecret: false,
        callbackPath: "/api/v1/identity/providers/university/callback",
        mappingRules: [
            { claimValue: "students", templateName: "participant" },
            { claimValue: "lecturers", templateName: "manager" },
        ],
        // Deleting one with people behind it is refused, so the screen needs a
        // provider that has some.
        linkedAccounts: 3,
        createdAt: "2026-08-01T09:00:00Z",
    },
    {
        id: "018f2c00-0000-7000-8000-0000000000d2",
        slug: "algojudge",
        displayName: "AlgoJudge",
        issuer: "https://auth.algojudge.app/application/o/algojudge",
        clientId: "algojudge",
        scopes: "openid profile email",
        enabled: true,
        claimPath: "groups",
        // The other half of the switch: this one admits anybody the directory
        // vouches for, as a participant.
        unmappedBehavior: "defaultTemplate",
        defaultTemplateName: "participant",
        deletionChannelEnabled: true,
        hasClientSecret: true,
        hasDeletionSecret: true,
        callbackPath: "/api/v1/identity/providers/algojudge/callback",
        mappingRules: [{ claimValue: "staff", templateName: "jury" }],
        linkedAccounts: 0,
        createdAt: "2026-08-05T11:30:00Z",
    },
];

/**
 * The queue, with one of each state a screen has to draw.
 *
 * The two that matter are `pending` — inside its window, and stoppable — and
 * `attention`, which is an account that was **not** emptied because it holds
 * system-scope permissions. A webhook that could silence an administrator is an
 * attack vector, so that one waits for a person.
 */
export const createDeletionRequests = (): DeletionRequest[] => {
    const now = Date.now();
    const at = (hoursAgo: number) => new Date(now - hoursAgo * 3600_000).toISOString();

    return [
        {
            id: "018f2c00-0000-7000-8000-0000000000e1",
            channel: "provider",
            state: "pending",
            providerId: "018f2c00-0000-7000-8000-0000000000d2",
            providerName: "AlgoJudge",
            userId: "user-bob",
            userLogin: "bob",
            requestedAt: at(2),
            executeAfter: new Date(now + 22 * 3600_000).toISOString(),
        },
        {
            id: "018f2c00-0000-7000-8000-0000000000e2",
            channel: "provider",
            state: "attention",
            providerId: "018f2c00-0000-7000-8000-0000000000d2",
            providerName: "AlgoJudge",
            userId: "user-manager",
            userLogin: "kate",
            requestedAt: at(30),
            executeAfter: at(6),
            resolvedAt: at(6),
            detail: "Konto ma uprawnienia systemowe i nie zostało wyczyszczone. "
                + "Decyzja należy do administratora.",
        },
        {
            id: "018f2c00-0000-7000-8000-0000000000e3",
            channel: "holder",
            state: "completed",
            userId: "user-gone",
            userLogin: "deleted-0001",
            requestedAt: at(50),
            executeAfter: at(50),
            resolvedAt: at(50),
            detail: "Konto zostało zanonimizowane.",
        },
    ];
};
