import { ExtraFile } from "./build";
import { parseTestName, TestFile } from "./types";

/**
 * Turns whatever a manager dropped into the tests and programs of a package.
 *
 * Files are paired by base name, which is the whole convention: `1a.in` belongs
 * with `1a.out`. A `.zip` is unpacked first and its entries treated the same
 * way, because a set of tests usually arrives as one.
 */

export interface Intake {
    tests: TestFile[];
    checker?: ExtraFile;
    interactor?: ExtraFile;
    modelSolution?: ExtraFile;
    /** Named so a manager can see what was ignored rather than wonder. */
    unrecognised: string[];
}

const SOURCE = /\.(cpp|cc|c|py|java|rs|go|pas)$/i;

const isChecker = (name: string) => /chk|check/i.test(name) && SOURCE.test(name);
/**
 * **Tested before the checker**, and that ordering is the whole of it.
 *
 * `interactor.cpp` matches neither of the other two, so order would not seem to
 * matter — but `interactive-checker.cpp` matches this **and** `isChecker`, and
 * the more specific has to win. `/inter/` alone would swallow `interpolate.cpp`.
 */
const isInteractor = (name: string) => /interactor|interakt|interactive/i.test(name) && SOURCE.test(name);
const isModel = (name: string) => /model|wzor|sol/i.test(name) && SOURCE.test(name);

export const intakeFiles = async (files: File[]): Promise<Intake> => {
    const flat: { name: string; content: string }[] = [];

    for (const file of files) {
        if (/\.zip$/i.test(file.name)) {
            const { unzipSync } = await import("fflate");
            const entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
            const decoder = new TextDecoder();
            for (const [path, bytes] of Object.entries(entries)) {
                // Only the base name matters; a package is flat inside its
                // directories and an entry carrying a path is dropped by the
                // validator anyway.
                const name = path.split("/").pop() ?? path;
                if (name) flat.push({ name, content: decoder.decode(bytes) });
            }
        } else {
            flat.push({ name: file.name, content: await file.text() });
        }
    }

    const tests = new Map<string, TestFile>();
    const unrecognised: string[] = [];
    let checker: ExtraFile | undefined;
    let interactor: ExtraFile | undefined;
    let modelSolution: ExtraFile | undefined;

    for (const entry of flat) {
        const parsed = parseTestName(entry.name);
        if (parsed) {
            // The same as `readPackage`: a lone `1a.out` must arrive as a test
            // with no input, not one with an empty input.
            const existing = tests.get(parsed.name) ?? {
                name: parsed.name,
                group: parsed.group,
                letter: parsed.letter,
            };
            if (/\.in$/i.test(entry.name)) existing.input = entry.content;
            else existing.output = entry.content;
            tests.set(parsed.name, existing);
            continue;
        }
        if (isInteractor(entry.name)) {
            interactor = { name: entry.name, content: entry.content };
            continue;
        }
        if (isChecker(entry.name)) {
            checker = { name: entry.name, content: entry.content };
            continue;
        }
        if (isModel(entry.name)) {
            modelSolution = { name: entry.name, content: entry.content };
            continue;
        }
        unrecognised.push(entry.name);
    }

    return {
        tests: [...tests.values()].sort((a, b) =>
            a.name.localeCompare(b.name, undefined, { numeric: true })),
        checker,
        interactor,
        modelSolution,
        unrecognised,
    };
};

/** Groups present in a set of tests, in order. */
export const groupsOf = (tests: TestFile[]): number[] =>
    [...new Set(tests.map(t => t.group))].sort((a, b) => a - b);
