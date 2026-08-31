/**
 * **Every archive this product builds is byte-identical for identical
 * content.**
 *
 * A ZIP entry carries a modification time, and `fflate` defaults it to *the
 * current time* — its own documentation says so. So the same package built
 * twice was two different files with two different digests, and the product is
 * built on the opposite assumption: the Server stores a file under the SHA-256
 * of its bytes, the Client declares that digest before uploading, and the
 * Runner verifies it before evaluating. A digest that moves on its own makes
 * *is this the same package?* unanswerable and stores one thing twice.
 *
 * The date is the DOS epoch, the earliest a ZIP can represent. **Nothing reads
 * it**: `fflate`'s `Unzipped` is a path-to-bytes map with nowhere to put it, and
 * the Runner's reader takes only `name()` from an entry. When an archive was
 * made is `exportedAt` on the bundle, which is a field somebody can read.
 */
export const ARCHIVE_MTIME = new Date("1980-01-01T00:00:00Z");

/**
 * The one way this product makes a ZIP. `scripts/check-package.mjs` refuses a
 * call to `zipSync` anywhere else, so a fourth archive cannot quietly go back
 * to being stamped with the time it happened to be built.
 */
export const zipArchive = async (
    files: Record<string, Uint8Array>,
): Promise<Uint8Array<ArrayBuffer>> => {
    const { zipSync } = await import("fflate");
    return zipSync(files, { level: 6, mtime: ARCHIVE_MTIME });
};
