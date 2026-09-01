import { Button, Container, Group, Paper, Stack, Text, Title } from "@mantine/core";
import { IconArrowLeft, IconMapSearch } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

/**
 * The answer to an address this application does not serve.
 *
 * A screen of our own rather than React Router's built-in one, which greets a
 * visitor with "Hey developer" and the internals of a framework they did not
 * choose to use. Mistyping an address is an ordinary thing to do; the two
 * buttons are what somebody who has just done it actually wants.
 */
export default function NotFoundPage() {
    const { t } = useTranslation();

    return (
        <Container size={640} my={40}>
            <Paper withBorder p="xl" radius="md">
                <Stack gap="sm">
                    <Group gap="xs">
                        <IconMapSearch size={22} />
                        <Title order={3}>{t("This address does not exist")}</Title>
                    </Group>
                    <Text size="sm" c="dimmed">
                        {t("Nothing is served here. The link may be out of date, or the address may have a typo in it.")}
                    </Text>
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
