import { PackageConfig, PackageIssue, TestFile } from "./types";

/**
 * Checks a package before it is built.
 *
 * Every rule here exists because the alternative is a contest discovering it:
 * a test with no expected output judges nothing, a group with no tests is points
 * nobody can earn, and a checker named in the configuration but absent from the
 * archive fails on the first submission rather than at upload.
 */
export const validatePackage = (tests: TestFile[], config: PackageConfig, fileNames: string[]): PackageIssue[] => {
    const issues: PackageIssue[] = [];

    if (tests.length === 0) {
        issues.push({ level: "error", message: "The package has no tests" });
    }

    // Without a checker an expected output is the only thing that decides a
    // verdict, so a missing `.out` is not a warning.
    if (!config.checker) {
        for (const test of tests.filter(t => t.output === undefined)) {
            issues.push({
                level: "error",
                message: "No expected output and no checker",
                file: `${test.name}.in`,
            });
        }
    }

    if (!Array.isArray(config.groups)) {
        // Reachable from a hand-written `config.yml`. A missing section is a
        // finding to report, not an exception to fall over.
        issues.push({ level: "error", message: "config.yml has no groups section", file: "config.yml" });
    }

    for (const test of tests) {
        if (test.input.trim().length === 0) {
            issues.push({ level: "error", message: "The input is empty", file: `${test.name}.in` });
        }
        if (test.output !== undefined && test.output.trim().length === 0) {
            issues.push({ level: "warning", message: "The expected output is empty", file: `${test.name}.out` });
        }
    }

    const seen = new Set<string>();
    for (const test of tests) {
        if (seen.has(test.name)) {
            issues.push({ level: "error", message: "Duplicated test name", file: test.name });
        }
        seen.add(test.name);
    }

    // A file name carrying a path would place an entry outside the archive's
    // layout, which is how a package escapes the directory it is unpacked into.
    for (const name of fileNames) {
        if (name.includes("/") || name.includes("\\") || name.includes("..")) {
            issues.push({ level: "error", message: "The file name contains a path", file: name });
        }
    }

    const testGroups = new Set(tests.map(t => t.group));
    for (const group of config.groups) {
        if (!testGroups.has(group.group)) {
            issues.push({ level: "error", message: `Group ${group.group} has no tests` });
        }
    }
    for (const group of testGroups) {
        if (!config.groups.some(g => g.group === group)) {
            issues.push({ level: "error", message: `Group ${group} has tests but is not in the configuration` });
        }
    }

    const total = config.groups.reduce((sum, g) => sum + g.points, 0);
    if (config.groups.length > 0 && total !== 100) {
        // Not an error: a problem may deliberately be worth something other than
        // a hundred. It is almost always a mistake, so it is said out loud.
        issues.push({ level: "warning", message: `The groups add up to ${total} points, not 100` });
    }

    if (config.checker && !fileNames.includes(config.checker.source.split("/").pop() ?? "")) {
        issues.push({ level: "error", message: "The checker named in the configuration is not in the package" });
    }
    if (config.modelSolution && !fileNames.includes(config.modelSolution.source.split("/").pop() ?? "")) {
        issues.push({ level: "error", message: "The model solution named in the configuration is not in the package" });
    }

    if (config.limits.timeMs <= 0) {
        issues.push({ level: "error", message: "The time limit must be positive" });
    }
    if (config.limits.memoryMb <= 0) {
        issues.push({ level: "error", message: "The memory limit must be positive" });
    }

    return issues;
};

export const hasErrors = (issues: PackageIssue[]): boolean => issues.some(i => i.level === "error");
