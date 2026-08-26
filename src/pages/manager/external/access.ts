/**
 * What the archive picker is opened with, and when what is held stops working.
 *
 * **Its own module rather than part of the screen**, so the one rule with an
 * edge to it — when a credential is too close to death to send — can be read
 * without reading a page of React around it.
 */

/**
 * A credential, or the decision to browse without one.
 *
 * `"anonymous"` is an answer rather than an absence: this installation holds no
 * key, so the public archive is what it browses. `undefined` means nothing has
 * been asked for yet.
 */
export type Access = { value: string; expiresAt?: string } | "anonymous";

/** How close to death a credential may get and still be worth sending. */
const MARGIN_MS = 60_000;

/**
 * Whether what is held can still be sent.
 *
 * **A minute of margin, because the credential is spent somewhere this screen
 * cannot see.** The picker hands it to the archive when the iframe loads, so one
 * that dies between this check and that request fails on the far side — and what
 * a manager sees is an archive with nothing in it, with nothing to explain why.
 *
 * **An expiry that cannot be read counts as spent.** Asking again costs one
 * call; trusting a date nobody could parse costs a picker quietly showing the
 * public archive while a private key sits configured.
 *
 * The `Number.isNaN` guard below is **redundant as this is written** — every
 * comparison against `NaN` is already false, so an unreadable date fails the
 * margin test on its own. It is kept for the rewrite that is easy to reach for:
 * `dies < now` reads as the same rule and silently calls an unreadable expiry
 * *usable*. `check:access` cannot tell the guard's presence from its absence,
 * which was measured rather than assumed, so this comment is the only thing
 * standing behind it.
 *
 * **Anonymous is asked again on every open**, deliberately: an administrator may
 * have set the key in the meantime and this screen has no way of hearing about
 * it, so caching the answer would strand a manager on the public archive until
 * they reloaded.
 */
export const usable = (access: Access | undefined, now = Date.now()): boolean => {
    if (access === undefined || access === "anonymous") return false;
    if (access.expiresAt === undefined) return true;

    const dies = Date.parse(access.expiresAt);
    return !Number.isNaN(dies) && dies - now > MARGIN_MS;
};

/**
 * What to say about a refusal from the exchange.
 *
 * **Written here, from the code the Server sent.** Each of these has a different
 * person who can act on it: the first two are an administrator's to fix, the
 * third passes by itself, and the last may be either. A Server composing these
 * sentences would need a release to change a comma, and would have to choose a
 * language before knowing who was reading.
 */
export const refusal = (t: (key: string) => string, code: string | undefined): string => {
    switch (code) {
        case "accessKey.rejected":
            return t("The archive rejected this installation's key. It may have been revoked or mistyped.");
        case "accessKey.originRefused":
            return t("The archive refused this installation's address. Its owner decides which installations may ask.");
        case "accessKey.tokenLimit":
            return t("The archive has no credential to spare right now. Try again in a few minutes.");
        default:
            return t("The archive could not be asked for a credential. It may be unreachable.");
    }
};
