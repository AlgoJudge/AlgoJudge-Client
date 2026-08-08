/**
 * How the fake refuses.
 *
 * `ApiError.ts` promises that "the fake throws the same classes, so a screen
 * behaves the same way against both". Until 2026-08-08 it did not: every slug
 * conflict, every "refused because something exists", every not-found and the
 * checksum mismatch went through `Utils.throwError`, which is `new Error(message)`
 * with no `status`, no `code` and no `fields`. `ConflictError`, `NotFoundError`,
 * `ValidationError` and `ChecksumMismatchError` were declared and thrown nowhere.
 *
 * That cost nothing in production — the transport builds them from
 * `problem+json` — but it meant a screen's behaviour against the fake was not
 * evidence of its behaviour against the Server, which is the whole reason the
 * fake exists.
 *
 * **The codes are the Server's, not invented here.** Each one below is a string
 * `AlgoJudge-Server` actually emits; where the Server names no code for a case,
 * these pass none rather than making one up, because a code the Server never
 * sends is a code no screen can rely on.
 */
import {
    ChecksumMismatchError,
    ConflictError,
    ForbiddenError,
    NotFoundError,
    UnauthorizedError,
    ValidationError,
} from "../ApiError";

/**
 * It is not there — or it is there and this caller may not know that.
 *
 * Both answer the same way on purpose: a guessable address that answered 403
 * would confirm the thing exists.
 */
export const notFound: (what: string) => never = what => {
    throw new NotFoundError(`${what} does not exist`, "not_found");
};

/** Nobody is signed in, or the credentials were refused. */
export const unauthenticated: (message: string) => never = message => {
    throw new UnauthorizedError(message, "unauthenticated");
};

/**
 * Signed in, and refused because of **when** or **what** — a closed round, a
 * language the activity does not take, a permission the caller does not hold to
 * give away. No grant changes it, which is what separates it from a missing
 * permission.
 */
export const forbidden: (message: string, code?: string) => never = (message, code) => {
    throw new ForbiddenError(message, code);
};

/**
 * Understood, well formed, and refused because of what is already there — a slug
 * in use, an assignment that has submissions.
 */
export const conflict: (message: string, code?: string) => never = (message, code) => {
    throw new ConflictError(message, code);
};

/** The input was wrong. */
export const invalid: (message: string, code?: string) => never = (message, code) => {
    throw new ValidationError(message, code);
};

/** The bytes did not match the checksum that came with them. */
export const checksumMismatch: (message: string) => never = message => {
    throw new ChecksumMismatchError(message);
};
