import { Accordion, Alert, Button, Card, Code, Grid, Group, Loader, Stack, Text, Title } from "@mantine/core";
import { IconCircleMinus, IconClockPlay, IconFileText, IconTerminal2 } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Activity, SubmissionDetail } from "../../../../../api/ParticipantApi";
import ActivityTime from "../../../../../components/time/ActivityTime";
import { useApiEffect } from "../../../../../provider/apiContext";
import LoadState from "../../../../../components/LoadState";
import { resultRenderers } from "../../../../../renderers";
import StateBadge from "../../../../../components/submission/StateBadge";
import { useAttachment, useResultDocument } from "../../../../../components/submission/useAttachment";
import { SUBMISSION_DETAILS, SUBMISSION_LOG } from "../../../../../api/ParticipantApi";
import { languageText } from "../../../../../components/submission/offered";

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <Text>
        <Text component="span" fw={700}>{label}: </Text>
        {children}
    </Text>
);

export default function SubmissionPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { activityId, submissionId } = useParams();

    const [activity, setActivity] = useState<Activity | undefined>(undefined);
    const [submission, setSubmission] = useState<SubmissionDetail | undefined>(undefined);

    const error = useApiEffect(async (api) => {
        if (!activityId || !submissionId) return;
        const activity = await api.participantApi.getActivity(activityId);
        setActivity(activity);
        setSubmission(await api.participantApi.getSubmission(activity.id, submissionId));

        api.participantApi.eventDispatcher.addEventListener("submissionStateChanged", async evt => {
            if (evt.data.submission.id !== submissionId) return;
            // The summary in the event is not the detail, and the per-test
            // document only exists once the job finishes — so refetch rather
            // than patch a partial view over a finished one.
            setSubmission(await api.participantApi.getSubmission(activity.id, submissionId));
        });
    }, [activityId, submissionId]);

    // The newest attempt's attachments. Above the early return, because a hook
    // cannot be called conditionally — and `undefined` files fetch nothing.
    const latest = submission?.attempts[0]?.files;
    const { document: details } = useResultDocument(latest, SUBMISSION_DETAILS);
    const { text: log } = useAttachment(latest, SUBMISSION_LOG);

    if (!activity || !submission) {
        return <LoadState error={error} loading={!error} />;
    }

    const pending = submission.state === "queued" || submission.state === "running";
    const Result = resultRenderers.resolve(submission.problemType).value;

    return (
        <Stack gap="md">
            <Group justify="space-between">
                <Button data-testid="back" variant="default" onClick={() => navigate(-1)}>{t("Back")}</Button>
                <Group>
                    <Button
                        variant="light"
                        component={Link}
                        to={`/activities/${activity.slug}/problems/${submission.problemSlug}`}
                        leftSection={<IconFileText size={16} />}
                    >
                        {t("Problem")}
                    </Button>
                    {/* Offered only when there is something behind it. The
                        activity's attachment table decides whether an author may
                        read their own source, and a button onto an empty screen
                        is a promise this page cannot keep. */}
                    {submission.files.length > 0 && (
                        <Button
                            component={Link}
                            to={`/activities/${activity.slug}/submissions/${submission.id}/code`}
                            leftSection={<IconTerminal2 size={16} />}
                        >
                            {t("Source code")}
                        </Button>
                    )}
                </Group>
            </Group>

            <Grid>
                <Grid.Col span={{ base: 12, sm: 6 }}>
                    <Stack gap={2}>
                        <Title order={2}>{t("Submission")}</Title>
                        <Title>[{submission.problemSlug}] {submission.problemName}</Title>
                    </Stack>
                </Grid.Col>
                <Grid.Col span={{ base: 12, sm: 6 }}>
                    <Stack gap={4}>
                        <Field label={t("Author")}>{submission.authorName}</Field>
                        <Field label={t("Submission date")}>
                            <ActivityTime value={submission.submittedAt} timeZone={activity.timeZone} />
                        </Field>
                        <Field label={t("Language")}>{languageText(submission.props)}</Field>
                        <Field label={t("ID")}><Code>{submission.id}</Code></Field>
                        <Field label={t("Result")}>
                            {submission.score === undefined ? "—" : `${submission.score} / ${submission.maxScore ?? "?"}`}
                        </Field>
                        <Group gap="xs">
                            <Text fw={700}>{t("Status")}:</Text>
                            <StateBadge state={submission.state} verdict={submission.verdict} score={submission.score} maxScore={submission.maxScore} />
                        </Group>
                        {/* Said outright, because the result above stays what it
                            was: judged, a verdict, a score, and no points on the
                            board. Without this that reads as a fault. */}
                        {submission.excluded && (
                            <Alert
                                color="orange"
                                icon={<IconCircleMinus size={18} />}
                            >
                                {t("This submission is not counted in the ranking. It still counts against your submission limit.")}
                            </Alert>
                        )}
                    </Stack>
                </Grid.Col>
            </Grid>

            {/* A submission is visible long before it has a verdict, so the
                waiting state is a state of this screen, not an empty table. */}
            {pending ? (
                <Alert color="blue" icon={<IconClockPlay size={18} />} title={t(submission.state)}>
                    <Group gap="sm">
                        <Loader size="sm" />
                        <Text size="sm">
                            {submission.state === "queued"
                                ? t("Waiting for a runner to pick this up")
                                : t("A runner is evaluating this submission")}
                        </Text>
                    </Group>
                </Alert>
            ) : (
                <Result detail={details} />
            )}

            {submission.attempts.length > 1 && (
                <Card withBorder radius="sm" p="xs">
                    <Accordion variant="contained">
                        <Accordion.Item value="attempts">
                            <Accordion.Control>
                                {t("Evaluation attempts")} ({submission.attempts.length})
                            </Accordion.Control>
                            <Accordion.Panel>
                                <Stack gap="xs">
                                    {submission.attempts.map(attempt => (
                                        <Group key={attempt.id} justify="space-between">
                                            <Text size="sm">#{attempt.attempt}</Text>
                                            <ActivityTime value={attempt.startedAt} timeZone={activity.timeZone} size="sm" />
                                            <StateBadge state={attempt.state} verdict={attempt.verdict} score={attempt.score} maxScore={submission.maxScore} />
                                            <Text size="sm">{attempt.score ?? "—"}</Text>
                                        </Group>
                                    ))}
                                </Stack>
                            </Accordion.Panel>
                        </Accordion.Item>
                    </Accordion>
                </Card>
            )}

            {/* Here only when the activity lets a participant read it. The
                Server sends the attachment or does not; there is nothing here to
                decide, and nothing to say when it is absent. */}
            {log && (
                <Card withBorder radius="sm">
                    <Title order={4} mb="xs">{t("Evaluation log")}</Title>
                    <Code block style={{ whiteSpace: "pre-wrap" }}>{log}</Code>
                </Card>
            )}
        </Stack>
    );
}
