/**
 * How a statement points at one of its attachments.
 *
 * CommonMark ends a link destination at the first space, so `![a](my file.png)`
 * is not an image at all — it is the literal text, which is exactly what a
 * screenshot named "Zrzut ekranu 2026-08-03 231251.png" produced. The angle
 * bracket form is the escape hatch the syntax provides, and this is the only
 * function allowed to build one so that every place agrees.
 */

const NEEDS_BRACKETS = /[\s()<>]/;

/** The destination part: `name.png` or `<name with spaces.png>`. */
export const referenceTarget = (name: string): string =>
    NEEDS_BRACKETS.test(name) ? `<${name}>` : name;

/**
 * The name a parsed reference points at.
 *
 * markdown-it normalises a link destination the way a URL is normalised, so
 * `<moja grafika.png>` arrives as `moja%20grafika.png`. Matching that against a
 * file called "moja grafika.png" fails, and the reader is told the attachment is
 * missing when it is sitting right there. A malformed escape decodes to itself
 * rather than throwing: a bad name is still a name to report.
 */
export const referenceName = (target: string): string => {
    try {
        return decodeURIComponent(target);
    } catch {
        return target;
    }
};

/** A whole image reference, ready to paste into a statement. */
export const imageReference = (name: string): string =>
    `![${name}](${referenceTarget(name)})`;

/** A whole link, for a PDF or any other file that is not an image. */
export const linkReference = (name: string): string =>
    `[${name}](${referenceTarget(name)})`;
