/**
 * The Runner package for `standard-io@1`.
 *
 * Specified in `docs/specs/PACKAGE_FORMAT.md`. The package is assembled in the
 * Client, not on the Server: its layout is a property of the problem type, and
 * the Server is not allowed to know one type from another.
 */

export const PACKAGE_FORMAT = "standard-io";
export const PACKAGE_VERSION = 1;

/**
 * The two files a version's package owns.
 *
 * Both are derived from what the builder holds — the archive the Runner
 * evaluates, and the examples the participant downloads — and both are rebuilt
 * whenever the package is. They appear in a version's file list because that is
 * where a version's files live, but they are not attachments: deleting one from
 * that list would leave a problem that cannot be judged, or an example set that
 * no longer matches the tests.
 */
export const PACKAGE_ARCHIVE = "package.zip";
export const SAMPLES_ARCHIVE = "examples.zip";

export const isPackageFile = (name: string): boolean =>
    name === PACKAGE_ARCHIVE || name === SAMPLES_ARCHIVE;

/**
 * Limits as `config.yml` states them.
 *
 * Memory is in **kibibytes** — 1024 bytes — which is the unit `sinolpack` uses,
 * so importing one is a copy rather than a division with a rounding rule. What a
 * person types is another matter: the builder offers KiB or MiB and converts, so
 * nobody has to write 262144 to mean 256 MiB.
 */
export interface PackageLimits {
    timeMs: number;
    memoryKib: number;
}

export const KIB_PER_MIB = 1024;

export interface PackageGroup {
    group: number;
    points: number;
    /** Group 0 by convention: the tests shown in the statement. */
    examples?: boolean;
    /** Narrows the global limits for this group alone. */
    limits?: Partial<PackageLimits>;
}

export interface PackageProgram {
    source: string;
    language: string;
}

/**
 * How a measurement of the model solution becomes a limit.
 *
 * `measured × factor + add`, rounded **up** to `roundTo`, all in the field's own
 * unit — milliseconds for time, kibibytes for memory. Rounded up rather than to
 * nearest, because a limit that lands below the measurement it came from fails
 * the solution it was derived from.
 */
export interface CalibrationRule {
    factor?: number;
    add?: number;
    roundTo?: number;
}

/**
 * Calibration: the rule, and what a calibration job last measured.
 *
 * The measurement happens **once, on request** — an `EvaluationJob` marked as a
 * calibration — and the numbers it produces are written into `config.yml`.
 * Judging never runs the model solution: a limit has to be a stated number that
 * every submission met or missed, not something recomputed per run on whichever
 * Runner picked the job up.
 */
export interface PackageCalibration {
    time?: CalibrationRule;
    memory?: CalibrationRule;
    /** What was measured, and where. Written by the calibration job. */
    measured?: {
        timeMs?: number;
        memoryKib?: number;
        at?: string;
        runner?: string;
    };
}

/** Used where the package states no rule of its own. */
export const DEFAULT_CALIBRATION: { time: CalibrationRule; memory: CalibrationRule } = {
    // Three times the model solution, rounded up to a tenth of a second: the
    // factor a problem setter reaches for, and the rounding that keeps a limit
    // readable in a statement.
    time: { factor: 3, add: 0, roundTo: 100 },
    // Memory does not scale with a slower language the way time does; what a
    // weaker solution needs is headroom, not a multiple.
    memory: { factor: 1, add: 16 * KIB_PER_MIB, roundTo: KIB_PER_MIB },
};

export interface PackageConfig {
    format: string;
    version: number;
    limits: PackageLimits;
    overrideLimits?: Record<string, Partial<PackageLimits>>;
    groups: PackageGroup[];
    /** Absent means the `.out` files decide. */
    checker?: PackageProgram;
    /** Used for calibration, never for judging. */
    modelSolution?: PackageProgram;
    /** How a measurement of the model solution turns into a limit. */
    calibration?: PackageCalibration;
    extraCompilationFiles?: string[];
}

/** One test, as the builder holds it before the archive exists. */
export interface TestFile {
    /** `1a`, `2b` — the group and the letter, without an extension. */
    name: string;
    group: number;
    letter: string;
    input: string;
    /** Absent when a checker decides the verdict instead. */
    output?: string;
}

export type IssueLevel = "error" | "warning";

/**
 * One finding about a package.
 *
 * `message` is the English sentence **and** the translation key, as everywhere
 * else in the product: the validator knows nothing about languages, and the
 * screen that shows a finding translates it. Numbers travel in `values` rather
 * than baked into the sentence, because a translation puts them elsewhere.
 */
export interface PackageIssue {
    level: IssueLevel;
    message: string;
    values?: Record<string, string | number>;
    /** The file the issue is about, when it is about one. */
    file?: string;
}

export const emptyConfig = (): PackageConfig => ({
    format: PACKAGE_FORMAT,
    version: PACKAGE_VERSION,
    limits: { timeMs: 1000, memoryKib: 256 * KIB_PER_MIB },
    groups: [],
});

/**
 * Splits `1a.in` into its group and letter.
 *
 * The problem's short name is deliberately not part of a test file name — tying
 * one to a name that can be changed means renaming a problem rewrites its
 * package.
 */
export const parseTestName = (fileName: string): { name: string; group: number; letter: string } | undefined => {
    const match = /^(\d+)([a-z]+)\.(in|out)$/i.exec(fileName);
    if (!match) return undefined;
    return {
        name: `${match[1]}${match[2].toLowerCase()}`,
        group: Number(match[1]),
        letter: match[2].toLowerCase(),
    };
};
