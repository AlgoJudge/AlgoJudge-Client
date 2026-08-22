import { languageLabel } from "../editor/languages";
import { typeOf } from "../submission/offered";

/**
 * The limits a participant is shown, read out of the assignment's `config`.
 *
 * **This is the first time they have been shown at all.** `ProblemDetail.limits`
 * was declared in the contract from the day it was written and filled by
 * nothing: the numbers live inside a document the Server stores and does not
 * read, so there was never a value it could put there. The badges on the problem
 * page rendered against the Client's fake and against nothing else.
 *
 * ## Why two tables and not one
 *
 * `config.yml` states limits on two axes and **there is no value on both at
 * once**: `groups[].limits` is per group for every language, `overrideLimits` is
 * per language for every group. The format records this as an open question and
 * the Runner's `Config::effective` picks a reading — **most specific first**, so
 * a group's own limits beat a language override rather than composing with it.
 *
 * A single table would have to invent the cell where the two meet. Two tables
 * state what is actually written, and the group table marks the rows that ignore
 * the language one — which is the part a participant would otherwise get wrong.
 */

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

const number = (value: unknown): number | undefined =>
    typeof value === "number" && Number.isFinite(value) ? value : undefined;

export interface Limits {
    timeMs?: number,
    memoryBytes?: number,
}

const readLimits = (value: unknown): Limits => {
    if (!isRecord(value)) return {};
    return { timeMs: number(value.timeMs), memoryBytes: number(value.memoryBytes) };
};

const stated = (limits: Limits): boolean =>
    limits.timeMs !== undefined || limits.memoryBytes !== undefined;

/** The later value wins per field, which is what the Runner's `apply` does. */
const over = (below: Limits, above: Limits): Limits => ({
    timeMs: above.timeMs ?? below.timeMs,
    memoryBytes: above.memoryBytes ?? below.memoryBytes,
});

/**
 * The package-wide pair, before any group or language narrows it.
 *
 * Absent where the assignment states none — which is not "no limit", it is
 * "this assignment did not override the package", and the package's own numbers
 * are not published. The screen says nothing rather than guessing.
 */
export function baseLimits(config: unknown): Limits | undefined {
    if (!isRecord(config)) return undefined;
    const base = readLimits(config.limits);
    return stated(base) ? base : undefined;
}

export interface GroupLimits {
    group: number,
    points?: number,
    examples: boolean,
    /** Whether the group states limits of its own — the rows a language override does not reach. */
    own: boolean,
    limits: Limits,
}

export function limitsByGroup(config: unknown): GroupLimits[] {
    if (!isRecord(config) || !Array.isArray(config.groups)) return [];
    const base = readLimits(config.limits);

    return config.groups.flatMap((entry): GroupLimits[] => {
        if (!isRecord(entry)) return [];
        const group = number(entry.group);
        if (group === undefined) return [];

        const own = readLimits(entry.limits);
        return [{
            group,
            points: number(entry.points),
            examples: entry.examples === true,
            own: stated(own),
            limits: over(base, own),
        }];
    });
}

export interface LanguageLimits {
    /** A family (`cpp`) or one toolchain (`pypy3`), as the package wrote it. */
    key: string,
    label: string,
    limits: Limits,
}

/**
 * One row per key the package's `overrideLimits` names.
 *
 * **Not one row per offered language.** A package writes `python` and means both
 * interpreters; expanding that into every toolchain in the family would show a
 * participant rows nobody wrote and would go wrong the moment a Runner learned a
 * toolchain this build has not heard of.
 *
 * A key that is a family has no label in the catalogue and shows as itself,
 * which reads correctly: `cpp` is what the package says the rule applies to.
 */
export function limitsByLanguage(config: unknown): LanguageLimits[] {
    if (!isRecord(config) || !isRecord(config.overrideLimits)) return [];
    const base = readLimits(config.limits);
    const type = typeOf(config);

    return Object.entries(config.overrideLimits).flatMap(([key, value]): LanguageLimits[] => {
        const own = readLimits(value);
        if (!stated(own)) return [];
        return [{ key, label: languageLabel(type, key), limits: over(base, own) }];
    });
}

/** Seconds, because that is the unit a limit is stated in to a person. */
export const showTime = (ms: number | undefined): string =>
    ms === undefined ? "—" : `${(ms / 1000).toFixed(2)} s`;

/** Mebibytes, rounded. The stored unit is bytes everywhere since 2026-08-09. */
export const showMemory = (bytes: number | undefined): string =>
    bytes === undefined ? "—" : `${Math.round(bytes / (1024 * 1024))} MiB`;
