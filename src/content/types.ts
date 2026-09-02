/**
 * The `content.md` statement format.
 *
 * Specified in `docs/specs/CONTENT_FORMAT.md`. A statement is Markdown stored as
 * an attachment under a well-known name; the Server stores the bytes and has no
 * statement concept. Everything below is Client-side.
 */

export const CONTENT_VERSION = 1;

/**
 * What a statement says it is, as **one string** — `content@1`.
 *
 * The type envelope was decided as one string on 2026-08-02 and this format
 * wrote a bare `version` until 2026-08-22 — the fourth of four spellings of one
 * convention, beside `Activity.type`, `format`+`version` in `config.yml` and
 * `kind`+`version` in a result document.
 *
 * A statement written before that date still reads: the bare `version` is
 * accepted and never written. See `validate.ts`.
 */
export const CONTENT_TYPE = `content@${CONTENT_VERSION}`;

export interface ContentDocument {
    /** `content@1`. See {@link CONTENT_TYPE}. */
    type: string;
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

/**
 * The statement's file name carries its language: `content.md` is the default and
 * `content-en.md` a translation. The Server stores both as ordinary attachments
 * and never learns that one translates the other — the convention is read here,
 * like `content.*` itself.
 */
const STATEMENT = /^content(?:-([A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*))?\.md$/i;

/** The language of a statement file name, or undefined for the default. */
export const statementLanguage = (name: string): string | undefined =>
    STATEMENT.exec(name)?.[1]?.toLowerCase();

export const isStatementName = (name: string): boolean => STATEMENT.test(name);

/**
 * Whether a stored file **is the statement**, whatever it is written in.
 *
 * **A different question from {@link isStatementName}**, and the two were one
 * function until 2026-08-26. That one asks "is this Markdown this editor can
 * open"; this asks "is this the document, rather than material beside it". They
 * gave the same answer for as long as every statement was Markdown — and the
 * Server named a UVa import's PDF `content.md`, so every statement was.
 *
 * Now that a statement can be `content.pdf`, asking the Markdown question about
 * it files the problem's own statement under its attachments.
 */
const STATEMENT_FILE = /^content(?:-([A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*))?\.[^.]+$/i;

export const isStatementFile = (name: string): boolean => STATEMENT_FILE.test(name);

/**
 * The language of a statement file, **whatever it is written in**.
 *
 * {@link statementLanguage} answers the same question about Markdown alone,
 * because the editor it serves opens nothing else. This one serves whoever has
 * to sort a version's files without caring: `content-pl.pdf` is the Polish
 * statement, and reading it with the Markdown regex says it is not a statement
 * at all.
 */
export const statementFileLanguage = (name: string): string | undefined =>
    STATEMENT_FILE.exec(name)?.[1]?.toLowerCase();

/** The file name a statement in this language is stored under. */
export const statementFileName = (language?: string): string =>
    language ? `content-${language}.md` : "content.md";

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
type: "${CONTENT_TYPE}"
---

`;
