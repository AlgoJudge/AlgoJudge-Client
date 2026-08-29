import { Alert, Badge, Button, Card, Center, Code, Group, Loader, Modal, Stack, Table, Text, Textarea, Title, Tooltip } from "@mantine/core";
import { IconArrowLeft, IconCircleMinus, IconCirclePlus, IconDeviceDesktop, IconExternalLink, IconPlayerStop, IconRefresh, IconWorld } from "@tabler/icons-react";
import { lazy, Suspense, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ManagedSubmissionDetail } from "../../../../api/ManagerApi";
import { JobState } from "../../../../api/ParticipantApi";
import LoadState from "../../../../components/LoadState";
import ActivityTime from "../../../../components/time/ActivityTime";
import { useApiCall, useApiEffect } from "../../../../provider/apiContext";
import { resultRenderers } from "../../../../renderers";
import { ManagedAttempt } from "../../../../api/ManagerApi";
import { SUBMISSION_DETAILS, SUBMISSION_LOG } from "../../../../api/ParticipantApi";
import { useAttachment, useResultDocument } from "../../../../components/submission/useAttachment";
import { languageOf, typeOf } from "../../../../components/submission/offered";

const CodeEditor = lazy(() => import("../../../../components/editor/CodeEditor"));

/**
 * Where a submission was sent from, for a judge auditing a contest.
 *
 * **Only what is there.** Each of the three is absent on its own terms: the
 * address and the device once the Server's retention window has passed, the
 * session on the first request a brand-new browser makes. `Group` drops falsy
 * children, so an absent value leaves no gap and no stray separator.
 *
 * The device is labelled as the browser rather than as the machine, and that is
 * the whole of what may be claimed for it: a page writes it, so it is forgeable,
 * and a room of machines imaged from one disk reports one for all of them. It
 * answers *the same browser, two accounts*.
 */
function SubmissionOrigin({ submission }: { submission: ManagedSubmissionDetail }) {
    const { t } = useTranslation();
    const { ipAddress, sessionId, deviceId } = submission;

    if (!ipAddress && !sessionId && !deviceId) return null;

    return (
        <Group gap="xs" mt={2}>
            {ipAddress && (
                <Tooltip label={t("The address this submission arrived from")}>
                    <Badge variant="default" size="sm" leftSection={<IconWorld size={12} />}>
                        {ipAddress}
                    </Badge>
                </Tooltip>
            )}
            {deviceId && (
                <Tooltip label={t("The browser said it was this one. It can be changed by whoever uses it, so it is a hint and not proof.")}>
                    <Badge variant="default" size="sm" leftSection={<IconDeviceDesktop size={12} />}>
                        {deviceId.slice(0, 8)}
                    </Badge>
                </Tooltip>
            )}
            {sessionId && (
                <Tooltip label={t("The browser session it was sent in")}>
                    <Badge variant="default" size="sm">{sessionId.slice(0, 8)}</Badge>
                </Tooltip>
            )}
        </Group>
    );
}

/**
 * Ruling a submission out of every standing, or lifting the ruling.
 *
 * A modal rather than a switch, because the reason is the point: a judge reading
 * this row in a month needs to know why, and a control that set the flag without
 * asking would make the reason the exception.
 *
 * **The note under the field is not decoration.** The reason travels in the
 * participant's own data export, so a manager has to know that before writing
 * one — the alternative is finding out from a subject access request.
 */
function ExclusionModal(
    { submission, busy, onSubmit }: {
        submission: ManagedSubmissionDetail;
        busy: boolean;
        onSubmit: (excluded: boolean, reason?: string) => void;
    },
) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const [reason, setReason] = useState("");

    if (submission.excluded) {
        return (
            <Button data-testid="count-again"
                variant="default"
                leftSection={<IconCirclePlus size={16} />}
                loading={busy}
                onClick={() => onSubmit(false)}
            >
                {t("Count it again")}
            </Button>
        );
    }

    return (
        <>
            <Button data-testid="do-not-count"
                variant="default"
                color="orange"
                leftSection={<IconCircleMinus size={16} />}
                loading={busy}
                onClick={() => { setReason(""); setOpen(true); }}
            >
                {t("Do not count")}
            </Button>
            <Modal opened={open} onClose={() => setOpen(false)} title={t("Do not count this submission")}>
                <Stack gap="sm">
                    <Text size="sm">
                        {t("It keeps its verdict and its place in the list, and it stays counted against the submission limit. It stops counting towards the ranking, the best score and the grade sent to the LMS.")}
                    </Text>
                    <Textarea
                        label={t("Reason")}
                        description={t("Seen by managers. It is also part of the participant's own data export, so write it as something they may read.")}
                        autosize
                        minRows={2}
                        value={reason}
                        onChange={event => setReason(event.currentTarget.value)}
                    />
                    <Group justify="flex-end">
                        <Button variant="default" onClick={() => setOpen(false)}>{t("Cancel")}</Button>
                        <Button data-testid="do-not-count"
                            color="orange"
                            loading={busy}
                            onClick={() => { setOpen(false); onSubmit(true, reason); }}
                        >
                            {t("Do not count")}
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </>
    );
}

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
/**
 * What one evaluation left behind: its result document and its log.
 *
 * A manager sees every attachment whatever the activity's table says — the table
 * decides what reaches a participant, and the log was kept for whoever runs the
 * activity.
 */
