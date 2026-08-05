import { Button, Code, Container, Group, Paper, Stack, Text, Title } from "@mantine/core";
import { IconArrowLeft, IconLock } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

/**
 * The answer to a screen somebody may not open.
 *
 * A screen rather than a silent redirect: the address may have come from
 * somebody who *does* hold the permission, and a person bounced to the home page
 * without a word cannot tell a missing permission from a broken link. It names
 * the permission, because "ask an administrator for X" is a request an
 * administrator can act on.
 */
export default function ForbiddenPage({ permissions }: { permissions?: string[] }) {
    const { t } = useTranslation();

    return (
        <Container size={640} my={40}>
            <Paper withBorder p="xl" radius="md">
                <Stack gap="sm">
                    <Group gap="xs">
                        <IconLock size={22} />
                        <Title order={3}>{t("You may not open this screen")}</Title>
                    </Group>
                    <Text size="sm" c="dimmed">
                        {t("Your account does not hold the permission this screen needs. Somebody who does can grant it, or open it for you.")}
                    </Text>
                    {permissions && permissions.length > 0 && (
                        <Text size="sm">
                            {t("Needs one of")}:{" "}
                            {permissions.map(permission => (
                                <Code key={permission} mr={4}>{permission}</Code>
                            ))}
                        </Text>
                    )}
                    <Group>
                        <Button component={Link} to="/" leftSection={<IconArrowLeft size={16} />}>
                            {t("Home")}
                        </Button>
                        <Button component={Link} to="/activities" variant="default">
                            {t("Activities")}
                        </Button>
                    </Group>
                </Stack>
            </Paper>
        </Container>
    );
}
