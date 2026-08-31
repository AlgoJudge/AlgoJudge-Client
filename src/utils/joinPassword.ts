/**
 * An activity's join password, held across a federated sign-in.
 *
 * A self-enrolment link carries the password in the fragment because a fragment
 * never reaches a server — see `ActivityPage`, which is where it is spent.
 * Signing in through a provider leaves the application and comes back through
 * the Server, to an address the Server was told: `returnUrl`. A fragment put
 * there is no longer a fragment, it is query-string bytes in an access log, in a
 * proxy, and in the provider's redirect. So it waits here instead of travelling.
 *
 * `sessionStorage`, so it is scoped to the tab making the journey and gone with
 * it. **Every call is guarded**: storage does not return nothing where it is
 * unavailable, it throws.
 */
const KEY = "algojudge.joinPassword";

/**
 * Kept with the address it belongs to, and percent-encoded as it was in the
 * link — `ActivityPage` decodes.
 *
 * The address is half the value: somebody who presses a provider and then
 * changes their mind leaves this behind, and without a name on it the next
 * activity they open would find a password meant for a different one already
 * typed into its form.
 */
export const stashJoinPassword = (path: string, fragment: string): void => {
    try {
        window.sessionStorage.setItem(KEY, JSON.stringify({ path, fragment }));
    } catch {
        // Storage refused. The sign-in still works; the arrival has an empty
        // password field, which is what happened before this existed.
    }
};

/** Takes it and forgets it: it is for one arrival, at one activity. */
export const takeJoinPassword = (path: string): string | undefined => {
    try {
        const stored = window.sessionStorage.getItem(KEY);
        // Spent either way. The journey has landed, and a password kept for an
        // address nobody went to is one waiting to surprise somebody later.
        window.sessionStorage.removeItem(KEY);
        if (!stored) return undefined;

        const held = JSON.parse(stored) as { path?: unknown, fragment?: unknown };
        return held.path === path && typeof held.fragment === "string" ? held.fragment : undefined;
    } catch {
        // Storage refused, or somebody mangled the value. Neither is a reason to
        // fail the page: the form is simply empty.
        return undefined;
    }
};
