import { InstanceInfo } from "./CoreApi";

/**
 * Whether this installation has a way in for somebody who has no account.
 *
 * Two of them, and either is enough: the local sign-up form, or a provider the
 * registration screen sends people to. An installation whose accounts all come
 * from a directory has `localRegistrationEnabled` off and a redirect set, and
 * reading only the first would hide the way in from everybody who needs it.
 *
 * **A slug being present is already proof it leads somewhere.** The Server
 * filters what it serves against the providers it offers, so a redirect naming
 * one that is disabled or gone never reaches this Client. That is why there is
 * no second check here, and why adding one would be a check that drifts.
 *
 * ## Where this is *not* the right question
 *
 * The registration screen's own refusal panel asks `localRegistrationEnabled`
 * directly, and must keep asking it. Reaching that panel means the redirect was
 * suppressed — `?admin=true` — and showing the local form there would offer a
 * form the Server refuses to accept.
 */
export const registrationOffered = (instance: InstanceInfo): boolean =>
    instance.localRegistrationEnabled || instance.registerRedirectProvider !== undefined;
