import { PermissionDefinition } from "./ManagerApi";

/**
 * Whether a set of permissions makes a grant a staff grant.
 *
 * Staff is managing the activity, judging, answering questions, reading other
 * people's submissions. A grant carrying any of it is a membership that **runs**
 * the activity rather than takes part in it, and that decides whether it counts
 * among the competitors — a jury member in the ranking beside the students is a
 * bug, not a preference.
 *
 * Read from `systemic`, which the catalog publishes. It used to be worked out
 * as "anything the participant template does not grant", which is the same
 * answer for every permission that existed when it was written — and the wrong
 * one for `trial:run`, where the screen grayed the switch on while the Server
 * stored it off. Do not infer this from `participant` again; they are two
 * questions and the Server answers both.
 *
 * A permission the catalog does not describe is treated as staff: an unknown
 * right is more likely to be a new one somebody has been given than an ordinary
 * participant's, and guessing the other way quietly puts them in the ranking.
 */
export const isStaffGrant = (
    permissions: readonly string[],
    catalog: readonly PermissionDefinition[],
): boolean => permissions.some(key =>
    catalog.find(definition => definition.key === key)?.systemic !== false);

/**
 * What a grant's systemic flag is, given what it carries.
 *
 * Forced on for staff; otherwise whatever was asked for. One function, used by
 * the screen to draw the switch and by the fake to settle it on write, as the
 * Server settles it on write.
 */
export const systemicByDefault = (
    permissions: readonly string[],
    catalog: readonly PermissionDefinition[],
    asked: boolean | undefined,
): boolean => isStaffGrant(permissions, catalog) || asked === true;

/**
 * What a grant carries: every role it links, and its own entries, together.
 *
 * **One reader, mirroring the Server's `Permissions.Effective`.** Three screens
 * draw a permission set and the fake settles one on write; four unions written
 * four times would eventually disagree about somebody's access, and the one
 * that disagreed would be the one nobody looked at.
 *
 * A union, so there is no ordering to decide and no precedence to explain — and
 * a grant linking no role holds its whole set itself, which is what every
 * hand-made one does.
 *
 * **A dismissed role confers nothing**, which is why it arrives in its own list
 * and is not filtered out here: a caller passing `dismissedRoles` in would be
 * asking for what somebody decided against.
 */
export const effectivePermissions = (grant: {
    readonly permissions: readonly string[];
    readonly roles?: readonly { readonly permissions: readonly string[] }[];
}): string[] => [...new Set([
    ...(grant.roles ?? []).flatMap(role => [...role.permissions]),
    ...grant.permissions,
])];
