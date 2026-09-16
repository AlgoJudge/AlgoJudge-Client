import { Accordion, Alert, Button, Card, Code, Grid, Group, Loader, Stack, Text, Title } from "@mantine/core";
import { IconCircleMinus, IconClockPlay, IconTerminal2 } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
    Activity, SubmissionDetail, SUBMISSION_DETAILS, SUBMISSION_LOG,
} from "../../api/ParticipantApi";
import { useApiEffect } from "../../provider/apiContext";
import { resultRenderers } from "../../renderers";
import LoadState from "../LoadState";
import Elapsed from "../time/Elapsed";
import ActivityTime from "../time/ActivityTime";
import { languageText } from "./offered";
import StateBadge from "./StateBadge";
import { useAttachment, useResultDocument } from "./useAttachment";

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <Text>
        <Text component="span" fw={700}>{label}: </Text>
        {children}
    </Text>
);

export interface SubmissionViewProps {
    activity: Activity;
    submissionId: string;
    /**
     * Offered as a button when given, and only when there is something behind
     * it. The submission is handed over so the host does not fetch it twice —
     * the source view needs the same document this one is drawn from.
     */
    onShowCode?: (submission: SubmissionDetail) => void;
    /**
     * The host's own controls, drawn beside the source button. The screen puts a
     * link to the statement here; the modal puts nothing, because the statement
     * is what it is being read over.
     */
    actions?: (submission: SubmissionDetail) => React.ReactNode;
    /**
     * Whether to say what this is. The screen does, because nothing else on it
     * does; the modal does not, because its own title already says `Zgłoszenie`
     * two lines above and saying it twice reads as two things.
     */
    heading?: boolean;
}

/**
 * One submission, wherever it is being read.
 *
 * Lifted out of the submission screen so the panel's modal can show the same
 * thing without a second implementation of the parts worth having once: the
 * waiting state, the type-resolved result document, the attempt history, and the
 * subscription that turns `queued` into a verdict while somebody watches.
 *
 * **It fetches by id and subscribes; it does not read the route.** That is what
 * makes it usable from a modal, where there is no route to read — the host says
 * which submission, and what a button does next.
 */
export default function SubmissionView({
    activity, submissionId, onShowCode, actions, heading = true,
}: SubmissionViewProps) {
    const { t } = useTranslation();
    const [submission, setSubmission] = useState<SubmissionDetail | undefined>(undefined);

    const error = useApiEffect(async (api) => {
        setSubmission(await api.participantApi.getSubmission(activity.id, submissionId));

        api.participantApi.eventDispatcher.addEventListener("submissionStateChanged", async evt => {
            if (evt.data.submission.id !== submissionId) return;
            // The summary in the event is not the detail, and the per-test
            // document only exists once the job finishes — so refetch rather
            // than patch a partial view over a finished one.
            setSubmission(await api.participantApi.getSubmission(activity.id, submissionId));
        });
    }, [activity.id, submissionId]);

    // The newest attempt's attachments. Above the early return, because a hook
    // cannot be called conditionally — and `undefined` files fetch nothing.
    const latest = submission?.attempts[0]?.files;
    const { document: details } = useResultDocument(latest, SUBMISSION_DETAILS);
    const { text: log } = useAttachment(latest, SUBMISSION_LOG);

    if (!submission) {
        return <LoadState error={error} loading={!error} />;
    }

    const pending = submission.state === "queued" || submission.state === "running";
    // The newest attempt's `startedAt`, which the Server projects as
    // `ClaimedAt ?? CreatedAt` — so while a job is running it is the instant a
    // Runner took it, not the instant it joined the queue.
    const startedAt = submission.attempts[0]?.startedAt;
    // **Grey while it only waits, blue once a runner has it.** The badge a few
    // lines above already says grey for `queued` — `StateBadge` and both of the
    // manager's colour maps agree — and a box in the active colour over "waiting
    // for a runner" contradicted its own sentence.
    const waiting = submission.state === "queued";
    const Result = resultRenderers.resolve(submission.problemType).value;

    return (
        <Stack gap="md" data-testid="submission-view">
            <Grid>
                <Grid.Col span={{ base: 12, sm: 6 }}>
                    <Stack gap={2}>
                        {heading && <Title order={2}>{t("Submission")}</Title>}
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
                        {/* Offered only when there is something behind it. The
                            activity's attachment table decides whether an author
                            may read their own source, and a button onto an empty
                            view is a promise this cannot keep. */}
                        <Group mt="xs">
                            {actions?.(submission)}
                            {onShowCode && submission.files.length > 0 && (
                                <Button
                                    data-testid="show-code"
                                    onClick={() => onShowCode(submission)}
                                    leftSection={<IconTerminal2 size={16} />}
                                >
                                    {t("Source code")}
                                </Button>
                            )}
                        </Group>
                    </Stack>
                </Grid.Col>
            </Grid>

            {/* A submission is visible long before it has a verdict, so the
                waiting state is a state of this view, not an empty table. */}
            {pending ? (
                <Alert
                    /* Replaces the theme's generic `alert` on this one element,
                       so a check reads this box rather than whichever Alert
                       happens to come first — the exclusion notice above is one
                       too. */
                    data-testid="pending"
                    color={waiting ? "gray" : "blue"}
                    icon={<IconClockPlay size={18} />}
                    title={t(submission.state)}
                >
                    <Group gap="sm">
                        <Loader size="sm" color={waiting ? "gray" : "blue"} />
                        <Text size="sm">
                            {submission.state === "queued"
                                ? t("Waiting for a runner to pick this up")
                                : t("A runner is evaluating this submission")}
                        </Text>
                        {/* **Only while a runner actually has it.** A queued
                            submission has nobody working on it, so there is
                            nothing to count and a number there would suggest
                            otherwise.

                            It says how long, and nothing else: a box that never
                            changes reads, after twenty seconds, exactly like a
                            page that has quietly broken. How many tests have
                            passed stays private — this is elapsed time and no
                            more. */}
                        {submission.state === "running" && startedAt && (
                            <Text size="sm" c="dimmed" data-testid="judging-for">
                                {t("Running for")} <Elapsed since={startedAt} fw={600} />
                            </Text>
                        )}
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
