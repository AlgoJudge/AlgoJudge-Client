import { BYTES_PER_MIB, CalibrationRule, DEFAULT_CALIBRATION, PackageCalibration, PackageLimits } from "./types";

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
 * The limits a measurement produces, or undefined where nothing was measured.
 *
 * Both fields are derived together: a calibration run measures both, and
 * applying one without the other would leave a package half calibrated.
 */
export const calibratedLimits = (calibration: PackageCalibration | undefined): Partial<PackageLimits> => {
    const measured = calibration?.measured;
    return {
        timeMs: measured?.timeMs === undefined
            ? undefined
            : applyCalibration(calibrationRule(calibration, "time"), measured.timeMs),
        memoryBytes: measured?.memoryBytes === undefined
            ? undefined
            : applyCalibration(calibrationRule(calibration, "memory"), measured.memoryBytes),
    };
};

/**
 * A measurement to show the rule against before anything has been measured.
 *
 * A worked example beats a formula: "at 250 ms the limit is 850 ms" is read
 * correctly by everyone, and `measured × 3 + 100` is not.
 */
export const EXAMPLE_TIME_MS = 250;
export const EXAMPLE_MEMORY_BYTES = 32 * BYTES_PER_MIB;
