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

/** An unmapped language shows as plain text rather than failing to load. */
export const monacoLanguage = (language: string | undefined): string =>
    (language && MONACO_LANGUAGE[language]) ?? "plaintext";
