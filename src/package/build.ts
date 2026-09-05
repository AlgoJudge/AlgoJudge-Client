import { emptyConfig, PackageConfig, TestFile } from "./types";
import { zipArchive } from "./archive";

/**
 * Assembles and reads the package archive, in the browser.
 *
 * Deliberately not on the Server: the layout is a property of the problem type,
 * and the Server is not allowed to know one type from another. A Server that
 * built this archive would have to be changed for every new type — the thing the
 * whole design exists to avoid.
 *
 * `yaml` and `fflate` are imported dynamically so that only a manager opening the
 * builder pays for them.
 */

export interface ExtraFile {
    /** Name inside its directory, without a path. */
    name: string;
    content: string;
}

export interface PackageContents {
    config: PackageConfig;
    tests: TestFile[];
    checker?: ExtraFile;
    interactor?: ExtraFile;
    modelSolution?: ExtraFile;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const buildPackage = async (contents: PackageContents): Promise<Blob> => {
    const { stringify } = await import("yaml");

    const files: Record<string, Uint8Array> = {};

    // YAML rather than JSON because this is the one file a problem author edits
    // by hand, and it is the only place in the product a comment survives.
    files["config.yml"] = encoder.encode(stringify(contents.config));

    for (const test of contents.tests) {
        // **Both guarded, and the input's guard is the newer half.** Written
        // unconditionally, an absent input becomes a zero-byte entry — which the
        // Runner reads as "the file is there and is empty", not as "there is
        // none". A package that validates here would then judge every test
        // against nothing.
        if (test.input !== undefined) {
            files[`tests/${test.name}.in`] = encoder.encode(test.input);
        }
        if (test.output !== undefined) {
            files[`tests/${test.name}.out`] = encoder.encode(test.output);
        }
    }
    if (contents.checker) {
        files[`checker/${contents.checker.name}`] = encoder.encode(contents.checker.content);
    }
    if (contents.interactor) {
        files[`interactor/${contents.interactor.name}`] = encoder.encode(contents.interactor.content);
    }
    if (contents.modelSolution) {
        files[`solutions/${contents.modelSolution.name}`] = encoder.encode(contents.modelSolution.content);
    }

    return new Blob([await zipArchive(files)], { type: "application/zip" });
};

/**
 * Reads a package back, so a built archive can be downloaded, corrected by hand
 * and uploaded again. The builder assembles the format; it does not own it.
 */
export const readPackage = async (file: Blob): Promise<PackageContents> => {
    const [{ parse }, { unzipSync }] = await Promise.all([
        import("yaml"),
        import("fflate"),
    ]);

    const entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
    const text = (path: string) => entries[path] ? decoder.decode(entries[path]) : undefined;

    const raw = text("config.yml");
    if (raw === undefined) {
        throw new Error("The archive has no config.yml");
    }
    // Merged over the defaults rather than trusted. `config.yml` is edited by
    // hand — that is the point of it being YAML — so a file without `groups` or
    // without `limits` is an ordinary thing to receive, and every reader after
    // this point would otherwise iterate undefined.
    const parsed = (parse(raw) ?? {}) as Partial<PackageConfig>;
    const config: PackageConfig = {
        ...emptyConfig(),
        ...parsed,
        limits: { ...emptyConfig().limits, ...(parsed.limits ?? {}) },
        groups: Array.isArray(parsed.groups) ? parsed.groups : [],
    };

    const tests = new Map<string, TestFile>();
    for (const path of Object.keys(entries)) {
        const match = /^tests\/(\d+)([a-z]+)\.(in|out)$/i.exec(path);
        if (!match) continue;
        const name = `${match[1]}${match[2].toLowerCase()}`;
        // **No `input: ""` here.** Seeded, an archive with no `.in` came back
        // as a test with an *empty* input, and nothing downstream could tell
        // the two apart — which is exactly what an interactive package needs to
        // say. `output` was never seeded; this makes the pair symmetric.
        const existing = tests.get(name) ?? {
            name,
            group: Number(match[1]),
            letter: match[2].toLowerCase(),
        };
        if (match[3].toLowerCase() === "in") existing.input = decoder.decode(entries[path]);
        else existing.output = decoder.decode(entries[path]);
        tests.set(name, existing);
    }

    const extra = (prefix: string): ExtraFile | undefined => {
        const path = Object.keys(entries).find(p => p.startsWith(prefix));
        if (!path) return undefined;
        return { name: path.slice(prefix.length), content: decoder.decode(entries[path]) };
    };

    return {
        config,
        tests: [...tests.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
        checker: extra("checker/"),
        interactor: extra("interactor/"),
        modelSolution: extra("solutions/"),
    };
};

/**
 * The sample tests, as the participant receives them.
 *
 * A separate archive rather than the package itself: the package is scoped to
 * the Runner and carries every hidden test, so handing it over would disclose
 * the whole problem.
 */
export const buildSampleArchive = async (tests: TestFile[]): Promise<Blob> => {
    const files: Record<string, Uint8Array> = {};
    for (const test of tests) {
        if (test.input !== undefined) files[`${test.name}.in`] = encoder.encode(test.input);
        if (test.output !== undefined) files[`${test.name}.out`] = encoder.encode(test.output);
    }
    return new Blob([await zipArchive(files)], { type: "application/zip" });
};
