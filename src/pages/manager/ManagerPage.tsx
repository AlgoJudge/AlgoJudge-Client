import { Card, Grid, Group, Stack, Text, Title } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { BUILT_AREAS } from "./managerAreas";
import { usePermissions } from "../../provider/permissionsContext";

/**
 * The manager panel's landing screen: what this person may open, and what each
 * of those is for.
 *
 * Built from the same table as the sidebar and the route guard, and filtered the
 * same way, so a card cannot offer a screen that answers 403. It is also where a
 * refusal sends somebody back to, which is why it lists rather than greets.
 */
export default function ManagerPage() {
    const { t } = useTranslation();
    const { hasAny } = usePermissions();

    const areas = BUILT_AREAS.filter(area => hasAny(area.permissions));

    return (
        <Stack gap="md">
            <Stack gap={2}>
                <Title>{t("Manager")}</Title>
                <Text size="sm" c="dimmed">
                    {t("Everything you may administer here. What you may not is not listed.")}
                </Text>
            </Stack>

            {areas.length === 0 ? (
                <Text size="sm" c="dimmed">{t("Your account administers nothing yet.")}</Text>
            ) : (
                <Grid>
                    {areas.map(area => (
                        <Grid.Col key={area.to} span={{ base: 12, sm: 6, lg: 4 }}>
                            <Card withBorder radius="md" component={Link} to={area.to} h="100%">
                                <Stack gap={6}>
                                    <Group gap="xs" wrap="nowrap">
                                        <area.icon size={18} stroke={1.5} />
                                        <Text fw={500}>{t(area.label)}</Text>
                                    </Group>
                                    <Text size="sm" c="dimmed">{t(area.description)}</Text>
                                </Stack>
                            </Card>
                        </Grid.Col>
                    ))}
                </Grid>
            )}
        </Stack>
    );
}
