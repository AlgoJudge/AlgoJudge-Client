import {
    BYTES_PER_MIB, CalibrationRule, DEFAULT_CALIBRATION, PackageCalibration, PackageLimits,
} from "./types";

/**
 * Turning a measurement of the model solution into a limit.
 *
 * The measurement is taken **once**, by a calibration `EvaluationJob` a manager
 * asks for, and the resulting numbers are written into `config.yml`. Judging
 * never runs the model solution, for three reasons that all point the same way:
 *
 * 1. A limit is a stated number. A participant reads it in the statement and a
 *    result is attributable to it. Recomputing it per run would give two
 *    submissions two different limits, and neither would know which.
 * 2. Runners differ. A limit derived on whichever machine picked the job up
 *    would make the verdict a property of that machine.
 * 3. It would double the cost of every judging run, to produce a number that
 *    barely moves between them.
 */

/** `measured × factor + add`, rounded up to `roundTo`. */
export const applyCalibration = (rule: CalibrationRule | undefined, measured: number): number => {
    const scaled = measured * (rule?.factor ?? 1) + (rule?.add ?? 0);
    const step = rule?.roundTo ?? 0;
    return step > 0 ? Math.ceil(scaled / step) * step : Math.ceil(scaled);
};

/** The rule in force for one field: the package's own, or the default. */
export const calibrationRule = (
    calibration: PackageCalibration | undefined,
    field: "time" | "memory",
): CalibrationRule => calibration?.[field] ?? DEFAULT_CALIBRATION[field];

/**
 * What one group's limits should be, given everything measured for it.
 *
 * **From the slowest language measured**, which is the rule
 * `PACKAGE_FORMAT.md` states while the per-group-per-language slot is still an
 * open question: a group's limit has to accommodate every language the activity
 * accepts, so the fastest reference would set a limit the others cannot meet.
 *
 * Memory is absent unless **every** row for the group carried one. A maximum
 * over "some numbers and some absences" is not a measurement of the group, and
 * a limit derived from a partial one would look entirely reasonable.
 */
export const suggestedForGroup = (
    calibration: PackageCalibration | undefined,
    group: number,
): Partial<PackageLimits> => {
    const rows = (calibration?.measured ?? []).filter(m => m.group === group);
    if (rows.length === 0) return {};

    const timeMs = Math.max(...rows.map(m => m.timeMs));
    const memories = rows.map(m => m.memoryBytes);
    const memoryBytes = memories.every(m => m !== undefined)
        ? Math.max(...(memories as number[]))
        : undefined;

    return {
        timeMs: applyCalibration(calibrationRule(calibration, "time"), timeMs),
        memoryBytes: memoryBytes === undefined
            ? undefined
            : applyCalibration(calibrationRule(calibration, "memory"), memoryBytes),
    };
};

/** Every group that was measured, in the order the rows arrived. */
export const measuredGroups = (calibration: PackageCalibration | undefined): number[] =>
    [...new Set((calibration?.measured ?? []).map(m => m.group))].sort((a, b) => a - b);

/**
 * One suggestion per measured group.
 *
 * Returned as a map rather than applied, because **applying it is a decision**:
 * the measurement is a fact and the limit is a choice, and a screen that wrote
 * the numbers in on arrival would take that choice away.
 */
export const suggestedLimits = (
    calibration: PackageCalibration | undefined,
): Map<number, Partial<PackageLimits>> =>
    new Map(measuredGroups(calibration).map(g => [g, suggestedForGroup(calibration, g)]));

/**
 * A measurement to show the rule against before anything has been measured.
 *
 * A worked example beats a formula: "at 250 ms the limit is 850 ms" is read
 * correctly by everyone, and `measured × 3 + 100` is not.
 */
export const EXAMPLE_TIME_MS = 250;
export const EXAMPLE_MEMORY_BYTES = 32 * BYTES_PER_MIB;
