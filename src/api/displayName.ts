import { ManagedUser } from "./ManagerApi";

/**
 * The Server computes this for every name it sends; the Client needs it only
 * where it holds the parts — the users screen, which edits them.
 *
 * One definition, so a person is not "Jan Kowalski" on one screen and
 * `jkowalski` on the next.
 */
export const displayName = (user: Pick<ManagedUser, "firstName" | "lastName" | "username">): string =>
    [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username;
