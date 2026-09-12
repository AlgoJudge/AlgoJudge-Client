// Only the languages this product's editors may need. Importing the package
// entry point instead registers every language Monaco ships and pulls in the
// TypeScript, CSS, HTML and JSON language services — around nine megabytes of
// workers for features a solution editor never uses. Each registration is itself
// lazy: the tokenizer is fetched when a file of that language is opened.
//
// **Its own module, so more than one place can ask what is registered.** The
// editor needs them present; the printouts form needs to *list* them, and
// `monaco.languages.getLanguages()` answers only for what has been imported.
// A second hand-written list beside these lines is a list that drifts.
import "monaco-editor/languages/definitions/cpp/register.js";
import "monaco-editor/languages/definitions/python/register.js";
import "monaco-editor/languages/definitions/java/register.js";
import "monaco-editor/languages/definitions/csharp/register.js";
import "monaco-editor/languages/definitions/rust/register.js";
import "monaco-editor/languages/definitions/go/register.js";
import "monaco-editor/languages/definitions/pascal/register.js";
import "monaco-editor/languages/definitions/javascript/register.js";
import "monaco-editor/languages/definitions/typescript/register.js";
