import { createShikiAdapter } from "@mantine/code-highlight";

/**
 * `@mantine/code-highlight` dropped highlight.js for Shiki in 8.x and ships
 * **no** highlighter of its own: without an adapter it falls back to
 * `plainTextAdapter` and renders source as plain text, silently. That is what
 * the token-count assertion in `verify-first` exists to catch.
 */

// The languages `PackageBuilder.languageOf` can produce, and no others.
// Naming them one by one is the point: Shiki's bundled entry reaches every
// grammar it has, and a bundler splits all ~300 into the build — 16 MB of
// `dist` for the seven below.
const grammars: Record<string, () => Promise<unknown>> = {
    c: () => import("@shikijs/langs/c"),
    cpp: () => import("@shikijs/langs/cpp"),
    go: () => import("@shikijs/langs/go"),
    java: () => import("@shikijs/langs/java"),
    pascal: () => import("@shikijs/langs/pascal"),
    python: () => import("@shikijs/langs/python"),
    rust: () => import("@shikijs/langs/rust"),
};

async function loadShiki() {
    const { createHighlighterCore } = await import("shiki/core");
    const { createOnigurumaEngine } = await import("shiki/engine/oniguruma");
    // Nothing up front: `resolveLanguage` fetches a grammar the first time a
    // language is shown, and the adapter carries its own light and dark themes.
    return createHighlighterCore({
        langs: [],
        themes: [],
        engine: createOnigurumaEngine(import("shiki/wasm")),
    });
}

// A toolchain id becomes a language by file extension, so anything may arrive.
// One this map does not name is refused, the adapter warns once and renders
// plain — the same fallback an unknown id gets elsewhere in the product.
export const shikiAdapter = createShikiAdapter(loadShiki, {
    resolveLanguage: (language) => grammars[language],
});
