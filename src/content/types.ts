/**
 * The `content.md` statement format.
 *
 * Specified in `docs/specs/CONTENT_FORMAT.md`. A statement is Markdown stored as
 * an attachment under a well-known name; the Server stores the bytes and has no
 * statement concept. Everything below is Client-side.
 */

export const CONTENT_VERSION = 1;

export interface ContentDocument {
    version: number;
    /** The Markdown body, with the front matter already removed. */
    body: string;
}

/** Why a document was refused. Documents are never partially rendered. */
export class ContentError extends Error {
    constructor(message: string, readonly line?: number) {
        super(message);
        this.name = "ContentError";
    }
}

const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/**
 * Splits the YAML front matter from the body.
 *
 * Markdown has no header of its own, and the format needs a version: a renderer
 * that does not know one refuses the document rather than guessing what it would
 * be leaving out.
 */
export const splitFrontMatter = (source: string): { frontMatter: string; body: string } => {
    const match = FRONT_MATTER.exec(source);
    if (!match) return { frontMatter: "", body: source };
    return { frontMatter: match[1], body: source.slice(match[0].length) };
};

/** How many lines the front matter occupied, so an error can name a real line. */
export const frontMatterLines = (source: string): number => {
    const match = FRONT_MATTER.exec(source);
    return match ? match[0].split("\n").length - 1 : 0;
};

export const emptyDocument = (): string => `---
version: ${CONTENT_VERSION}
---

`;
