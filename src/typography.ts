import { createTheme } from "@mantine/core";

/**
 * The typeface the product asks for, and the only visual token this Client sets
 * for itself.
 *
 * ## Three layers, and the order is the feature
 *
 * `buildTheme` merges `theme` (test ids, no visual token), then this, then the
 * installation's own branding. **An installation that names a family still
 * wins**, because its override is merged last — this is a default, not a
 * decision taken away from an operator.
 *
 * It lives in a file of its own rather than in `theme.ts`, whose whole promise
 * is that it sets no visual token and whose comment says so.
 *
 * ## Why 400 and 700 and nothing between
 *
 * Lato ships 100, 300, 400, 700 and 900 — **no 500**. Asking for 500 resolves
 * down to 400 by the CSS matching rules, which is fine, but it is fine
 * *deterministically* only because 400 is a file this repository sends. Body
 * text is 400 and headings are 700, and both are shipped in
 * `assets/fonts/`, declared in `index.css`.
 *
 * The fallback stack behind it is Mantine's own, so a reader who is served the
 * page before the face arrives — or who blocks webfonts — gets what they would
 * have gotten with none of this.
 */

/**
 * What a named face falls back to: Mantine's default stack, restated so a theme
 * naming a family whose file has not loaded yet does not land on Times.
 */
export const FALLBACK_STACK =
    "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif";

/** The product's own stack: the shipped face, then the fallbacks. */
export const PRODUCT_STACK = `Lato, ${FALLBACK_STACK}`;

/**
 * What a fixed-pitch face falls back to: Mantine's own default for
 * `fontFamilyMonospace`, restated for the same reason `FALLBACK_STACK` is —
 * naming a family and then replacing the token wholesale would drop the
 * fallbacks Mantine had behind it.
 */
export const MONO_FALLBACK_STACK =
    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace";

/**
 * The fixed-pitch stack. Quoted, because the family name has a space in it.
 *
 * **One token reaches every fixed-pitch surface**, through
 * `--mantine-font-family-monospace`: `<Code>`, `<JsonInput>`, the gutter beside
 * a highlighted source — and `components/editor/CodeEditor.tsx`, which passes
 * this same constant to Monaco rather than writing a stack of its own, so the
 * editor and the preview of the same file cannot disagree about the type.
 */
export const MONOSPACE_STACK = `"JetBrains Mono", ${MONO_FALLBACK_STACK}`;

export const typography = createTheme({
    fontFamily: PRODUCT_STACK,
    headings: { fontFamily: PRODUCT_STACK },
    fontFamilyMonospace: MONOSPACE_STACK,
});
