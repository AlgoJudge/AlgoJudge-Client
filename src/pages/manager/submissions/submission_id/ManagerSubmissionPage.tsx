import { Alert, Badge, Button, Card, Center, Code, Group, Loader, Stack, Table, Text, Title, Tooltip } from "@mantine/core";
import { IconArrowLeft, IconExternalLink, IconPlayerStop, IconRefresh } from "@tabler/icons-react";
import { lazy, Suspense, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ManagedSubmissionDetail } from "../../../../api/ManagerApi";
import { JobState } from "../../../../api/ParticipantApi";
import LoadState from "../../../../components/LoadState";
import ActivityTime from "../../../../components/time/ActivityTime";
import { useApiCall, useApiEffect } from "../../../../provider/ApiProvider";
import { resultRenderers } from "../../../../renderers";

const CodeEditor = lazy(() => import("../../../../components/editor/CodeEditor"));

const STATE_COLOUR: Record<JobState, string> = {
    queued: "gray",
    running: "blue",
    completed: "teal",
    failed: "red",
    cancelled: "gray",
};

const isFinished = (state: JobState) => state === "completed" || state === "failed";

/**
 * One submission, with every attempt it has had.
 *
 * The per-attempt result is drawn by the same renderer the participant gets, so
 * the two cannot drift; what a manager has that a participant does not is the
 * log, the Runner's name, and the ability to add an attempt or stop one.
 */
