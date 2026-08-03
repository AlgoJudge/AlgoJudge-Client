import { assertLatexSubset, splitInline } from "./latex";
import { ContentBlock, ContentDocument, ContentError, CONTENT_VERSION } from "./types";

/**
 * Validates a `content.json` document.
 *
 * It never repairs, never drops a block and never renders partially: a statement
 * missing a constraint is more dangerous than one that visibly failed, because a
 * participant cannot tell the first from a complete statement.
 */

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

const requireString = (block: Record<string, unknown>, field: string, index: number): string => {
    const value = block[field];
    if (typeof value !== "string") {
        throw new ContentError(`Pole "${field}" musi być tekstem`, index);
    }
    return value;
};

const optionalString = (block: Record<string, unknown>, field: string, index: number): string | undefined => {
    const value = block[field];
    if (value === undefined) return undefined;
    if (typeof value !== "string") {
        throw new ContentError(`Pole "${field}" musi być tekstem`, index);
    }
    return value;
};

const validateBlock = (raw: unknown, index: number): ContentBlock => {
    if (!isRecord(raw)) {
        throw new ContentError("Blok musi być obiektem", index);
    }
    const type = raw.type;
    if (typeof type !== "string") {
        throw new ContentError('Blok nie ma pola "type"', index);
    }

    switch (type) {
        case "heading": {
            const level = raw.level;
            if (typeof level !== "number" || !Number.isInteger(level) || level < 1 || level > 4) {
                throw new ContentError('Pole "level" musi być liczbą całkowitą od 1 do 4', index);
            }
            return { type, level, text: requireString(raw, "text", index) };
        }
        case "paragraph": {
            const text = requireString(raw, "text", index);
            // Parsed now so a malformed formula is refused with the document
            // rather than at the moment a participant scrolls to it.
            splitInline(text, index);
            return { type, text };
        }
        case "latex": {
            const text = requireString(raw, "text", index);
            assertLatexSubset(text, index);
            return { type, text };
        }
        case "codeblock":
            return {
                type,
                language: optionalString(raw, "language", index),
                text: requireString(raw, "text", index),
            };
        case "embed": {
            const attachment = requireString(raw, "attachment", index);
            if (/^[a-z]+:\/\//i.test(attachment) || attachment.includes("..") || attachment.startsWith("/")) {
                // A document may only name its own attachments. Anything that
                // looks like a path or a URL would let a statement reach outside.
                throw new ContentError('Pole "attachment" musi być nazwą załącznika, nie ścieżką ani adresem', index);
            }
            return { type, attachment, caption: optionalString(raw, "caption", index) };
        }
        case "sample": {
            const explanation = optionalString(raw, "explanation", index);
            if (explanation !== undefined) splitInline(explanation, index);
            return {
                type,
                input: requireString(raw, "input", index),
                output: requireString(raw, "output", index),
                explanation,
            };
        }
        default:
            throw new ContentError(`Nieznany typ bloku "${type}"`, index);
    }
};

export const validateContent = (raw: unknown): ContentDocument => {
    if (!isRecord(raw)) {
        throw new ContentError("Dokument treści musi być obiektem");
    }
    if (typeof raw.version !== "number") {
        throw new ContentError('Dokument nie ma pola "version"');
    }
    if (raw.version !== CONTENT_VERSION) {
        // Refused rather than guessed: a renderer that does not know a version
        // cannot know what it would be leaving out.
        throw new ContentError(`Nieobsługiwana wersja formatu treści: ${raw.version}`);
    }
    if (!Array.isArray(raw.blocks)) {
        throw new ContentError('Pole "blocks" musi być tablicą');
    }
    return {
        version: raw.version,
        blocks: raw.blocks.map(validateBlock),
    };
};

/** Non-throwing form, for a view that renders the reason instead of failing. */
export const tryValidateContent = (raw: unknown): { document: ContentDocument } | { error: ContentError } => {
    try {
        return { document: validateContent(raw) };
    } catch (error) {
        return { error: error instanceof ContentError ? error : new ContentError(String(error)) };
    }
};
