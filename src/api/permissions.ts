import { PermissionDefinition } from "./ManagerApi";

/**
 * Whether a set of permissions makes a grant a staff grant.
 *
 * Anything a participant does not hold is staff: managing the activity, judging,
 * answering questions, reading other people's submissions. A grant carrying any
 * of it is a membership that **runs** the activity rather than takes part in it,
 * and that decides whether it counts among the competitors — a jury member in
 * the ranking beside the students is a bug, not a preference.
 *
 * Asked of the catalogue rather than of a list kept here, because the catalogue
 * is the Server's and this rule has to be the same on both sides. A permission
 * the catalogue does not describe is treated as staff: an unknown right is more
 * likely to be a new one somebody has been given than an ordinary participant's.
 */
export const isStaffGrant = (
    permissions: readonly string[],
    catalogue: readonly PermissionDefinition[],
): boolean => permissions.some(key =>
    catalogue.find(definition => definition.key === key)?.participant !== true);

/**
 * What a grant's systemic flag is, given what it carries.
 *
 * Forced on for staff; otherwise whatever was asked for. One function, used by
 * the screen to draw the switch and by the fake to settle it on write, as the
 * Server settles it on write.
 */
export const systemicByDefault = (
    permissions: readonly string[],
    catalogue: readonly PermissionDefinition[],
    asked: boolean | undefined,
): boolean => isStaffGrant(permissions, catalogue) || asked === true;
