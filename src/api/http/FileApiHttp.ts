import { FileApi, UploadedFile } from "../FileApi";
import { HttpClient } from "./HttpClient";

/**
 * Files over REST.
 *
 * `POST /files` takes one file and the checksum the caller computed;
 * `GET /files/{id}` answers with the bytes. The base URL is held here as well
 * as in the transport because {@link url} is an address rather than a request —
 * an `<img>` needs somewhere to point, not a promise.
 *
 * **These endpoints do not exist on the Server yet.**
 */
export class FileApiHttp implements FileApi {
    constructor(
        private readonly http: HttpClient,
        private readonly baseUrl: string,
    ) { }

    upload(file: File | Blob, name: string, sha256: string, signal: AbortSignal): Promise<UploadedFile> {
        const form = new FormData();
        form.append("file", file, name);
        form.append("sha256", sha256);
        return this.http.request<UploadedFile>("/files", "POST", { signal, body: form });
    }

    async getText(id: string, signal: AbortSignal): Promise<string> {
        return await (await this.getBlob(id, signal)).text();
    }

    getBlob(id: string, signal: AbortSignal): Promise<Blob> {
        return this.http.download(`/files/${encodeURIComponent(id)}`, signal);
    }

    url(id: string): string {
        return `${this.baseUrl}/files/${encodeURIComponent(id)}`;
    }
}
