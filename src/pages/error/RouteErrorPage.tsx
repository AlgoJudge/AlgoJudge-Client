import { Button, Container, Group, Paper, Stack, Text, Title } from "@mantine/core";
import { IconAlertTriangle, IconArrowLeft } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { Link, isRouteErrorResponse, useRouteError } from "react-router-dom";
import NotFoundPage from "./NotFoundPage";

/**
 * What a shell shows instead of the router's own error screen.
 *
 * Two different things arrive here and they deserve different sentences: an
 * address nobody serves, which is a visitor's typo, and a screen that threw,
 * which is ours. Until 2026-09-01 there was no `errorElement` anywhere in the
 * application, so both reached React Router's built-in boundary — "Hey
 * developer", addressed to somebody who is not one.
 */
export default function RouteErrorPage() {
    const { t } = useTranslation();
    const error = useRouteError();

    if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundPage />;

    return (
        <Container size={640} my={40}>
            <Paper withBorder p="xl" radius="md">
                <Stack gap="sm">
                    <Group gap="xs">
                        <IconAlertTriangle size={22} />
                        <Title order={3}>{t("Something went wrong on this screen")}</Title>
                    </Group>
                    {/* Deliberately not the error's own message. It is written for
                        a developer, in English whatever the interface language,
                        and it can carry an address or an identifier that has no
                        business being shown to whoever happens to be reading. */}
                    <Text size="sm" c="dimmed">
                        {t("The screen could not be drawn. Refreshing usually helps.")}
                    </Text>
                    <Group>
                        <Button onClick={() => { window.location.reload(); }}>
                            {t("Refresh")}
                        </Button>
                        <Button component={Link} to="/" variant="default"
                            leftSection={<IconArrowLeft size={16} />}>
                            {t("Home")}
                        </Button>
                    </Group>
                </Stack>
            </Paper>
        </Container>
    );
}
