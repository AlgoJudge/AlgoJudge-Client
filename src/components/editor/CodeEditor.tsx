import Editor, { loader } from "@monaco-editor/react";
import { Center, Loader, useComputedColorScheme } from "@mantine/core";
import * as monaco from "monaco-editor/editor/editor.api.js";
import editorWorker from "monaco-editor/editor/editor.worker.js?worker";
import { monacoLanguage } from "./languages";

// Only the languages a submission may actually be written in. Importing the
// package entry point instead registers every language Monaco ships and pulls in
// the TypeScript, CSS, HTML and JSON language services — around nine megabytes
// of workers for features a solution editor never uses. Each registration is
// itself lazy: the tokenizer is fetched when a file of that language is opened.
import "monaco-editor/languages/definitions/cpp/register.js";
import "monaco-editor/languages/definitions/python/register.js";
import "monaco-editor/languages/definitions/java/register.js";
import "monaco-editor/languages/definitions/csharp/register.js";
import "monaco-editor/languages/definitions/rust/register.js";
import "monaco-editor/languages/definitions/go/register.js";
import "monaco-editor/languages/definitions/pascal/register.js";
import "monaco-editor/languages/definitions/javascript/register.js";
import "monaco-editor/languages/definitions/typescript/register.js";

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

export interface CodeEditorProps {
    value: string;
    onChange?: (value: string) => void;
    /** Product language id, not a Monaco id. */
    language?: string;
    height?: number | string;
    readOnly?: boolean;
}

export default function CodeEditor({ value, onChange, language, height = 420, readOnly }: CodeEditorProps) {
    const scheme = useComputedColorScheme("light");
    return (
        <Editor
            height={height}
            language={monacoLanguage(language)}
            theme={scheme === "dark" ? "vs-dark" : "light"}
            value={value}
            onChange={v => onChange?.(v ?? "")}
            loading={<Center h={height}><Loader /></Center>}
            options={{
                readOnly,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                fontSize: 13,
                tabSize: 4,
                automaticLayout: true,
                renderLineHighlight: readOnly ? "none" : "line",
            }}
        />
    );
}
