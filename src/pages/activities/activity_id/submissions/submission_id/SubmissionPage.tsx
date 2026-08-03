import { Accordion, Alert, Button, Card, Code, Grid, Group, Loader, Stack, Text, Title } from "@mantine/core";
import { IconClockPlay, IconFileText, IconTerminal2 } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Activity, SubmissionDetail } from "../../../../../api/ParticipantApi";
import ActivityTime from "../../../../../components/time/ActivityTime";
import { useApiEffect } from "../../../../../provider/ApiProvider";
import LoadState from "../../../../../components/LoadState";
import { resultRenderers } from "../../../../../renderers";
import StateBadge from "../../../../../components/submission/StateBadge";

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

    if (!activity || !submission) {
        return <LoadState error={error} loading={!error} />;
    }

    const pending = submission.state === "queued" || submission.state === "running";
    const Result = resultRenderers.resolve(submission.problemType).value;

    return (
        <Stack gap="md">
            <Group justify="space-between">
                <Button variant="default" onClick={() => navigate(-1)}>{t("Back")}</Button>
                <Group>
                    <Button
                        variant="light"
                        component={Link}
                        to={`/activities/${activity.slug}/problems/${submission.problemSlug}`}
                        leftSection={<IconFileText size={16} />}
                    >
                        {t("Problem")}
                    </Button>
                    <Button
                        component={Link}
                        to={`/activities/${activity.slug}/submissions/${submission.id}/code`}
                        leftSection={<IconTerminal2 size={16} />}
                    >
                        {t("Source code")}
                    </Button>
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
                        <Field label={t("Language")}>{submission.language ?? "—"}</Field>
                        <Field label={t("ID")}><Code>{submission.id}</Code></Field>
                        <Field label={t("Result")}>
                            {submission.score === undefined ? "—" : `${submission.score} / ${submission.maxScore ?? "?"}`}
                        </Field>
                        <Group gap="xs">
                            <Text fw={700}>{t("Status")}:</Text>
                            <StateBadge state={submission.state} verdict={submission.verdict} score={submission.score} maxScore={submission.maxScore} />
                        </Group>
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
                <Result detail={submission.detail} />
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

            {/* Present only when the activity's log visibility permits it. */}
            {submission.log && (
                <Card withBorder radius="sm">
                    <Title order={4} mb="xs">{t("Evaluation log")}</Title>
                    <Code block style={{ whiteSpace: "pre-wrap" }}>{submission.log}</Code>
                </Card>
            )}
        </Stack>
    );
}
