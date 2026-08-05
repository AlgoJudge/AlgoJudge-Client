import { assertLatexSubset } from "./latex";
import { createMarkdown, Token } from "./markdown";
import { referenceName } from "./reference";
import { ContentDocument, ContentError, CONTENT_VERSION, frontMatterLines, splitFrontMatter } from "./types";

/**
 * Validates a `content.md` statement.
 *
 * It never repairs and never renders partially: a statement missing a constraint
 * is more dangerous than one that visibly failed, because a participant cannot
 * tell the first from a complete statement.
 */

const VERSION = /^\s*version\s*:\s*(\d+)\s*$/m;

/**
 * What a reference may be.
 *
 * A **picture** is always one of the document's own attachments: a name, no
 * path. A **link** may additionally point inside the application — a path
 * beginning with a single slash, or an anchor in the same document — and may
 * carry the one scheme an operator needs, `mailto:`, for the contact address
 * their own legal documents ask them to publish.
 *
 * Everything else is refused. A link out of the document tells another host who
 * opened the statement and when, and is a way to change what competitors see
 * while a contest is running. A path within the instance is neither of those.
 */
const ATTACHMENT = /^[^/\\:?#]+$/;
const MAILTO = /^mailto:[^\s<>@]+@[^\s<>@]+$/i;

const isAttachment = (target: string): boolean => ATTACHMENT.test(target);

/** `/activities/AMMPZ-2019/problems`, and not `//another.host`. */
const isAppPath = (target: string): boolean =>
    target.startsWith("/") && !target.startsWith("//") && !target.includes("\\");

const isPermittedLink = (target: string): boolean =>
    !target.includes("..")
    && (isAttachment(target) || target.startsWith("#") || isAppPath(target) || MAILTO.test(target));

const line = (token: Token, offset: number): number | undefined =>
    token.map ? token.map[0] + offset + 1 : undefined;

const validateMath = (tokens: Token[], offset: number): void => {
    for (const token of tokens) {
        if (token.type === "math_inline" || token.type === "math_block"
            || token.type === "math_inline_double" || token.type === "math_block_eqno") {
            try {
                assertLatexSubset(token.content);
            } catch (error) {
                throw new ContentError(
                    error instanceof Error ? error.message : String(error),
                    line(token, offset)
                );
            }
        }
        if (token.children) validateMath(token.children, offset);
    }
};

const validateReferences = (tokens: Token[], offset: number): void => {
    for (const token of tokens) {
        if (token.type === "image") {
            const src = referenceName(String(token.attrGet("src") ?? ""));
            if (!isAttachment(src) || src.includes("..")) {
                throw new ContentError(
                    `Obrazek "${src}" musi być nazwą załącznika tego zadania, bez ścieżki i bez adresu`,
                    line(token, offset)
                );
            }
        }
        if (token.type === "link_open") {
            const href = referenceName(String(token.attrGet("href") ?? ""));
            if (!isPermittedLink(href)) {
                throw new ContentError(
                    `Odnośnik "${href}" prowadzi poza aplikację. Dozwolone są: nazwa własnego `
                    + `załącznika, ścieżka w aplikacji zaczynająca się od "/", kotwica "#..." `
                    + `oraz adres "mailto:"`,
                    line(token, offset)
                );
            }
        }
        if (token.children) validateReferences(token.children, offset);
    }
};

/**
 * An image that never parsed.
 *
 * `![a](my file.png)` is not an image token — CommonMark stops the destination
 * at the space — so it slips past every check above and reaches the reader as
 * literal text. The pattern only survives in text when the parse failed, which
 * makes it a precise thing to refuse rather than a guess.
 */
const UNPARSED_IMAGE = /!\[[^\]]*\]\([^)]*\)/;

const validateBrokenImages = (tokens: Token[], offset: number): void => {
    for (const token of tokens) {
        if (token.type === "text" && UNPARSED_IMAGE.test(token.content)) {
            throw new ContentError(
                "Odwołanie do obrazka nie zostało rozpoznane — nazwa ze spacją musi "
                + "być w nawiasach ostrych, na przykład ![opis](<moja grafika.png>)",
                line(token, offset)
            );
        }
        if (token.children) validateBrokenImages(token.children, offset);
    }
};

const validateSamples = (tokens: Token[], offset: number): void => {
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        if (token.type !== "fence") continue;
        const language = (token.info ?? "").trim().toLowerCase();

        if (language === "in") {
            const next = tokens[i + 1];
            if (!next || next.type !== "fence" || (next.info ?? "").trim().toLowerCase() !== "out") {
                // Adjacency is the whole pairing rule: without it the renderer
                // would have to guess which output belongs to which input.
                throw new ContentError(
                    "Blok ```in musi być bezpośrednio poprzedzać blok ```out",
                    line(token, offset)
                );
            }
            i += 1;
            continue;
        }

        if (language === "out") {
            throw new ContentError(
                "Blok ```out bez poprzedzającego ```in",
                line(token, offset)
            );
        }
    }
};

/**
 * How strictly to read a document.
 *
 * `refuse` — the whole rule set, which is what an author needs while writing: a
 * reference they may not make is an error they can see and fix.
 *
 * `allow` — the format rules only. A reader is handed the document and the
 * renderer deals with its references itself: it resolves the ones it can and
 * **censors** the ones it may not follow. A statement written before a rule
 * existed, or stored by a Server that did not enforce it, must not become
 * unreadable in the middle of a contest over one link.
 */
export interface ContentRules {
    references?: "refuse" | "allow";
}

export const validateContent = (source: unknown, rules: ContentRules = {}): ContentDocument => {
    if (typeof source !== "string") {
        throw new ContentError("Treść zadania musi być tekstem Markdown");
    }

    const { frontMatter, body } = splitFrontMatter(source);
    const match = VERSION.exec(frontMatter);
    if (!match) {
        throw new ContentError('Brakuje nagłówka z wersją: "---\\nversion: 1\\n---"');
    }
    const version = Number(match[1]);
    if (version !== CONTENT_VERSION) {
        // Refused rather than guessed: a renderer that does not know a version
        // cannot know what it would be leaving out.
        throw new ContentError(`Nieobsługiwana wersja formatu treści: ${version}`);
    }

    const offset = frontMatterLines(source);
    const tokens = createMarkdown().parse(body, {});
    validateSamples(tokens, offset);
    validateMath(tokens, offset);
    if (rules.references !== "allow") {
        validateReferences(tokens, offset);
        validateBrokenImages(tokens, offset);
    }

    return { version, body };
};

/** Non-throwing form, for a view that renders the reason instead of failing. */
export const tryValidateContent = (
    source: unknown,
    rules: ContentRules = {},
): { document: ContentDocument } | { error: ContentError } => {
    try {
        return { document: validateContent(source, rules) };
    } catch (error) {
        return { error: error instanceof ContentError ? error : new ContentError(String(error)) };
    }
};
