import Editor, { loader } from "@monaco-editor/react";
import { Center, Loader, useComputedColorScheme } from "@mantine/core";
import * as monaco from "monaco-editor/editor/editor.api.js";
import editorWorker from "monaco-editor/editor/editor.worker.js?worker";
import { useEffect } from "react";
import { MONOSPACE_STACK } from "../../typography";
import { monacoLanguage } from "./languages";
import classes from "./CodeEditor.module.css";

// Which languages are registered, and why only these — see the module.
import "./registrations";

/**
 * Monaco, wired to the copy installed with the application.
 *
 * `@monaco-editor/react` fetches Monaco from a CDN by default. That would make
 * the Client depend on a third-party host at runtime, break on an air-gapped
 * deployment, and require loosening the Content-Security-Policy — none of which
 * is worth avoiding one import.
 */
declare global {
    interface Window {
        MonacoEnvironment?: { getWorker: () => Worker };
    }
}

window.MonacoEnvironment = { getWorker: () => new editorWorker() };
loader.config({ monaco });

/**
 * **Monaco measures a glyph once, at start-up.** It reads the width of the
 * character cell when an editor is created and lays every column out from that
 * number, so a face arriving afterwards leaves the text one width and the
 * cursor, selection and line numbers another. `JetBrains Mono` is
 * `font-display: swap` — see `index.css` — which is exactly the case: the first
 * editor of a cold load mounts on the fallback.
 *
 * `remeasureFonts` is Monaco's own answer, and it is global to the instance, so
 * once is enough however many editors are open. It is called after the face is
 * loaded rather than after the document is ready, because `document.fonts.ready`
 * settles on the faces the page *has asked for*, and on a page that has drawn no
 * fixed-pitch text yet this one is not among them.
 */
let remeasured = false;
function remeasureWhenTheFaceArrives() {
    if (remeasured || typeof document === "undefined" || !document.fonts) return;
    remeasured = true;
    // 13px, the size below. A `load` for a size nothing draws would fetch the
    // face and still leave Monaco measuring the one it started with.
    void document.fonts.load('13px "JetBrains Mono"').then(() => monaco.editor.remeasureFonts());
}

export interface CodeEditorProps {
    value: string;
    onChange?: (value: string) => void;
    /** Product language id, not a Monaco id. */
    language?: string;
    height?: number | string;
    readOnly?: boolean;
    /**
     * The problem type, because a language id means a different compiler under
     * different types — and a different grammar with it. Absent falls back to
     * `standard-io@1`'s catalog.
     */
    problemType?: string;
}

export default function CodeEditor({ value, onChange, language, height = 420, readOnly, problemType }: CodeEditorProps) {
    // The *computed* scheme, not the stored preference: `useMantineColorScheme`
    // answers `auto` as well, and comparing that against `dark` is a guess.
    const scheme = useComputedColorScheme("light");

    useEffect(remeasureWhenTheFaceArrives, []);

    return (
        // The frame says where the editor is. `CodeEditor.module.css`
        // explains why it is on this wrapper and not on `.monaco-editor`.
        <div className={classes.frame} data-testid="code-editor">
            <Editor
                height={height}
                language={monacoLanguage(problemType, language)}
                // **The editor follows the application.** `@monaco-editor/react`
                // applies this through an effect keyed on the prop, so a reader
                // using the toggle in the header sees the editor change with the
                // page — no remount, which would throw away the undo stack and the
                // scroll position in the middle of writing a solution.
                //
                // `setTheme` is global to the Monaco instance rather than per
                // editor. Harmless here: every editor on a screen computes the same
                // scheme.
                theme={scheme === "dark" ? "vs-dark" : "vs"}
                value={value}
                onChange={v => onChange?.(v ?? "")}
                loading={<Center h={height}><Loader /></Center>}
                options={{
                    readOnly,
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    // The theme's own fixed-pitch stack, not a second one written
                    // here: the editor and the highlighted preview of the same file
                    // must not be able to disagree about the type. Monaco appends
                    // its platform default behind whatever it is given, so the
                    // fallbacks in the constant are belt to that brace.
                    fontFamily: MONOSPACE_STACK,
                    fontSize: 13,
                    tabSize: 4,
                    automaticLayout: true,
                    renderLineHighlight: readOnly ? "none" : "line",
                }}
            />
        </div>
    );
}
