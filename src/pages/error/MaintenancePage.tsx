import { Container, Group, Loader, Paper, Stack, Text, Title } from "@mantine/core";
import { IconTool } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { ServerAway } from "../../provider/maintenanceContext";

/**
 * What the whole interface becomes while the Server is away.
 *
 * **No button.** Every action this page could offer needs the Server that is not
 * answering — reloading, signing in, going home — so a control that does nothing
 * would only invite somebody to press it twice. The screen waits instead, and
 * the wait is visible: the provider is polling, and the spinner is what says so.
 *
 * Two sentences, not one. A planned window and an unreachable Server are
 * different facts and want different things done about them: one is waited out,
 * the other is somebody's to fix. The Client can tell them apart only by whether
 * anything answered at all, so that is what decides which is shown.
 */
export default function MaintenancePage({ away }: { away: ServerAway }) {
    const { t } = useTranslation();
    const planned = away.level !== undefined;

    return (
        <Container size={560} my={80}>
            <Paper withBorder p="xl" radius="md">
                <Stack gap="sm">
                    <Group gap="xs">
                        <IconTool size={22} />
                        <Title order={3}>
                            {planned
                                ? t("The Server is under maintenance")
                                : t("The Server is not answering")}
                        </Title>
                    </Group>

                    <Text size="sm" c="dimmed">
                        {planned
                            ? t("Somebody is working on this installation. Nothing you sent has been lost, and this page returns on its own when the work is finished.")
                            : t("This installation cannot be reached from here. It may be starting, or the connection may be down; this page returns on its own once it answers.")}
                    </Text>

                    {/* The operator's own words, shown as they were typed and
                        never translated: whoever wrote them chose them for
                        whoever is reading this. */}
                    {away.reason && (
                        <Text size="sm">{away.reason}</Text>
                    )}

                    <Group gap="xs" mt="xs">
                        <Loader size="xs" />
                        <Text size="xs" c="dimmed">{t("Waiting for the Server")}</Text>
                    </Group>
                </Stack>
            </Paper>
        </Container>
    );
}
