import { Anchor, Badge, Button, Card, Center, Group, Loader, Stack, Text, Title } from "@mantine/core";
import { IconClock, IconDatabase, IconDownload } from "@tabler/icons-react";
import { Suspense, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Activity, ProblemDetail } from "../../../../../api/ParticipantApi";
import ProblemStatusBadge from "../../../../../components/problem/ProblemStatusBadge";
import { useApiEffect } from "../../../../../provider/ApiProvider";
import { statementRenderers } from "../../../../../renderers";

/** `content.json` and `content.pdf` are the statement, not material beside it. */
const isStatementFile = (name: string) => /^content\.[^.]+$/i.test(name);

export default function ProblemPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { activityId, problemId } = useParams();

    const [activity, setActivity] = useState<Activity | undefined>(undefined);
    const [problem, setProblem] = useState<ProblemDetail | undefined>(undefined);

    useApiEffect(async (api) => {
        if (!activityId || !problemId) return;
        const activity = await api.participantApi.getActivity(activityId);
        setActivity(activity);
        setProblem(await api.participantApi.getProblem(activity.id, problemId));

        // The statement is where a participant sits while waiting for a verdict,
        // so their standing on this problem has to move here too — not only on
        // the list they came from.
        api.participantApi.eventDispatcher.addEventListener("problemStatusChanged", evt => {
            if (evt.data.activityId !== activity.id) return;
            setProblem(current => current && current.id === evt.data.problem.id
                ? {
                    ...current,
                    status: evt.data.problem.status,
                    bestScore: evt.data.problem.bestScore,
                    attempts: evt.data.problem.attempts,
                }
                : current);
        });
    }, [activityId, problemId]);

    if (!activity || !problem) {
        return <Center my="xl"><Loader size="xl" /></Center>;
    }

    const Statement = statementRenderers.resolve(problem.type).value;
    const downloads = problem.attachments.filter(a => !isStatementFile(a.name));

    return (
        <Stack gap="md">
            <Group justify="space-between" align="flex-start" wrap="wrap">
                <Stack gap={4}>
                    <Title>[{problem.slug}] {problem.name}</Title>
                    <Group gap="xs">
                        <ProblemStatusBadge
                            status={problem.status}
                            bestScore={problem.bestScore}
                            maxScore={problem.maxScore}
                            attempts={problem.attempts}
                        />
                        {/* Absent when the manager chose not to show them, so the
                            screen renders nothing rather than "undefined". */}
                        {problem.limits && (
                            <>
                                <Badge variant="light" leftSection={<IconClock size={14} />}>
                                    {(problem.limits.timeMs / 1000).toFixed(2)} s
                                </Badge>
                                <Badge variant="light" leftSection={<IconDatabase size={14} />}>
                                    {problem.limits.memoryMb} MB
                                </Badge>
                            </>
                        )}
                        {problem.submissionsLeft !== undefined && (
                            <Badge variant="outline" color="gray">
                                {t("Submissions left")}: {problem.submissionsLeft}
                            </Badge>
                        )}
                    </Group>
                </Stack>
                <Group>
                    <Button variant="default" onClick={() => navigate(-1)}>{t("Back")}</Button>
                    <Button component={Link} to={`/activities/${activity.slug}/submit/${problem.slug}`}>
                        {t("Submit")}
                    </Button>
                </Group>
            </Group>

            <Suspense fallback={<Center my="xl"><Loader /></Center>}>
                <Statement content={problem.content} attachments={problem.attachments} />
            </Suspense>

            {problem.samples && problem.samples.length > 0 && (
                <Text size="sm" c="dimmed">
                    {t("Samples are also available as separate files where the problem provides them.")}
                </Text>
            )}

            {downloads.length > 0 && (
                <Card withBorder radius="sm">
                    <Title order={4} mb="xs">{t("Attachments")}</Title>
                    <Stack gap={4}>
                        {downloads.map(a => (
                            <Group key={a.name} gap="xs">
                                <IconDownload size={16} />
                                <Anchor href={a.url} download>{a.name}</Anchor>
                                <Text size="xs" c="dimmed">{Math.ceil(a.sizeBytes / 1024)} kB</Text>
                            </Group>
                        ))}
                    </Stack>
                </Card>
            )}
        </Stack>
    );
}
