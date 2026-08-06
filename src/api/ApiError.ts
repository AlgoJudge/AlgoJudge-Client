/**
 * What a failed call throws.
 *
 * The transport used to distinguish three cases — 401, 403, everything else —
 * so a screen could not tell a rejected value from a name already taken from a
 * truncated upload, and printed "Server responded with status 422" at somebody
 * who had typed a slug that exists. The Server answers `application/problem+json`
 * (RFC 9457) with a machine-readable `code`; these are that document, typed.
 *
 * The fake throws the same classes, so a screen behaves the same way against
 * both — which is the point of having one API layer.
 */
export class ApiError extends Error {
    constructor(
        message: string,
        /** HTTP status, where there was one. */
        readonly status?: number,
        /**
         * The Server's own name for what went wrong, e.g. `slug_taken`. Stable
         * across languages and releases; the message is not.
         */
        readonly code?: string,
        /** Whatever else the problem document carried. */
        readonly details?: unknown,
    ) {
        super(message);
    }
}

export class UnauthorizedError extends ApiError {
    constructor(message = "Unauthorized", code?: string, details?: unknown) {
        super(message, 401, code, details);
    }
}

export class ForbiddenError extends ApiError {
    constructor(message = "Forbidden", code?: string, details?: unknown) {
        super(message, 403, code, details);
    }
}

export class NotFoundError extends ApiError {
    constructor(message = "Not found", code?: string, details?: unknown) {
        super(message, 404, code, details);
    }
}

/**
 * The request was understood and refused because of what is already there — a
 * slug in use, a version published under this number, a Runner already
 * approved. Separate from validation because the caller's input was well formed.
 */
export class ConflictError extends ApiError {
    constructor(message = "Conflict", code?: string, details?: unknown) {
        super(message, 409, code, details);
    }
}

/** The request was well formed and its contents were refused. */
export class ValidationError extends ApiError {
    constructor(
        message = "Invalid request",
        code?: string,
        details?: unknown,
        status = 422,
        /** Field name to message, where the Server named fields. */
        readonly fields?: Record<string, string[]>,
    ) {
        super(message, status, code, details);
    }
}

/**
 * The bytes did not match the checksum sent with them.
 *
 * Its own class because its remedy is its own: not "correct the form" but
 * "send it again". See `docs/specs/FILE_INTEGRITY.md`.
 */
export class ChecksumMismatchError extends ValidationError {
    constructor(message = "Checksum mismatch", details?: unknown) {
        super(message, "checksum_mismatch", details);
    }
}

export class InvalidStatusError extends ApiError {
    constructor(readonly httpStatus: number, message = `Server responded with status ${httpStatus}`, code?: string, details?: unknown) {
        super(message, httpStatus, code, details);
    }
}

/** The shape of an RFC 9457 problem document, as this Server writes one. */
export interface ProblemDocument {
    title?: string;
    detail?: string;
    status?: number;
    /** This product's addition: a stable name for the case. */
    code?: string;
    /** Field name to messages, for a form to place them. */
    errors?: Record<string, string[]>;
}

/**
 * Turns a status and whatever body came with it into the right error.
 *
 * Status decides the class, `code` refines it: a 422 is a validation failure
 * unless it says `checksum_mismatch`, which is a different thing to tell
 * somebody about.
 */
export const toApiError = (status: number, problem?: ProblemDocument): ApiError => {
    const message = problem?.detail ?? problem?.title;
    const code = problem?.code;
    switch (status) {
        case 401: return new UnauthorizedError(message ?? undefined, code, problem);
        case 403: return new ForbiddenError(message ?? undefined, code, problem);
        case 404: return new NotFoundError(message ?? undefined, code, problem);
        case 409: return new ConflictError(message ?? undefined, code, problem);
        case 400:
        case 422:
            if (code === "checksum_mismatch") return new ChecksumMismatchError(message ?? undefined, problem);
            return new ValidationError(message ?? undefined, code, problem, status, problem?.errors);
        default:
            return new InvalidStatusError(status, message ?? undefined, code, problem);
    }
};
