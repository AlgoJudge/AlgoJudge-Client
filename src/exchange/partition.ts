import { NewProblemFile, NewStatement } from "../api/ManagerApi";
import { PACKAGE_ARCHIVE, SAMPLES_ARCHIVE } from "../package/types";
import { BundledProblem, isStatement, statementLanguage } from "./types";

/**
 * Sorting a bundled problem's files into the four things a version is published
 * from, and saying what each one is made of.
 *
 * **Pure, and separate from `apply.ts` for that reason.** `check:exchange`
 * deliberately does not compile the importer — it talks to the API — so with
 * this inside it, the only thing a check could reach was the *predicate*, and a
 * file routed to the wrong side stayed invisible. That is not hypothetical: it
 * is the shape of the defect this module was extracted to close.
 */

/**
 * The media type of a file the bundle carries, from its own name.
 *
 * **The Server names a statement from the media type of the bytes it stored**
 * (`PackageNames.StatementExtension`), and the bytes reach it as one part of a
 * multipart form whose type comes from the `Blob`. A `Blob` built with no type
 * is `application/octet-stream`, which the Server reads as "not a PDF" — so a
 * `content.pdf` was stored under the name `content.md`, and the problem page,
 * which decides how to draw a statement from that name, handed PDF bytes to a
 * Markdown parser.
 *
 * From the name rather than from the bytes because in a bundle the name **is**
 * the version's own file name, so the two cannot disagree without the archive
 * being wrong about itself — and the checksum already answers that question.
 *
 * Anything not listed stays `application/octet-stream`, which is what every
 * upload was before this existed. `svg` is deliberately absent: it is a
 * document that can carry script, and nothing here needs one.
 */
const MEDIA_TYPES: Record<string, string> = {
    md: "text/markdown",
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    txt: "text/plain",
    csv: "text/csv",
    json: "application/json",
    zip: "application/zip",
};

export const mediaTypeOf = (name: string): string => {
    const dot = name.lastIndexOf(".");
    const extension = dot < 0 ? "" : name.slice(dot + 1).toLowerCase();
    return MEDIA_TYPES[extension] ?? "application/octet-stream";
};

export interface Published {
    statements: NewStatement[];
    files: NewProblemFile[];
    packageFileId?: string;
    samplesFileId?: string;
}

/**
 * A version's files, split the four ways `createProblemVersion` takes them.
 *
 * **A statement is never an ordinary file.** The Server refuses a `content.*`
 * among a version's `files` outright — `version.file.isStatement` — so a name
 * this side misfiles is an import that dies part way through, after problems
 * have already been created.
 */
export const partition = (problem: BundledProblem, ids: Map<string, string>): Published => {
    const statements: NewStatement[] = [];
    const files: NewProblemFile[] = [];
    let packageFileId: string | undefined;
    let samplesFileId: string | undefined;

    for (const file of problem.files) {
        const fileId = ids.get(file.sha256);
        if (!fileId) throw new Error(`${problem.slug}: ${file.name} was not stored`);

        if (file.name === PACKAGE_ARCHIVE) packageFileId = fileId;
        else if (file.name === SAMPLES_ARCHIVE) samplesFileId = fileId;
        else if (isStatement(file.name)) {
            const language = statementLanguage(file.name);
            statements.push({ fileId, language: language === false ? undefined : language });
        } else files.push({ fileId, name: file.name, scope: file.scope });
    }

    return { statements, files, packageFileId, samplesFileId };
};
