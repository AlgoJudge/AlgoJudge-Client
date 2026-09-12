import * as monaco from "monaco-editor/editor/editor.api.js";
import "./registrations";

export interface EditorLanguage {
    /** Monaco's own id, which is what the editor is given. */
    id: string;
    /** Its first alias, or the id where it has none. */
    label: string;
    /** Its first extension, including the dot. */
    extension: string;
}

/**
 * The languages the editor in this build actually knows.
 *
 * **Asked of Monaco rather than written down.** The product's own catalogue
 * (`languages.ts`) lists *toolchains* — `c99-gcc` and `c99-clang` are two
 * entries and one grammar — because a submission is judged by a compiler. A
 * printout is judged by nobody: what matters is the syntax the editor colours
 * and the extension the page is named with, and there are nine of those where
 * there are dozens of the other.
 *
 * `getLanguages()` answers for what has been registered, which is why the
 * registrations are a module of their own and imported here.
 *
 * `plaintext` is filtered out: it is Monaco's fallback rather than a choice, and
 * it is what a printout with no language selected gets anyway.
 */
export const editorLanguages = (): EditorLanguage[] =>
    monaco.languages.getLanguages()
        .filter(language => language.id !== "plaintext")
        .map(language => ({
            id: language.id,
            label: language.aliases?.[0] ?? language.id,
            extension: language.extensions?.[0] ?? "",
        }))
        .filter(language => language.extension !== "")
        .sort((a, b) => a.label.localeCompare(b.label));
