/**
 * Stored bytes, and the one way in and out of them.
 *
 * Every file the product keeps — a problem's figures and package, the
 * documents an operator publishes, whatever a Runner uploads about itself —
 * arrives through `upload` and is read through `getText`, `getBlob` or `url`.
 * Owners keep **references**: a problem version names a file id, it does not
 * carry bytes.
 *
 * A submission is the one exception, and it is deliberate: the participant sends
 * the file and the submission in one request, because an upload that never
 * became a submission is a worse thing to explain in the minute before a
 * deadline than one endpoint behaving differently. See
 * `docs/specs/FILE_API.md`.
 */

export interface UploadedFile {
    id: string;
    name: string;
    mimeType: string;
    sizeBytes: number;
    /** SHA-256 of the bytes. Names the file: equal checksums are the same file. */
    sha256: string;
    createdAt: string;
}

/**
 * A stored statement, named and pointed at rather than carried.
 *
 * One shape for both sides of the fence: a participant reading a problem and a
 * manager editing one ask for the same bytes, and used to receive them through
 * two different fields of two different types. Publishing was already a
 * reference (`NewStatement`); this is what reading it back looks like.
 *
 * It lives here rather than in either API because it is a reference to a file,
 * which is this module's whole subject.
 */
export interface StatementRef {
    /**
     * The name within the version — `content.md`, `content-en.md`,
     * `content.pdf`. The renderer keys on it: a problem whose statement is a PDF
     * is drawn differently from one written in Markdown, and the name is how
     * that is known without opening the file.
     */
    name: string;
    /** BCP-47 subtag. Absent is the default statement, and the fallback. */
    language?: string;
    fileId: string;
    /** SHA-256 of the bytes, so what was published is what is read. */
    sha256: string;
    sizeBytes: number;
}

export interface FileApi {
    /**
     * Stores bytes and answers with what they became.
     *
     * The checksum is computed by the caller and **recomputed by the Server**,
     * which refuses to store a mismatch. A checksum that arrives with the bytes
     * is a claim, not evidence; what it buys is a cheap and specific failure —
     * a truncated upload rejected as corrupt rather than stored as a file whose
     * contents are wrong.
     *
     * Bytes are immutable. There is no replace: a corrected file is a new
     * upload with a new id, which is what lets a pinned problem version keep
     * its meaning.
     */
    upload(file: File | Blob, name: string, sha256: string, signal: AbortSignal): Promise<UploadedFile>;

    /** For a document: statement source, a log, a legal text. */
    getText(id: string, signal: AbortSignal): Promise<string>;

    /** For an archive or anything else that is not text. */
    getBlob(id: string, signal: AbortSignal): Promise<Blob>;

    /**
     * Where the bytes are, for an `<img>` or a download link — no request of its
     * own. Synchronous because it is an address, not a fetch.
     */
    url(id: string): string;
}