const AttemptResult = ({ attempt, problemType }: { attempt: ManagedAttempt; problemType: string }) => {
    const { t } = useTranslation();
    const Result = resultRenderers.resolve(problemType).value;
    const { document } = useResultDocument(attempt.files, SUBMISSION_DETAILS);
    const { text: log } = useAttachment(attempt.files, SUBMISSION_LOG);

    if (document === undefined && log === undefined) return null;
    return (
        <Card withBorder radius="sm">
            <Group justify="space-between" mb="sm">
                <Title order={5}>{t("Result of attempt")} {attempt.attempt}</Title>
                <Text size="sm" c="dimmed">{attempt.runnerName}</Text>
            </Group>
            {document !== undefined && <Result detail={document} />}
            {log && (
                <Stack gap={4} mt="sm">
                    <Text size="xs" c="dimmed">{t("Evaluation log")}</Text>
                    <Code block style={{ whiteSpace: "pre-wrap" }}>{log}</Code>
                </Stack>
            )}
        </Card>
    );
};

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
        const text = file ? await api.fileApi.getText(file.fileId) : "";

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
                        {submission.excluded && (
                            <Tooltip
                                label={[
                                    submission.exclusionReason,
                                    submission.excludedBy && t("Ruled by {{who}}", { who: submission.excludedBy }),
                                ].filter(Boolean).join(" · ") || t("Not counted in the ranking")}
                            >
                                <Badge variant="light" color="orange">
                                    {t("Not counted")}
                                </Badge>
                            </Tooltip>
                        )}
                    </Group>
                    <Text size="sm" c="dimmed">
                        {submission.userName} · {submission.activitySlug} · {submission.seriesName} ·{" "}
                        <ActivityTime value={submission.submittedAt} timeZone="Europe/Warsaw" />
                    </Text>
                    <SubmissionOrigin submission={submission} />
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
                    {/* Through the page's own `run`, which catches. A handler
                        with its own try/catch-less copy is how the participants
                        panel swallowed every failure it had. */}
                    <ExclusionModal
                        submission={submission}
                        busy={busy}
                        onSubmit={(excluded, reason) => run(() => call(api =>
                            api.managerApi.setSubmissionExcluded(submission.id, excluded, reason)))}
                    />
                    <Button
                        leftSection={<IconRefresh size={16} />}
                        loading={busy}
                        onClick={() => run(() => call(api => api.managerApi.rejudgeSubmission(submission.id)))}
                    >
                        {t("Rejudge")}
                    </Button>
                    <Button data-testid="back" variant="default" leftSection={<IconArrowLeft size={16} />} onClick={() => navigate("/manager/submissions")}>
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

            {/* One card per attempt, each fetching its own attachments. A
                component rather than a loop of hooks: an attempt's files are
                read with a hook, and a hook cannot be called from inside a map. */}
            {submission.attemptList.map(attempt => (
                <AttemptResult
                    key={`${attempt.id}-result`}
                    attempt={attempt}
                    problemType={submission.problemType}
                />
            ))}

            <Card withBorder radius="sm" p={0}>
                <Group justify="space-between" p="sm">
                    <Title order={5}>{file?.name ?? t("Source")}</Title>
                    <Text size="xs" c="dimmed" ff="monospace">
                        {file ? `sha256 ${file.sha256.slice(0, 16)}…` : ""}
                    </Text>
                </Group>
                <Suspense fallback={<Center my="xl"><Loader /></Center>}>
                    <CodeEditor
                        value={source}
                        language={languageOf(submission.props)}
                        problemType={typeOf(submission.props)}
                        readOnly
                        height={420}
                    />
                </Suspense>
            </Card>
        </Stack>
    );
}
