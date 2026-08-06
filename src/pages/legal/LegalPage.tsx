import { Alert, Anchor, Center, Container, Group, Loader, Paper, Stack, Text, Title } from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";
import { lazy, Suspense, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router-dom";
import { LegalDocument, LegalDocumentKind } from "../../api/CoreApi";
import LoadState from "../../components/LoadState";
import ActivityTime from "../../components/time/ActivityTime";
import { useApiEffect } from "../../provider/apiContext";
import { pickTranslation } from "../../components/content/languageName";

const ContentView = lazy(() => import("../../content/ContentView"));

/**
 * A document the instance publishes: the terms, the privacy policy, the cookie
 * note, the accessibility statement.
 *
 * The text is instance configuration held by the Server, because the operator is
 * the data controller and each installation has its own. It is written in the
 * `content.md` format, so the renderer that draws a problem statement draws this
 * too — one format, one renderer, one validator.
 *
 * Public: somebody has to be able to read the privacy policy before deciding to
 * have an account at all.
 */

/** Which document a path stands for, so the addresses stay the obvious ones. */
const BY_PATH: Record<string, LegalDocumentKind> = {
    "/terms": "terms",
    "/privacy": "privacy",
    "/cookies": "cookies",
    "/accessibility": "accessibility",
};

export default function LegalPage() {
    const { t, i18n } = useTranslation();
    const location = useLocation();
    const kind = BY_PATH[location.pathname] ?? "terms";

    const [document, setDocument] = useState<LegalDocument | undefined | null>(undefined);

    const error = useApiEffect(async (api) => {
        // Null rather than undefined for "asked, and there is none": the two
        // states look identical to a spinner otherwise.
        const found = await api.authApi.getInstanceDocument(kind);
        // A legal document carries a title; the front pages do not, and this
        // screen only ever asks for the four that do.
        setDocument(found ? { ...found, kind, title: found.title ?? "" } : null);
    }, [kind]);

    if (document === undefined) return <LoadState error={error} loading={!error} />;

    if (document === null) {
        return (
            <Container size={720}>
                <Paper withBorder p="xl" radius="md">
                    <Stack gap="sm">
                        <Title order={3}>{t(`legal.${kind}`)}</Title>
                        <Text size="sm" c="dimmed">
                            {t("This instance publishes no such document. Ask whoever runs it.")}
                        </Text>
                        <Anchor component={Link} to="/">{t("Home")}</Anchor>
                    </Stack>
                </Paper>
            </Container>
        );
    }

    // The operator's document in the reader's language, falling back to the one
    // they wrote first — a policy nobody translated is still the policy.
    const translation = pickTranslation(document.translations, i18n.language);
    const title = translation?.title ?? document.title;
    const content = translation?.content ?? document.content;

    return (
        <Container size={860}>
            <Stack gap="md">
                <Group justify="space-between" align="baseline" wrap="wrap">
                    <Title order={2}>{title}</Title>
                    {/* Not "updated": a document that has been replaced is still
                        readable at its own date, and what a reader needs to know
                        is which revision they are looking at. */}
                    {document.validFrom && (
                        <Text size="sm" c="dimmed">
                            {t("In force since")}:{" "}
                            <ActivityTime value={document.validFrom} timeZone="Europe/Warsaw" format="date" hideZone />
                        </Text>
                    )}
                </Group>

                {/* A template names nobody real. Saying so where the document is
                    read is the only way a visitor can tell the difference. */}
                {document.isTemplate && (
                    <Alert color="orange" icon={<IconAlertTriangle size={18} />}>
                        {t("This is the template that ships with the software. The operator of this instance has not replaced it yet, so it is not binding.")}
                    </Alert>
                )}

                <Paper withBorder p="xl" radius="md">
                    <Suspense fallback={<Center my="xl"><Loader /></Center>}>
                        <ContentView content={content} attachments={[]} />
                    </Suspense>
                </Paper>
            </Stack>
        </Container>
    );
}
