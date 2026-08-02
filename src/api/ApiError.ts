export class ApiError extends Error {
}

export class UnauthorizedError extends ApiError {
    constructor() {
        super("Unauthorized");
    }
}

export class ForbiddenError extends ApiError {
    constructor() {
        super("Forbidden");
    }
}

export class InvalidStatusError extends ApiError {
    constructor(readonly status: number) {
        super(`Server responded with status ${status}`);
    }
}
