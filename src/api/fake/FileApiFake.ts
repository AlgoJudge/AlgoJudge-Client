import { FileApi, UploadedFile } from "../FileApi";
import { sha256 } from "../../utils/sha256";
import { checksumMismatch, notFound } from "./refuse";

/**
 * One store of bytes, shared by everything in the fake that keeps a file.
 *
 * It exists as its own object rather than inside one of the fake APIs because
 * the real one is shared too: an instance document, a problem's figure and a
 * Runner's log are the same kind of row, told apart by what references them.
 * Seeding it from a fixture and uploading to it from a screen have to reach the
 * same map, or the fake would answer a file id it had never heard of.
 */
export class FakeFiles {
    private readonly files = new Map<string, { meta: UploadedFile; bytes: Blob }>();
    private readonly urls = new Map<string, string>();
    private next = 1;

    /**
     * Seeds a fixture.
     *
     * **The checksum is a placeholder until `settleChecksums` replaces it**, and
     * that is not tidiness. `upload` computes the real SHA-256 and refuses a
     * mismatch, exactly as the Server does — so a seeded file carrying an
     * invented digest is a fake that disagrees with itself: anything reading a
     * seeded digest and handing it back to `upload` is refused. The export and
     * import of §8 are the first things to do that, and they could not run at
     * all until this was true.
     */
    seedText(name: string, mimeType: string, text: string): UploadedFile {
        const bytes = new Blob([text], { type: mimeType });
        const stored = this.store(`file-${this.next++}`, name, mimeType, bytes, fixtureChecksum(name + text));
        this.unsettled.add(stored.id);
        return stored;
    }

    private readonly unsettled = new Set<string>();
    private readonly mirrors: { row: { sha256: string }; id: string }[] = [];

    /**
     * Remembers a fixture row that copied a seeded digest, so settling reaches
     * it too.
     *
     * A row is a plain object the fixture keeps, and the digest in it is a copy
     * made before the real one existed. Every fixture that states a `sha256`
     * goes through here — a version's file list, an activity's documents, the
     * instance's.
     */
    mirror<T extends { sha256: string }>(row: T, id: string): T {
        this.mirrors.push({ row, id });
        return row;
    }

    /**
     * Replaces every placeholder with the digest of the bytes behind it.
     *
     * Asynchronous because `crypto.subtle` is, and called from the API surface
     * rather than the constructor for the same reason. Idempotent, and cheap
     * after the first pass: the set empties.
     */
    async settleChecksums(): Promise<void> {
        if (this.unsettled.size === 0) return;
        for (const id of [...this.unsettled]) {
            const entry = this.files.get(id);
            if (entry) entry.meta = { ...entry.meta, sha256: await sha256(entry.bytes) };
            this.unsettled.delete(id);
        }
        for (const { row, id } of this.mirrors) row.sha256 = this.checksumOf(id);
    }

    /** The digest a seeded file ended up with, once settled. */
    checksumOf(id: string): string {
        return this.files.get(id)?.meta.sha256 ?? "";
    }

    seedBlob(name: string, mimeType: string, bytes: Blob, checksum: string): UploadedFile {
        return this.store(`file-${this.next++}`, name, mimeType, bytes, checksum);
    }

    put(id: string, name: string, mimeType: string, bytes: Blob, checksum: string): UploadedFile {
        return this.store(id, name, mimeType, bytes, checksum);
    }

    meta(id: string): UploadedFile {
        const entry = this.files.get(id);
        if (!entry) notFound(`File ${id}`);
        return { ...entry.meta };
    }

    blob(id: string): Blob {
        const entry = this.files.get(id);
        if (!entry) notFound(`File ${id}`);
        return entry.bytes;
    }

    /** Cached: a fresh object URL per call would leak one per render. */
    url(id: string): string {
        const known = this.urls.get(id);
        if (known) return known;
        const created = URL.createObjectURL(this.blob(id));
        this.urls.set(id, created);
        return created;
    }

    has(id: string): boolean {
        return this.files.has(id);
    }

    private store(id: string, name: string, mimeType: string, bytes: Blob, checksum: string): UploadedFile {
        const meta: UploadedFile = {
            id, name, mimeType,
            sizeBytes: bytes.size,
            sha256: checksum,
            createdAt: new Date().toISOString(),
        };
        this.files.set(id, { meta, bytes });
        return { ...meta };
    }
}

/**
 * A checksum for seeded bytes.
 *
 * Deterministic and clearly not a real SHA-256 computation, because a fixture's
 * checksum only has to be stable and distinct: the fake verifies what a caller
 * uploads, and computes nothing for what it shipped with.
 */
const fixtureChecksum = (seed: string): string => {
    let a = 0x811c9dc5;
    for (const character of seed) {
        a = Math.imul(a ^ character.charCodeAt(0), 0x01000193) >>> 0;
    }
    return Array.from({ length: 8 }, (_, i) =>
        ((a >>> (i % 4) * 8) ^ (i * 0x9e)).toString(16).padStart(8, "0")).join("").slice(0, 64);
};

export class FileApiFake implements FileApi {
    constructor(private readonly files: FakeFiles, private readonly sleepMs = 200) { }

    async upload(file: File | Blob, name: string, checksum: string, signal: AbortSignal): Promise<UploadedFile> {
        await this.settle(signal);
        // What the Server does, for the same reason: a checksum that arrives
        // with the bytes is a claim. Refusing here is what turns a truncated
        // upload into a failure instead of a stored file whose contents are
        // wrong.
        if (await sha256(file) !== checksum) {
            checksumMismatch(`The file did not match its checksum and was not stored: ${name}`);
        }
        return this.files.put(
            `file-${crypto.randomUUID()}`,
            name,
            file.type || "application/octet-stream",
            file,
            checksum,
        );
    }

    async getText(id: string, signal: AbortSignal): Promise<string> {
        await this.settle(signal);
        return await this.files.blob(id).text();
    }

    async getBlob(id: string, signal: AbortSignal): Promise<Blob> {
        await this.settle(signal);
        return this.files.blob(id);
    }

    url(id: string): string {
        return this.files.url(id);
    }

    private settle(signal: AbortSignal): Promise<void> {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(resolve, this.sleepMs);
            signal.addEventListener("abort", () => {
                clearTimeout(timer);
                reject(signal.reason as Error);
            });
        });
    }
}
