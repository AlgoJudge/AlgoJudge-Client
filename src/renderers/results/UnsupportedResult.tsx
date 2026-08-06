import { Alert, Code, Stack } from "@mantine/core";
import { IconHelpCircle } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";

/**
 * Fallback for an evaluation document this Client cannot draw.
 *
 * The document originates beside untrusted code — a checker may echo a
 * participant's program output into it — so it is printed as data and never
 * interpreted.
 */
export default function UnsupportedResult({ detail }: { detail: unknown }) {
    const { t } = useTranslation();
    return (
        <Stack gap="sm">
            <Alert color="blue" icon={<IconHelpCircle size={18} />} title={t("Unsupported result format")}>
                {t("This version of the application cannot display these results. The raw document is shown below.")}
            </Alert>
            <Code block style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(detail, null, 2)}</Code>
        </Stack>
    );
}
