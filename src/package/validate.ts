import { PackageConfig, PackageIssue, TestFile } from "./types";

/**
 * Checks a package before it is built.
 *
 * Every rule here exists because the alternative is a contest discovering it:
 * a test with no expected output judges nothing, a group with no tests is points
 * nobody can earn, and a checker named in the configuration but absent from the
 * archive fails on the first submission rather than at upload.
 */
/**
 * The most tests a group may declare a count for.
 *
 * One letter each. The Runner orders tests by comparing their letters as text,
 * so `aa` would sort before `z` and a result table would read out of order.
 */
const MOST_TESTS_IN_A_GROUP = 26;

export const validatePackage = (tests: TestFile[], config: PackageConfig, fileNames: string[]): PackageIssue[] => {
    const issues: PackageIssue[] = [];

    if (tests.length === 0) {
        issues.push({ level: "error", message: "The package has no tests" });
    }

    // **What a test needs depends on what judges it, and on nothing else.**
    //
    // With neither program the `.out` file is the whole verdict and the `.in` is
    // what the program reads, so both are required. A checker replaces the
    // comparison, so `.out` becomes the author's choice — it is still handed the
    // path, and whether anything is behind it is between the author and their
    // own checker. An interactor replaces the input as well, because the
    // submission is handed no file at all, so both do.
    //
    // These are the Runner's rules, from `TestSet::read`. The Client asserting
    // anything stricter is the Client refusing packages that judge, and anything
    // looser is a green "ready" on a package refused at judging time.
    if (config.interactor === undefined) {
        for (const test of tests.filter(t => t.input === undefined)) {
            issues.push({
                level: "error",
                message: "No input, and only an interactive problem may omit one",
                file: `${test.name}.in`,
            });
        }
        if (config.checker === undefined) {
            for (const test of tests.filter(t => t.output === undefined)) {
                issues.push({
                    level: "error",
                    message: "No expected output, and nothing else decides the verdict",
                    file: `${test.name}.in`,
                });
            }
        }
    }

    if (!Array.isArray(config.groups)) {
        // Reachable from a hand-written `config.yml`. A missing section is a
        // finding to report, not an exception to fall over.
        issues.push({ level: "error", message: "config.yml has no groups section", file: "config.yml" });
    }

    // **Normalised once, and everything below reads this.** The type says
    // `PackageGroup[]`, so nothing here is type-checked against a `config.yml`
    // somebody wrote by hand — and four of the five uses below had no guard, so
    // the very file the check above reports threw `TypeError` out of the
    // validator and the finding was never delivered. `build.ts` normalises the
    // same way for the reader path.
    const groups = Array.isArray(config.groups) ? config.groups : [];

    for (const group of groups) {
        // Zero or a negative number is not "inherit" — it is a limit nothing can
        // pass. An emptied field removes the override instead.
        if (group.limits?.timeMs !== undefined && group.limits.timeMs <= 0) {
            issues.push({
                level: "error",
                message: "Group {{group}} has a time limit that is not positive",
                values: { group: group.group },
            });
        }
        if (group.limits?.memoryBytes !== undefined && group.limits.memoryBytes <= 0) {
            issues.push({
                level: "error",
                message: "Group {{group}} has a memory limit that is not positive",
                values: { group: group.group },
            });
        }
    }

    for (const test of tests) {
        if (test.input !== undefined && test.input.trim().length === 0) {
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
    for (const group of groups) {
        if (!testGroups.has(group.group)) {
            issues.push({ level: "error", message: "Group {{group}} has no tests", values: { group: group.group } });
        }
    }
    for (const group of testGroups) {
        if (!groups.some(g => g.group === group)) {
            issues.push({
                level: "error",
                message: "Group {{group}} has tests but is not in the configuration",
                values: { group },
            });
        }
    }

    const total = groups.reduce((sum, g) => sum + g.points, 0);
    if (groups.length > 0 && total !== 100) {
        // Not an error: a problem may deliberately be worth something other than
        // a hundred. It is almost always a mistake, so it is said out loud.
        issues.push({ level: "warning", message: "The groups add up to {{total}} points, not 100", values: { total } });
    }

    // **A declared count is an interactive problem's census and nothing else's.**
    // Elsewhere the files in `tests/` are the census already, and a count beside
    // them is a second source of truth that can only disagree with the first.
    for (const group of Array.isArray(config.groups) ? config.groups : []) {
        if (group.tests === undefined) continue;
        if (config.interactor === undefined) {
            issues.push({
                level: "error",
                message: "Only an interactive problem may state how many tests a group has",
                file: "config.yml",
            });
        } else if (group.tests <= 0) {
            issues.push({
                level: "error",
                message: "A group of no tests would award its points to anybody",
                file: "config.yml",
            });
        } else if (group.tests > MOST_TESTS_IN_A_GROUP) {
            issues.push({
                level: "error",
                message: "A group may name at most {{most}} tests",
                values: { most: MOST_TESTS_IN_A_GROUP },
                file: "config.yml",
            });
        } else {
            // A file for a name the count does not reach is refused by the
            // Runner rather than ignored, so it is refused here too.
            const named = new Set(Array.from({ length: group.tests },
                (_, i) => `${group.group}${String.fromCharCode(97 + i)}`));
            for (const test of tests.filter(t => t.group === group.group && !named.has(t.name))) {
                issues.push({
                    level: "error",
                    message: "{{test}} is not one of the {{count}} tests its group declares",
                    values: { test: test.name, count: group.tests },
                    file: `${test.name}.in`,
                });
            }
        }
    }

    // **One or the other, never both.** They decide the same question, and a
    // package that declares both has not said which of them judges. The Runner
    // refuses it; saying so here is what stops a manager publishing one.
    if (config.checker && config.interactor) {
        issues.push({
            level: "error",
            message: "A package declares a checker or an interactor, never both",
        });
    }

    if (config.checker && !fileNames.includes(config.checker.source.split("/").pop() ?? "")) {
        issues.push({ level: "error", message: "The checker named in the configuration is not in the package" });
    }
    if (config.interactor && !fileNames.includes(config.interactor.source.split("/").pop() ?? "")) {
        issues.push({
            level: "error",
            message: "The interactor named in the configuration is not in the package",
        });
    }
    if (config.modelSolution && !fileNames.includes(config.modelSolution.source.split("/").pop() ?? "")) {
        issues.push({ level: "error", message: "The model solution named in the configuration is not in the package" });
    }

    if (config.limits.timeMs <= 0) {
        issues.push({ level: "error", message: "The time limit must be positive" });
    }
    if (config.limits.memoryBytes <= 0) {
        issues.push({ level: "error", message: "The memory limit must be positive" });
    }

    for (const field of ["time", "memory"] as const) {
        const rule = config.calibration?.[field];
        if (rule === undefined) continue;
        // A factor of zero derives a limit of zero from any measurement, which
        // is a package that fails everything including the solution it was
        // calibrated on.
        if (rule.factor !== undefined && rule.factor <= 0) {
            issues.push({ level: "error", message: "A calibration factor must be positive" });
        }
        if ((rule.add ?? 0) < 0 || (rule.roundTo ?? 0) < 0) {
            issues.push({ level: "error", message: "A calibration rule cannot subtract" });
        }
    }
    if (config.calibration && !config.modelSolution) {
        issues.push({ level: "warning", message: "Calibration is configured but there is no model solution to measure" });
    }

    return issues;
};

export const hasErrors = (issues: PackageIssue[]): boolean => issues.some(i => i.level === "error");
