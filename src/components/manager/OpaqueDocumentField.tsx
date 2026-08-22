import { JsonInput } from "@mantine/core";
import { useTranslation } from "react-i18next";

/**
 * One of the documents the Server stores and never reads.
 *
 * A text area rather than a form, deliberately: the shape of what goes in
 * belongs to the **problem type**, and a form here would encode one type's
 * vocabulary into the Client — the same mistake, one floor up, as the Server
 * reading a language out of a submission.
 *
 * ## What it enforces, and what it does not
 *
 * It refuses text that is not JSON and text that is not an **object**, because
 * those are the two rules that hold for every one of these documents whatever
 * type wrote them (`docs/specs/OPAQUE_DOCUMENTS.md`). The Server refuses both
 * again; this is here so a manager is told before they press Save rather than
 * after.
 *
 * It checks nothing about the members. A `config` naming a language this build
 * has never heard of is a manager pointing at a Runner that is newer than this
 * screen, which is allowed and is the whole reason the field is opaque.
 *
 * **Empty means none, never `{}`.** Two spellings of one nothing drift, and the
 * specification names this as the defect that took `legalDocuments` out beside a
 * derivable answer.
 */
export interface OpaqueDocumentFieldProps {
    label: string,
    description: string,
    value: unknown,
    onChange: (value: unknown) => void,
    disabled?: boolean,
    placeholder?: string,
}

export default function OpaqueDocumentField({
    label, description, value, onChange, disabled, placeholder,
}: OpaqueDocumentFieldProps) {
    const { t } = useTranslation();

    // Formatted rather than round-tripped as typed: this is a stored document
    // being read back, not a draft being preserved, and two spaces of indent is
    // what makes a limits block legible at a glance.
    const text = value === undefined || value === null ? "" : JSON.stringify(value, null, 2);

    const parse = (written: string) => {
        const trimmed = written.trim();
        if (trimmed.length === 0) {
            onChange(undefined);
            return;
        }
        try {
            const parsed: unknown = JSON.parse(trimmed);
            // An object or absent. A scalar or an array reaches every reader's
            // `isRecord` guard and is dropped there silently, so it is refused
            // where somebody can still fix it.
            if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return;
            onChange(parsed);
        } catch {
            // Left for `validationError` to report. Not cleared: a half-typed
            // document must not wipe what is stored.
        }
    };

    return (
        <JsonInput
            label={label}
            description={description}
            placeholder={placeholder}
            value={text}
            onChange={parse}
            validationError={t("This is not a JSON object")}
            formatOnBlur
            autosize
            minRows={4}
            maxRows={14}
            disabled={disabled}
        />
    );
}
