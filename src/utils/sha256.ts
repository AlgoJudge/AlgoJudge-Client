/**
 * The checksum every uploaded file carries.
 *
 * Computed here, where the bytes are first assembled, and recomputed by the
 * Server on receipt and by the Runner after download — see
 * `docs/specs/FILE_INTEGRITY.md`. This copy is not evidence, since anyone can
 * send any checksum; what it buys is a truncated upload failing as a corrupt
 * file rather than being stored as a valid one whose contents are wrong.
 *
 * `crypto.subtle` needs a secure context. Over plain HTTP on anything but
 * `localhost` it is absent, and the caller is told rather than shipped a
 * hand-written hash that would disagree with everyone else's.
 */

const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));

export const sha256 = async (data: Blob | ArrayBuffer | Uint8Array): Promise<string> => {
    if (!globalThis.crypto?.subtle) {
        throw new Error("Checksums need a secure context (HTTPS or localhost)");
    }
    const bytes = data instanceof Blob
        ? await data.arrayBuffer()
        : data instanceof Uint8Array
            ? (data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer)
            : data;
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    let hex = "";
    for (const byte of new Uint8Array(digest)) hex += HEX[byte];
    return hex;
};

/**
 * The Runner's cache path for a file: the first three byte-pairs of the checksum
 * as directories, the file id as the leaf.
 *
 * It lives in the Client only so the manager screens can show where a Runner
 * would keep something. Three levels of 256 keep any one directory listable.
 */
export const cachePath = (checksum: string, fileId: string): string =>
    `${checksum.slice(0, 2)}/${checksum.slice(2, 4)}/${checksum.slice(4, 6)}/${fileId}`;
