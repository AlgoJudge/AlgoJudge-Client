import { SeedActivity, attemptId, attemptTime } from "./fixtures/world";

/** A manager's ruling, as the manager's own screen shows it. */
export interface Exclusion {
    at: string;
    by: string;
    reason?: string;
}

/**
 * Which submissions count towards no standing, shared by both halves of the fake.
 *
 * Held apart from either API for the reason `FakeAccess` is: the manager screen
 * **writes** the ruling and the participant's board and submissions **read** it.
 * Two copies would let a manager rule a submission out and leave it scoring.
 *
 * The Server needs no such object — it has one table. This exists so the fake
 * cannot answer a question the Server would answer differently.
 */
export class FakeExclusions {
    private readonly ruled = new Map<string, Exclusion>();

    /**
     * Seeded from the world, so the fixture's own excluded attempt and anything
     * ruled out during a visit are one set rather than two.
     */
    constructor(world: SeedActivity[]) {
        for (const activity of world) {
            for (const series of activity.series) {
                for (const attempt of series.attempts ?? []) {
                    if (attempt.excluded !== true) continue;
                    this.ruled.set(attemptId(series.id, attempt), {
                        at: attemptTime(series, attempt),
                        by: "Anna Kowalska",
                        reason: attempt.exclusionReason,
                    });
                }
            }
        }
    }

    has(submissionId: string): boolean {
        return this.ruled.has(submissionId);
    }

    of(submissionId: string): Exclusion | undefined {
        return this.ruled.get(submissionId);
    }

    /** Lifting clears the reason with it: a ruling not in force explains nothing. */
    set(submissionId: string, excluded: boolean, reason: string | undefined, by: string): void {
        if (!excluded) {
            this.ruled.delete(submissionId);
            return;
        }
        this.ruled.set(submissionId, {
            at: new Date().toISOString(),
            by,
            reason: reason?.trim() === "" ? undefined : reason?.trim(),
        });
    }
}
