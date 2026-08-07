import { Alert, Code, Stack, Text } from "@mantine/core";
import { IconHelpCircle } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { RankingProps } from "./parse";

/** How much of the feed is worth printing before it stops being readable. */
const SHOWN = 50;

/**
 * Fallback for a ranking type this Client does not know how to draw.
 *
 * The results themselves are perfectly good data — it is the arithmetic that is
 * missing — so they are shown rather than swallowed. Truncated, because a feed
 * is one entry per submission and a contest's runs to thousands.
 */
export default function UnsupportedRanking({ results }: RankingProps) {
    const { t } = useTranslation();
    const shown = { ...results, results: results.results.slice(0, SHOWN) };
    return (
        <Stack gap="sm">
            <Alert color="blue" icon={<IconHelpCircle size={18} />} title={t("Unsupported ranking format")}>
                {t("This version of the application cannot display this ranking. The raw results are shown below.")}
            </Alert>
            {results.results.length > SHOWN && (
                <Text size="sm" c="dimmed">
                    {t("Showing the first {{shown}} of {{total}} results.", {
                        shown: SHOWN, total: results.results.length,
                    })}
                </Text>
            )}
            <Code block style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(shown, null, 2)}</Code>
        </Stack>
    );
}
