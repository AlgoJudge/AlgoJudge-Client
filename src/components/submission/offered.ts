import { languageLabel } from "../editor/languages";

/**
 * Reading the three opaque documents an assignment carries, guardedly.
 *
 * They are `unknown` because the Server stores them and never reads them, so
 * nothing has checked their shape beyond "an object, and under 256 kB". Every
 * reader guards before using — `isRecord` in `renderers/results` is the same
 * pattern — and a document that says something unexpected produces a form with
 * a shorter list rather than a screen that throws.
 */

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

export interface OfferedLanguage {
    id: string,
    label: string,
}

/**
 * Both shapes a `languages` list may be written in, from either document.
 *
 * `["cpp17-gcc"]` is what a manager writes when the labels are the product's
 * own; `[{ id, label }]` is for an assignment that wants to call something by
 * a course's name. Anything else in the array is skipped rather than shown as
 * `[object Object]`.
 */
function read(document: unknown): OfferedLanguage[] {
    if (!isRecord(document) || !Array.isArray(document.languages)) return [];

    return document.languages.flatMap((entry): OfferedLanguage[] => {
        if (typeof entry === "string") {
            return [{ id: entry, label: languageLabel(entry) }];
        }
        if (isRecord(entry) && typeof entry.id === "string") {
            const label = typeof entry.label === "string" ? entry.label : languageLabel(entry.id);
            return [{ id: entry.id, label }];
        }
        return [];
    });
}

/**
 * What the select offers, in the order the assignment wrote them.
 *
 * **`spec` first, `config` second, and the difference matters.** `spec` is what
 * a manager wrote *for this form* — it may name fewer, or label them for a
 * course. `config` is what the Runner enforces, and falling back to it means an
 * assignment that filled only the one that counts still has a working form.
 *
 * **Neither is a permission.** A participant who edits either in a console
 * changes what their own select shows and nothing about what is accepted: the
 * Runner refuses anything outside `config.languages`, whatever was offered.
 *
 * An empty result means the assignment named none. The Runner reads that as
 * "the assignment did not say" and accepts anything it can build, so the caller
 * offers what it knows rather than blocking a participant out of a form.
 */
export function offeredLanguages(spec: unknown, config: unknown): OfferedLanguage[] {
    const fromSpec = read(spec);
    return fromSpec.length > 0 ? fromSpec : read(config);
}

/**
 * The `props` entries a header shows above a statement, as `key: value` pairs.
 *
 * Display only, and that is the whole of its contract: if this is wrong the
 * screen is ugly, nothing is judged differently and no form breaks. Values that
 * are not scalars are skipped — a nested object has no reading here, and
 * printing `[object Object]` at a participant is worse than printing nothing.
 */
export function displayProps(props: unknown): { key: string, value: string }[] {
    if (!isRecord(props)) return [];

    return Object.entries(props)
        // The envelope names the document's type; it is not something to show.
        .filter(([key]) => key !== "type")
        .flatMap(([key, value]) => {
            if (typeof value === "string") return [{ key, value }];
            if (typeof value === "number" || typeof value === "boolean") {
                return [{ key, value: String(value) }];
            }
            return [];
        });
}

/**
 * The language a submission declared, if it declared one.
 *
 * `standard-io@1` calls it `language`; another type may not have one at all,
 * which is why every caller has to cope with `undefined` rather than this
 * inventing a value.
 */
export function languageOf(props: unknown): string | undefined {
    if (!isRecord(props)) return undefined;
    return typeof props.language === "string" ? props.language : undefined;
}

/**
 * What a column or a field shows for a submission's language: the toolchain's
 * label, or a dash where the type declared none.
 *
 * The **label**, not the id — `C++17 (GCC)` rather than `cpp17-gcc`. A screen
 * showed the raw id before the catalogue existed, when the id happened to be a
 * word a person recognised.
 */
export const languageText = (props: unknown): string => {
    const id = languageOf(props);
    return id === undefined ? "—" : languageLabel(id);
};
