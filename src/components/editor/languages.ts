/** Language ids as the product names them, mapped to Monaco's. */
const MONACO_LANGUAGE: Record<string, string> = {
    cpp: "cpp",
    c: "c",
    python: "python",
    java: "java",
    csharp: "csharp",
    javascript: "javascript",
    typescript: "typescript",
    rust: "rust",
    go: "go",
    pascal: "pascal",
};

/**
 * Every language a solution may be written in, as the product names them.
 *
 * The catalogue an activity chooses from, and it is this list rather than a
 * second one because **this is the real constraint**: a language the editor
 * cannot colour is one somebody would be writing in a plain textarea. Adding one
 * means teaching Monaco about it first — see `CodeEditor`, which registers the
 * definitions it needs and nothing else.
 *
 * Ten ids against nine registrations is not a gap: Monaco's `cpp` definition
 * registers `c` alongside `cpp`, sharing one tokenizer.
 */
export const LANGUAGES: string[] = Object.keys(MONACO_LANGUAGE);

/** An unmapped language shows as plain text rather than failing to load. */
export const monacoLanguage = (language: string | undefined): string =>
    (language && MONACO_LANGUAGE[language]) ?? "plaintext";
