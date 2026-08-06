import { Alert, Code, Stack } from "@mantine/core";
import { IconHelpCircle } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { RankingProps } from "./parse";

/** Fallback for a ranking format this Client does not know how to draw. */
export default function UnsupportedRanking({ ranking }: RankingProps) {
    const { t } = useTranslation();
    return (
        <Stack gap="sm">
            <Alert color="blue" icon={<IconHelpCircle size={18} />} title={t("Unsupported ranking format")}>
                {t("This version of the application cannot display this ranking. The raw document is shown below.")}
            </Alert>
            <Code block style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(ranking, null, 2)}</Code>
        </Stack>
    );
}
