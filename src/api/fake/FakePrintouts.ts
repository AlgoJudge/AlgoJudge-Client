import { Printout } from "../ParticipantApi";
import { FakePrintout, printoutsFor } from "./fixtures/printouts";
import { SeedActivity } from "./fixtures/world";

/** A stored row, and where it belongs. */
export type StoredPrintout = FakePrintout & { activityId: string };

/**
 * The print queue, shared by both halves of the fake.
 *
 * Held apart from either API for the reason `FakeExclusions` is: the participant
 * **writes** a request and the operator's screen **reads** it, resolves it, and
 * disposes of the source. Two copies would let somebody send a page that never
 * reached the queue — which is the one thing the browser check has to see happen
 * end to end.
 *
 * The Server needs no such object; it has one table. This exists so the fake
 * cannot answer a question the Server would answer differently.
 */
export class FakePrintouts {
    /** Keyed by activity id, oldest first — the order a queue is worked in. */
    private readonly byActivity = new Map<string, FakePrintout[]>();

    constructor(world: SeedActivity[]) {
        for (const activity of world) {
            this.byActivity.set(activity.id, printoutsFor(activity.id, activity.modules.printouts));
        }
    }

    /** Every queue, flattened, each row carrying where it belongs. */
    all(): StoredPrintout[] {
        return [...this.byActivity.entries()]
            .flatMap(([activityId, rows]) => rows.map(row => Object.assign(row, { activityId })));
    }

    /** What one person asked for in one activity, newest first. */
    mine(activityId: string, userId: string): Printout[] {
        return (this.byActivity.get(activityId) ?? [])
            .filter(row => row.requestedByUserId === userId)
            .sort((a, b) => Date.parse(b.requestedAt) - Date.parse(a.requestedAt))
            .map(row => ({
                id: row.id,
                title: row.title,
                fileName: row.fileName,
                sizeBytes: row.sizeBytes,
                state: row.state,
                requestedAt: row.requestedAt,
                resolvedAt: row.resolvedAt,
            }));
    }

    find(id: string): StoredPrintout | undefined {
        return this.all().find(row => row.id === id);
    }

    add(activityId: string, row: FakePrintout): void {
        this.byActivity.set(activityId, [...(this.byActivity.get(activityId) ?? []), row]);
    }

    /** How many of somebody's requests are still waiting, which is the ceiling. */
    pending(activityId: string, userId: string): number {
        return (this.byActivity.get(activityId) ?? [])
            .filter(row => row.requestedByUserId === userId && row.state === "requested")
            .length;
    }
}
