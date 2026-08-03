import { Alert, Button, Center, Group, Loader, Stack, Tabs, Text, Title } from "@mantine/core";
import { IconCopy, IconDownload, IconEdit, IconSend } from "@tabler/icons-react";
import { lazy, Suspense, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { Activity, SubmissionDetail } from "../../../../../../api/ParticipantApi";
import { CopyButton, DownloadButton } from "../../../../../../components/buttons";
import { useApiCall, useApiEffect } from "../../../../../../provider/ApiProvider";

const CodeEditor = lazy(() => import("../../../../../../components/editor/CodeEditor"));

export default function CodePage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const call = useApiCall();
    const { activityId, submissionId } = useParams();

    const [activity, setActivity] = useState<Activity | undefined>(undefined);
    const [submission, setSubmission] = useState<SubmissionDetail | undefined>(undefined);
    const [files, setFiles] = useState<Record<string, string>>({});
    const [active, setActive] = useState<string | null>(null);
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState("");
    const [error, setError] = useState<string | undefined>(undefined);
    const [sending, setSending] = useState(false);

    useApiEffect(async (api) => {
        if (!activityId || !submissionId) return;
        const activity = await api.participantApi.getActivity(activityId);
        setActivity(activity);
        const submission = await api.participantApi.getSubmission(activity.id, submissionId);
        setSubmission(submission);

        const loaded: Record<string, string> = {};
        for (const file of submission.files) {
            loaded[file.name] = await api.participantApi.getSubmissionFile(activity.id, submission.id, file.name);
        }
        setFiles(loaded);
        setActive(submission.files[0]?.name ?? null);
    }, [activityId, submissionId]);

    if (!activity || !submission || !active) {
        return <Center my="xl"><Loader size="xl" /></Center>;
    }

    const current = files[active] ?? "";
    const language = submission.files.find(f => f.name === active)?.language ?? submission.language;
    const shown = editing ? draft : current;

    const startEditing = () => {
        setDraft(current);
        setEditing(true);
    };

    const resubmit = async () => {
        setSending(true);
        setError(undefined);
        try {
            const created = await call(api => api.participantApi.submit(activity.id, submission.problemSlug, {
                language: submission.language,
                code: draft,
            }));
            navigate(`/activities/${activity.slug}/submissions/${created.id}`);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
            setSending(false);
        }
    };

    return (
        <Stack gap="md">
            <Group justify="space-between" wrap="wrap">
                <Stack gap={2}>
                    <Title order={2}>{t("Source code")}</Title>
                    <Title>[{submission.problemSlug}] {submission.problemName}</Title>
                </Stack>
                <Group>
                    <Button variant="default" onClick={() => navigate(-1)}>{t("Back")}</Button>
                    {/* CopyButton and DownloadButton already render the button —
                        the callback supplies its label. Returning another Button
                        here nested one inside the other. */}
                    <CopyButton value={shown}>
                        {() => (
                            <Group gap={6} wrap="nowrap">
                                <IconCopy size={16} />
                                {t("Copy")}
                            </Group>
                        )}
                    </CopyButton>
                    <DownloadButton file={new Blob([shown], { type: "text/plain" })} filename={active}>
                        {() => (
                            <Group gap={6} wrap="nowrap">
                                <IconDownload size={16} />
                                {t("Download")}
                            </Group>
                        )}
                    </DownloadButton>
                    {editing
                        ? (
                            <Button loading={sending} onClick={resubmit} leftSection={<IconSend size={16} />}>
                                {t("Send as a new submission")}
                            </Button>
                        )
                        : (
                            <Button variant="light" onClick={startEditing} leftSection={<IconEdit size={16} />}>
                                {t("Edit and resubmit")}
                            </Button>
                        )}
                </Group>
            </Group>

            {editing && (
                <Alert color="blue">
                    {/* Editing here never rewrites history: the original stays as
                        it was judged, and sending creates a new submission. */}
                    {t("Sending creates a new submission; this one is left untouched.")}
                </Alert>
            )}
            {error && <Alert color="red">{error}</Alert>}

            {submission.files.length > 1 ? (
                <Tabs value={active} onChange={value => { setActive(value); setEditing(false); }}>
                    <Tabs.List>
                        {submission.files.map(f => (
                            <Tabs.Tab key={f.name} value={f.name}>{f.name}</Tabs.Tab>
                        ))}
                    </Tabs.List>
                </Tabs>
            ) : (
                <Text size="sm" c="dimmed">{active}</Text>
            )}

            <Suspense fallback={<Center h={520}><Loader /></Center>}>
                <CodeEditor
                    value={shown}
                    onChange={setDraft}
                    language={language}
                    readOnly={!editing}
                    height={520}
                />
            </Suspense>
        </Stack>
    );
}