export default function ManagerSubmissionPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const call = useApiCall();
    const { submissionId } = useParams();

    const [submission, setSubmission] = useState<ManagedSubmissionDetail | undefined>(undefined);
    const [source, setSource] = useState("");
    const [error, setError] = useState<string | undefined>(undefined);
    const [busy, setBusy] = useState(false);
    const [reload, setReload] = useState(0);

    const loadError = useApiEffect(async (api) => {
        if (!submissionId) return;
        const loaded = await api.managerApi.getSubmission(submissionId);
        const file = loaded.files[0];
        const text = file ? await api.managerApi.getSubmissionFile(loaded.id, file.name) : "";

        setSubmission(loaded);
        setSource(text);

        // A rejudge walks through queued and running; the screen a manager is
        // watching should follow it without being reloaded.
        api.managerApi.eventDispatcher.addEventListener("submissionChanged", evt => {
            if (evt.data.submission.id === loaded.id) setReload(n => n + 1);
        });
    }, [submissionId, reload]);

    const run = async (operation: () => Promise<unknown>) => {
        setError(undefined);
        setBusy(true);
        try {
            await operation();
            setReload(n => n + 1);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    };

    if (!submission) return <LoadState error={loadError} loading={!loadError} />;

    const Result = resultRenderers.resolve(submission.problemType).value;
    const file = submission.files[0];

    return (
        <Stack gap="md">
            <Group justify="space-between" wrap="wrap">
                <Stack gap={2}>
                    <Group gap="xs">
                        <Title order={2}>[{submission.problemSlug}] {submission.problemName}</Title>
                        <Badge variant="light" color={STATE_COLOUR[submission.state]}>
                            {t(`jobState.${submission.state}`)}
                        </Badge>
                    </Group>
                    <Text size="sm" c="dimmed">
                        {submission.userName} · {submission.activitySlug} · {submission.seriesName} ·{" "}
                        <ActivityTime value={submission.submittedAt} timeZone="Europe/Warsaw" />
                    </Text>
                </Stack>
                <Group gap="xs">
                    <Button
                        variant="default"
                        leftSection={<IconExternalLink size={16} />}
                        component={Link}
                        to={`/activities/${submission.activitySlug}/problems/${submission.problemSlug}`}
                    >
                        {t("Problem")}
                    </Button>
                    <Button
                        leftSection={<IconRefresh size={16} />}
                        loading={busy}
                        onClick={() => run(() => call(api => api.managerApi.rejudgeSubmission(submission.id)))}
                    >
                        {t("Rejudge")}
                    </Button>
                    <Button variant="default" leftSection={<IconArrowLeft size={16} />} onClick={() => navigate("/manager/submissions")}>
                        {t("Back")}
                    </Button>
                </Group>
            </Group>

            {error && <Alert color="red" withCloseButton onClose={() => setError(undefined)}>{error}</Alert>}

            <Card withBorder radius="sm">
                <Title order={5} mb="sm">{t("Attempts")}</Title>
                <Table.ScrollContainer minWidth={700}>
                    <Table striped>
                        <Table.Thead>
                            <Table.Tr>
                                <Table.Th w={60}>#</Table.Th>
                                <Table.Th>{t("State")}</Table.Th>
                                <Table.Th>{t("Runner")}</Table.Th>
                                <Table.Th>{t("Started")}</Table.Th>
                                <Table.Th>{t("Finished")}</Table.Th>
                                <Table.Th />
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {submission.attemptList.map(attempt => (
                                <Table.Tr key={attempt.id}>
                                    <Table.Td><Text fw={500}>{attempt.attempt}</Text></Table.Td>
                                    <Table.Td>
                                        <Badge variant="light" color={STATE_COLOUR[attempt.state]}>
                                            {t(`jobState.${attempt.state}`)}
                                        </Badge>
                                    </Table.Td>
                                    <Table.Td><Text size="sm">{attempt.runnerName ?? "—"}</Text></Table.Td>
                                    <Table.Td>
                                        <ActivityTime value={attempt.startedAt} timeZone="Europe/Warsaw" hideZone />
                                    </Table.Td>
                                    <Table.Td>
                                        {attempt.finishedAt
                                            ? <ActivityTime value={attempt.finishedAt} timeZone="Europe/Warsaw" hideZone />
                                            : <Text size="sm" c="dimmed">—</Text>}
                                    </Table.Td>
                                    <Table.Td>
                                        <Group justify="flex-end">
                                            {/* A finished job is history: cancelling one
                                                would rewrite a result someone has seen. */}
                                            <Tooltip
                                                label={isFinished(attempt.state)
                                                    ? t("This attempt has already finished")
                                                    : t("Cancel this attempt")}
                                            >
                                                <Button
                                                    variant="subtle"
                                                    color="red"
                                                    size="compact-sm"
                                                    disabled={isFinished(attempt.state) || attempt.state === "cancelled"}
                                                    loading={busy}
                                                    onClick={() => run(() => call(api =>
                                                        api.managerApi.cancelAttempt(submission.id, attempt.id)))}
                                                >
                                                    <IconPlayerStop size={14} />
                                                </Button>
                                            </Tooltip>
                                        </Group>
                                    </Table.Td>
                                </Table.Tr>
                            ))}
                        </Table.Tbody>
                    </Table>
                </Table.ScrollContainer>
            </Card>

            {submission.attemptList.map(attempt => attempt.detail !== undefined && (
                <Card key={`${attempt.id}-result`} withBorder radius="sm">
                    <Group justify="space-between" mb="sm">
                        <Title order={5}>{t("Result of attempt")} {attempt.attempt}</Title>
                        <Text size="sm" c="dimmed">{attempt.runnerName}</Text>
                    </Group>
                    <Result detail={attempt.detail} />
                </Card>
            ))}

            {submission.attemptList.some(a => a.log) && (
                <Card withBorder radius="sm">
                    <Title order={5} mb="sm">{t("Evaluation log")}</Title>
                    {submission.attemptList.filter(a => a.log).map(attempt => (
                        <Stack key={`${attempt.id}-log`} gap={4} mb="sm">
                            <Text size="xs" c="dimmed">#{attempt.attempt} · {attempt.runnerName ?? t("no runner")}</Text>
                            <Code block style={{ whiteSpace: "pre-wrap" }}>{attempt.log}</Code>
                        </Stack>
                    ))}
                </Card>
            )}

            <Card withBorder radius="sm" p={0}>
                <Group justify="space-between" p="sm">
                    <Title order={5}>{file?.name ?? t("Source")}</Title>
                    <Text size="xs" c="dimmed" ff="monospace">
                        {file ? `sha256 ${file.sha256.slice(0, 16)}…` : ""}
                    </Text>
                </Group>
                <Suspense fallback={<Center my="xl"><Loader /></Center>}>
                    <CodeEditor value={source} language={submission.language} readOnly height={420} />
                </Suspense>
            </Card>
        </Stack>
    );
}
