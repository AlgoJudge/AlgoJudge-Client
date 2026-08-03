import { Alert, Code, Stack } from "@mantine/core";
import { IconHelpCircle } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { Attachment } from "../api/ParticipantApi";

/**
 * Fallback for a statement whose type this Client does not know.
 *
 * It shows the document as it arrived rather than nothing at all: a participant
 * facing an unsupported type should still be able to read what was published,
 * and an author should be able to see that the content reached the browser
 * intact. The document is printed as data — never interpreted, never executed.
 */
export default function UnsupportedContent({ content, attachments }: { content: unknown; attachments: Attachment[] }) {
    const { t } = useTranslation();
    return (
        <Stack gap="sm">
            <Alert color="blue" icon={<IconHelpCircle size={18} />} title={t("Unsupported problem type")}>
                {t("This version of the application cannot display this problem. The raw content is shown below.")}
            </Alert>
            <Code block style={{ whiteSpace: "pre-wrap" }}>
                {JSON.stringify(content, null, 2)}
            </Code>
            {attachments.length > 0 && (
                <Code block>{attachments.map(a => a.name).join("\n")}</Code>
            )}
        </Stack>
    );
}
