/**
 * The `content.json` statement format.
 *
 * Specified in `docs/specs/CONTENT_FORMAT.md`. A statement is a JSON document
 * stored as an attachment under a well-known name; the Server stores the bytes
 * and has no statement concept. Everything below is Client-side.
 */

export const CONTENT_VERSION = 1;

export interface HeadingBlock {
    type: "heading";
    /** 1–4. */
    level: number;
    /** Plain text. Headings carry no inline maths, so they stay usable as an outline. */
    text: string;
}

export interface ParagraphBlock {
    type: "paragraph";
    /** Inline maths between `$…$`; `\$` is a literal dollar. No other markup. */
    text: string;
}

export interface LatexBlock {
    type: "latex";
    text: string;
}

export interface CodeBlock {
    type: "codeblock";
    /** Highlighting hint only. An unknown value renders unhighlighted. */
    language?: string;
    text: string;
}

export interface EmbedBlock {
    type: "embed";
    /** Names a participant-scoped attachment. Never a URL. */
    attachment: string;
    caption?: string;
}

export interface SampleBlock {
    type: "sample";
    input: string;
    output: string;
    /** Supports inline maths. */
    explanation?: string;
}

export type ContentBlock =
    | HeadingBlock
    | ParagraphBlock
    | LatexBlock
    | CodeBlock
    | EmbedBlock
    | SampleBlock;

export interface ContentDocument {
    version: number;
    blocks: ContentBlock[];
}

/** Why a document was refused. Documents are never partially rendered. */
export class ContentError extends Error {
    constructor(message: string, readonly blockIndex?: number) {
        super(message);
        this.name = "ContentError";
    }
}
