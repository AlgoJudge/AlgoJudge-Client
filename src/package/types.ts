/**
 * The Runner package for `standard-io@1`.
 *
 * Specified in `docs/specs/PACKAGE_FORMAT.md`. The package is assembled in the
 * Client, not on the Server: its layout is a property of the problem type, and
 * the Server is not allowed to know one type from another.
 */

export const PACKAGE_FORMAT = "standard-io";
export const PACKAGE_VERSION = 1;

export interface PackageLimits {
    timeMs: number;
    memoryMb: number;
}

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

export interface PackageIssue {
    level: IssueLevel;
    message: string;
    /** The file the issue is about, when it is about one. */
    file?: string;
}

export const emptyConfig = (): PackageConfig => ({
    format: PACKAGE_FORMAT,
    version: PACKAGE_VERSION,
    limits: { timeMs: 1000, memoryMb: 256 },
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
