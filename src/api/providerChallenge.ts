import { resolvedApiBase } from "./http/apiBase";

/**
 * Where a sign-in through one provider begins.
 *
 * **One definition, used by the buttons and by the automatic redirect.** Two
 * would be two strings that have to match exactly and eventually would not —
 * the Server makes the identical argument about `FederatedSchemes.CallbackPath`,
 * which is the other end of this journey.
 *
 * A full address rather than a route: the browser leaves this application for
 * the provider and comes back through the Server, so a client-side navigation
 * would never reach either.
 */
export const providerChallengeUrl = (slug: string, returnUrl: string): string =>
    `${resolvedApiBase()}/identity/providers/${encodeURIComponent(slug)}`
    + `/challenge?returnUrl=${encodeURIComponent(returnUrl)}`;
