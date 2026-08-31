import { Bundle, BUNDLE_TYPE, FILES_PREFIX, MANIFEST_NAME } from "./types";
import { zipArchive } from "../package/archive";

/**
 * Reading and writing the exchange archive, in the browser.
 *
 * `fflate` is imported dynamically, as the package builder does: only a manager
 * exporting or importing pays for it.
 */

export interface BundleContents {
    bundle: Bundle;
    /** SHA-256 to bytes. Every `sha256` the manifest names is a key here. */
    files: Map<string, Uint8Array>;
}

/**
 * What a bundle may weigh, and what is worth saying before it does.
 *
 * **Everything passes through browser memory**, which is the honest cost of
 * assembling the archive where the problem types are understood. A refusal that
 * names the largest problems beats a tab that dies at ninety per cent, and a
 * warning gives a manager the chance to export by round instead.
 *
 * A Server-side streaming export would lift this and change nothing else: the
 * format is the contract, not the place the bytes are put together.
 */
export const REFUSE_BYTES = 256 * 1024 * 1024;
export const WARN_BYTES = 64 * 1024 * 1024;

export class BundleTooLarge extends Error {
    constructor(public readonly bytes: number, public readonly largest: string[]) {
        super(`The bundle is ${Math.round(bytes / 1024 / 1024)} MB, over the ${REFUSE_BYTES / 1024 / 1024} MB limit`);
        this.name = "BundleTooLarge";
    }
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** The total the archive would hold, before it is built. */
export const weigh = (contents: BundleContents): number =>
    [...contents.files.values()].reduce((total, bytes) => total + bytes.length, 0);

/**
 * The problems holding the most bytes, heaviest first.
 *
 * Named in the refusal because "too large" without "which of them" leaves a
 * manager to bisect their own contest by hand.
 */
export const heaviest = (contents: BundleContents, count = 3): string[] =>
    contents.bundle.problems
        .map(problem => ({
            slug: problem.slug,
            bytes: problem.files.reduce(
                (total, file) => total + (contents.files.get(file.sha256)?.length ?? 0), 0),
        }))
        .sort((a, b) => b.bytes - a.bytes)
        .slice(0, count)
        .map(p => `${p.slug} (${Math.round(p.bytes / 1024 / 1024)} MB)`);

export const writeBundle = async (contents: BundleContents): Promise<Blob> => {
    const bytes = weigh(contents);
    if (bytes > REFUSE_BYTES) throw new BundleTooLarge(bytes, heaviest(contents));

    const entries: Record<string, Uint8Array> = {
        [MANIFEST_NAME]: encoder.encode(JSON.stringify(contents.bundle, null, 2)),
    };
    for (const [sha256, file] of contents.files) entries[`${FILES_PREFIX}${sha256}`] = file;

    return new Blob([await zipArchive(entries)], { type: "application/zip" });
};

/**
 * Reads an archive back, and refuses one it cannot vouch for.
 *
 * **Every refusal here is a refusal to guess.** A manifest naming a file the
 * archive does not hold would import a problem whose statement is missing and
 * whose package cannot be judged — discovered by the first participant to open
 * it, which is the worst possible moment.
 */
export const readBundle = async (input: Blob | Uint8Array): Promise<BundleContents> => {
    const raw = input instanceof Uint8Array ? input : new Uint8Array(await input.arrayBuffer());
    if (raw.length > REFUSE_BYTES) throw new BundleTooLarge(raw.length, []);

    const { unzipSync } = await import("fflate");
    const entries = unzipSync(raw);

    const manifest = entries[MANIFEST_NAME];
    if (!manifest) throw new Error(`The archive holds no ${MANIFEST_NAME}`);

    let bundle: Bundle;
    try {
        bundle = JSON.parse(decoder.decode(manifest)) as Bundle;
    } catch {
        throw new Error(`${MANIFEST_NAME} is not readable JSON`);
    }

    // **The version envelope, checked rather than assumed.** A bundle from a
    // later format read as this one would be read wrongly and quietly.
    if (bundle?.type !== BUNDLE_TYPE) {
        throw new Error(`This is a ${bundle?.type ?? "nameless"} archive, and this reads ${BUNDLE_TYPE}`);
    }

    const files = new Map<string, Uint8Array>();
    for (const [path, content] of Object.entries(entries)) {
        if (path.startsWith(FILES_PREFIX)) files.set(path.slice(FILES_PREFIX.length), content);
    }

    const named = new Set<string>();
    for (const problem of bundle.problems ?? []) {
        for (const file of problem.files) named.add(file.sha256);
    }
    for (const document of bundle.activity?.documents ?? []) named.add(document.sha256);

    const missing = [...named].filter(sha256 => !files.has(sha256));
    if (missing.length > 0) {
        throw new Error(
            `The manifest names ${missing.length} file(s) the archive does not hold: ${missing.slice(0, 3).join(", ")}`);
    }

    return { bundle, files };
};

/**
 * Every problem slug an assignment names but no problem in the bundle carries.
 *
 * Separated from `readBundle` because it is a question about the manifest
 * rather than about the archive, and the import plan asks it again once it
 * knows what the library already holds.
 */
export const danglingAssignments = (bundle: Bundle): string[] => {
    const known = new Set(bundle.problems.map(p => p.slug));
    const wanted = (bundle.activity?.series ?? [])
        .flatMap(series => series.assignments.map(a => a.problemSlug));
    return [...new Set(wanted.filter(slug => !known.has(slug)))];
};
