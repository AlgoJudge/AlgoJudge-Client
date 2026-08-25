import { BundleContents, readBundle } from "./bundle";
import { MANIFEST_NAME } from "./types";
import { Conversion, convertArchive, Loss } from "./zawodyweb/convert";

/**
 * Whichever archive a manager dropped, as one bundle.
 *
 * **One road in, whatever it came from.** An AlgoJudge bundle is read; a
 * ZawodyWeb export is converted into one first. Everything after this point —
 * the plan against the library, the archived-slug question, the compulsory
 * dates, every write — is §8's and has no idea which it was.
 *
 * That is the whole reason §9 is a converter rather than an importer of its
 * own. A second import path would be a second place for "already here" to mean
 * something slightly different.
 */

export type ArchiveSource = "algojudge" | "zawodyweb";

export interface ReadArchive {
    contents: BundleContents;
    source: ArchiveSource;
    /** Empty for an AlgoJudge bundle, which loses nothing by definition. */
    lost: Loss[];
}

/** The descriptors ZawodyWeb writes at the root of an export. */
const ZAWODYWEB = ["contest.xml", "serie.xml", "problem.xml"];

export const readArchive = async (input: Blob): Promise<ReadArchive> => {
    const bytes = new Uint8Array(await input.arrayBuffer());

    const { unzipSync } = await import("fflate");
    let entries: Record<string, Uint8Array>;
    try {
        entries = unzipSync(bytes);
    } catch {
        throw new Error("That file is not a zip archive");
    }

    if (entries[MANIFEST_NAME]) {
        return { contents: await readBundle(bytes), source: "algojudge", lost: [] };
    }

    // **Named at the root, exactly.** ZawodyWeb's own reader looks entries up by
    // their full name with no normalisation, so an export has no directories in
    // it — an archive that has been repacked with one is not one of these, and
    // saying so beats converting half of it.
    if (ZAWODYWEB.some(name => entries[name])) {
        const converted: Conversion = await convertArchive(entries);
        return { contents: converted.contents, source: "zawodyweb", lost: converted.lost };
    }

    const nested = Object.keys(entries).find(path => ZAWODYWEB.some(name => path.endsWith(`/${name}`)));
    if (nested) {
        throw new Error(
            `This looks like a ZawodyWeb export inside a directory (${nested}). `
            + "Its entries have to sit at the root of the archive.");
    }

    throw new Error(`The archive holds neither ${MANIFEST_NAME} nor a ZawodyWeb descriptor`);
};
