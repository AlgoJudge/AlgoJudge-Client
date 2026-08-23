/**
 * A name this browser gives itself.
 *
 * Minted once per browser profile and kept in `localStorage`, so a judge
 * auditing a contest can see that two accounts submitted from the same browser.
 * It travels as a header on every request; the Server records it on the session
 * and on each submission.
 *
 * **It is not evidence, and nothing built on it may pretend otherwise.** It is
 * written by a script, so it is readable, editable and forgeable by whoever is
 * using the browser; it is cleared with site data; it is different in every
 * profile and every private window; and a room of machines imaged from one disk
 * reports **one** id for all of them. It is weaker than the `aj_session` cookie,
 * which is `HttpOnly` and so cannot be touched from a page at all.
 *
 * What it answers is *the same browser, two accounts*, which is a real question
 * and the only one it answers.
 */

const KEY = "aj.deviceId";

/**
 * The header it travels in.
 *
 * No `X-` prefix: RFC 6648 deprecated that convention for new parameters.
 *
 * The name is generic enough that something upstream could in principle set one
 * of its own, which is why the Server **parses it as a UUID and discards
 * anything else** rather than storing what arrived. That guard is needed against
 * the page itself regardless — a script can write this — so the generic name
 * costs nothing that was not already being paid.
 */
export const DEVICE_HEADER = "Device-Id";

/**
 * A v4 UUID, without needing a secure context.
 *
 * `crypto.randomUUID()` is **secure-context only** — the same constraint
 * `sha256.ts` documents for `crypto.subtle` — so over plain HTTP on anything but
 * `localhost` it is simply absent. `crypto.getRandomValues()` is **not** behind
 * that gate, so the fallback loses no randomness at all; it only spells the
 * UUID out by hand.
 */
const minted = (): string => {
    if (typeof crypto.randomUUID === "function") return crypto.randomUUID();

    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;  // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80;  // variant 1
    const hex = Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-`
        + `${hex.slice(16, 20)}-${hex.slice(20)}`;
};

/**
 * This browser's id, minting one the first time.
 *
 * **Every storage call is guarded**, because `localStorage` does not merely
 * return nothing when it is unavailable — it *throws*, in a private window and
 * wherever site data is blocked. An absent id has to be a missing header and
 * never a screen that will not load: nothing here is worth failing a submission
 * for.
 */
export const deviceId = (): string | undefined => {
    try {
        const known = localStorage.getItem(KEY);
        if (known) return known;

        const fresh = minted();
        localStorage.setItem(KEY, fresh);
        return fresh;
    } catch {
        // Storage refused. The Server records no device for this browser, which
        // is the truth: there is nothing to record.
        return undefined;
    }
};
