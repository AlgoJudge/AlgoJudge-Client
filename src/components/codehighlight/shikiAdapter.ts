import { createShikiAdapter } from "@mantine/code-highlight";

/**
 * `@mantine/code-highlight` dropped highlight.js for Shiki in 8.x and ships
 * **no** highlighter of its own: without an adapter it falls back to
 * `plainTextAdapter` and renders source as plain text, silently. That is what
 * the token-count assertion in `verify-first` exists to catch.
 */
async function loadShiki() {
    const { createHighlighter } = await import("shiki");
    // Nothing up front: `resolveLanguage` fetches a grammar the first time a
    // language is actually shown, so the preview screen is the only thing that
    // ever pays for one. The adapter carries its own light and dark themes.
    return createHighlighter({ langs: [], themes: [] });
}

// A problem's toolchain id becomes a language by file extension, so anything
// may arrive here. Shiki refuses what it does not know, the adapter warns once
// and renders plain — which is the same fallback an unknown id gets elsewhere.
export const shikiAdapter = createShikiAdapter(loadShiki, {
    resolveLanguage: (language) => language,
});
