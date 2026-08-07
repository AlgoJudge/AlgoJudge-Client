import { Alert, Anchor, Center, Container, Group, Loader, Paper, Stack, Text, Title } from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";
import { lazy, Suspense, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router-dom";
import { LegalDocumentKind } from "../../api/CoreApi";
import { pickDocumentRef } from "../../api/instanceDocuments";
import LoadState from "../../components/LoadState";
import ActivityTime from "../../components/time/ActivityTime";
import { useApiEffect } from "../../provider/apiContext";
import { useInstance } from "../../provider/instanceContext";

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

    // The reference comes with the instance, which is fetched once at start-up;
    // only the text of the language being shown is fetched here. An operator who
    // publishes no such document has no reference for it, and that is the whole
    // of "there is none" — no request is made to find out.
    const { instance } = useInstance();
    const ref = pickDocumentRef(instance.documents, kind, i18n.language);

    const [content, setContent] = useState<string | undefined | null>(undefined);

    const error = useApiEffect(async (api) => {
        // Null rather than undefined for "asked, and there is none": the two
        // states look identical to a spinner otherwise.
        setContent(ref ? await api.fileApi.getText(ref.fileId) : null);
        // The reference itself, not its id: it is an element of the instance
        // answer, which is fetched once, so its identity changes exactly when
        // the document behind it does.
    }, [ref]);

    if (content === undefined) return <LoadState error={error} loading={!error} />;

    // An instance that publishes no such document links to it from nowhere — not
    // from the footer, not from the navigation — so whoever is here typed the
    // address or kept a bookmark from before it was withdrawn. One sentence and
    // a way out is what that person needs; the operator is not their problem.
    if (content === null || !ref) {
        return (
            <Container size={720}>
                <Paper withBorder p="xl" radius="md">
                    <Stack gap="sm">
                        <Title order={3}>{t("There is no such page here")}</Title>
                        <Anchor component={Link} to="/">{t("Home")}</Anchor>
                    </Stack>
                </Paper>
            </Container>
        );
    }

    return (
        <Container size={860}>
            <Stack gap="md">
                <Group justify="space-between" align="baseline" wrap="wrap">
                    {/* The heading travels with the reference, so it is drawn
                        before the text arrives rather than after it. */}
                    <Title order={2}>{ref.title ?? t(`legal.${kind}`)}</Title>
                    {/* Not "updated": a document that has been replaced is still
                        readable at its own date, and what a reader needs to know
                        is which revision they are looking at. */}
                    {ref.validFrom && (
                        <Text size="sm" c="dimmed">
                            {t("In force since")}:{" "}
                            <ActivityTime value={ref.validFrom} timeZone="Europe/Warsaw" format="date" hideZone />
                        </Text>
                    )}
                </Group>

                {/* A template names nobody real. Saying so where the document is
                    read is the only way a visitor can tell the difference. */}
                {ref.isTemplate && (
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
