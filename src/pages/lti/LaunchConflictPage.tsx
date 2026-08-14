import { Alert, Code, Group, Stack, Text, Title } from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";

/**
 * A launch that says somebody is a different person than last time.
 *
 * §4.3: the link between an account and a platform's user is written <b>once</b>
 * and never moved. A later launch asserting another username for the same person
 * is a conflict to report, because following it would hand one person's history
 * — their submissions, their grades, their place in the course — to another
 * because a field changed in Moodle.
 *
 * So this page reports and offers nothing. There is no action a learner can take
 * that would be safe, and the fix is a person deciding which of the two names is
 * right.
 */
export default function LaunchConflictPage() {
    const { t } = useTranslation();
    const [parameters] = useSearchParams();

    const stored = parameters.get("stored") ?? "";
    const asserted = parameters.get("asserted") ?? "";

    return (
        <Stack gap="md" maw={620} mx="auto" my="xl">
            <Title order={3}>{t("This account does not match your course account")}</Title>

            <Alert
                variant="light"
                color="orange"
                icon={<IconAlertTriangle size={18} />}
                title={t("Nothing has been changed")}
            >
                <Text size="sm">
                    {t("AlgoJudge connected your course account to an AlgoJudge account earlier, and your course is now sending a different name. It will not move the connection by itself: the work already done under the first account would become unreachable.")}
                </Text>
            </Alert>

            <Group gap="xs">
                <Text size="sm">{t("Connected earlier as")}:</Text>
                <Code>{stored || "—"}</Code>
            </Group>
            <Group gap="xs">
                <Text size="sm">{t("Your course is now sending")}:</Text>
                <Code>{asserted || "—"}</Code>
            </Group>

            <Text size="sm" c="dimmed">
                {t("Send both names to whoever administers AlgoJudge. They can tell which account should keep the work and connect it properly.")}
            </Text>
        </Stack>
    );
}
