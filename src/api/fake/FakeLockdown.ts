import { AddressRule, ManagedSeries } from "../ManagerApi";
import { NORMAL_IMPORTANCE } from "../seriesImportance";

/** What a round says about itself, from wherever the fake keeps it. */
export interface Restricted {
    id: string;
    activityId: string;
    name: string;
    importance: number;
    addressRules: AddressRule[];
    restrictionsEnabled: boolean;
    isOpen: boolean;
}

/**
 * Which rounds put the rest out of reach, shared by both halves of the fake.
 *
 * Held apart from either API for the reason `FakeAccess` is: the manager panel
 * **writes** a round's rank and ranges and the participant's screens **read**
 * what they do. Two copies would leave a round restricted in one screen and
 * wide open in another.
 *
 * The Server needs no such object — one query answers it there. This exists so
 * the fake cannot answer a question the Server would answer differently.
 */
export class FakeLockdown {
    /** Rank and ranges per round, written by the manager panel during a visit. */
    private readonly rounds = new Map<string, Restricted>();

    /** The installation-wide switch, as `Instance.SeriesRestrictionsEnabled` is. */
    enabled = true;

    /**
     * Where this browser is standing.
     *
     * `?fakeAddress=10.0.5.17` the same way `?fakeUser=` signs somebody in —
     * a browser has no way to know its own address, and a check has to be able
     * to stand inside the room and outside it. **Absent is not "anywhere"**: it
     * is an address the Server could not read, which admits nobody and locks
     * nobody, exactly as the real one behaves.
     */
    address(): string | undefined {
        return new URLSearchParams(window.location.search).get("fakeAddress") ?? undefined;
    }

    remember(series: ManagedSeries): void {
        this.rounds.set(series.id, {
            id: series.id,
            activityId: series.activityId,
            name: series.name,
            importance: series.importance,
            addressRules: series.addressRules,
            restrictionsEnabled: series.restrictionsEnabled,
            isOpen: series.isOpen,
        });
    }

    forget(seriesId: string): void {
        this.rounds.delete(seriesId);
    }

    /**
     * What is out of reach for this reader, given which activities they are in.
     *
     * **It follows the grant, not the room**: only a round somebody takes part
     * in can displace anything, so a student sitting in the same laboratory and
     * not writing the examination loses nothing.
     */
    state(activityIds: string[], exemptIn: string[] = []): LockdownState {
        if (!this.enabled) return OPEN;

        const mine = new Set(activityIds);
        const hidden = new Set<string>();
        let top: Restricted | undefined;

        for (const round of this.rounds.values()) {
            if (!round.isOpen || !round.restrictionsEnabled) continue;
            if (round.importance === NORMAL_IMPORTANCE && round.addressRules.length === 0) continue;
            if (!mine.has(round.activityId)) continue;

            if (round.addressRules.length > 0 && !this.admits(round)) {
                hidden.add(round.id);
                continue;
            }
            if (round.importance > (top?.importance ?? 0)) top = round;
        }

        if (!top) return { floor: 0, hidden, exempt: false };
        return {
            floor: top.importance,
            bySeriesName: top.name,
            hidden,
            exempt: exemptIn.includes(top.activityId),
        };
    }

    /** Whether an activity runs anything that survives the floor. */
    locksActivity(state: LockdownState, activityId: string): boolean {
        if (state.floor === 0 || state.exempt) return false;
        for (const round of this.rounds.values()) {
            if (round.activityId !== activityId || !round.isOpen) continue;
            if (round.importance >= state.floor && !state.hidden.has(round.id)) return false;
        }
        return true;
    }

    /**
     * Whether one of this round's ranges holds the address.
     *
     * Prefix matching on the dotted form rather than arithmetic on the bits: the
     * fake needs to tell one seeded laboratory from one seeded elsewhere, and a
     * subnet calculator here would be a second implementation of a rule the
     * Server owns. The checks use ranges this can answer.
     */
    private admits(round: Restricted): boolean {
        const address = this.address();
        if (!address) return false;

        return round.addressRules.some(rule => {
            const [base, bits] = rule.network.split("/");
            const size = Number(bits);
            if (size === 32) return address === base;
            // /24, /16, /8 — as many leading octets as the prefix names.
            const octets = Math.floor(size / 8);
            if (octets === 0 || size % 8 !== 0) return false;
            return address.split(".").slice(0, octets).join(".")
                === base.split(".").slice(0, octets).join(".");
        });
    }
}

export interface LockdownState {
    floor: number;
    bySeriesName?: string;
    hidden: Set<string>;
    exempt: boolean;
}

const OPEN: LockdownState = { floor: 0, hidden: new Set(), exempt: false };

/** Whether a round of this rank is displaced. */
export const isLocked = (state: LockdownState, importance: number): boolean =>
    !state.exempt && importance < state.floor;
