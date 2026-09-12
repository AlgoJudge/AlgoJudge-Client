import { Alert, Button, Center, Group, Loader, Modal, Stack, Tabs, Text, Title } from "@mantine/core";
import { IconCopy, IconDownload, IconEdit, IconPrinter, IconSend } from "@tabler/icons-react";
import { lazy, Suspense, useState } from "react";
import { useTranslation } from "react-i18next";
import { Activity, SubmissionDetail, SubmissionSummary } from "../../api/ParticipantApi";
import { useApiCall, useApiEffect } from "../../provider/apiContext";
import { sha256 } from "../../utils/sha256";
import LoadState from "../LoadState";
import { CopyButton, DownloadButton } from "../buttons";
import { pastedFileName } from "../editor/languages";
import { languageOf } from "./offered";

const CodeEditor = lazy(() => import("../editor/CodeEditor"));

export interface SourceViewProps {
    activity: Activity;
    submission: SubmissionDetail;
    /**
     * What follows a resubmission. The submission screen goes to the one that
     * was created; the panel's modal shows it without leaving the page — the
     * same split `SubmissionForm.onSent` already makes.
     */
    onResubmitted: (submission: SubmissionSummary) => void;
}

/**
 * The source of one submission, and a way to send a corrected one.
 *
 * **Always in a modal**, since 2026-09-10: it was a screen of its own, which
 * meant reading your own code cost the page you were reading it against. Lifted
 * out of that screen so the host decides where it sits and what a resubmission
 * leads to.
 *
 * Editing here never rewrites history — the original stays as it was judged —
 * and the view says so where somebody can read it.
 */
export default function SourceView({ activity, submission, onResubmitted }: SourceViewProps) {
    const { t } = useTranslation();
    const call = useApiCall();

    const [files, setFiles] = useState<Record<string, string>>({});
    const [active, setActive] = useState<string | null>(null);
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState("");
    const [error, setError] = useState<string | undefined>(undefined);
    const [sending, setSending] = useState(false);
    const [printing, setPrinting] = useState(false);
    const [printed, setPrinted] = useState(false);
    const [asking, setAsking] = useState(false);

    const loadError = useApiEffect(async (api) => {
        // Read from the file store by id, as every other stored document is.
        // Keyed by the uploaded name, which is what the tabs show.
        const loaded: Record<string, string> = {};
        for (const file of submission.files) {
            loaded[file.fileName] = await api.fileApi.getText(file.fileId);
        }
        setFiles(loaded);
        setActive(submission.files[0]?.fileName ?? null);
    }, [submission.id, submission.files]);

    // **Loaded, and there is nothing to show.** The Server sends only the files
    // this reader may see, and an activity whose attachment table says nothing
    // about `source` withholds it from the submission's own author — so `files`
    // arrives empty and no request for one is ever issued. Without this a
    // spinner turned for ever, which reads as "still loading" and never stops
    // being wrong.
    if (submission.files.length === 0) {
        return (
            <Alert color="gray" title={t("The source code is not available")}>
                {t("This submission's files are not shared with you. Whoever runs the activity decides which of them a participant may read.")}
            </Alert>
        );
    }

    if (!active) {
        return <LoadState error={loadError} loading={!loadError} />;
    }

    const current = files[active] ?? "";
    const language = languageOf(submission.props);
    const shown = editing ? draft : current;

    const startEditing = () => {
        setDraft(current);
        setEditing(true);
    };

    const print = async () => {
        setPrinting(true);
        setError(undefined);
        try {
            const checksum = await sha256(new TextEncoder().encode(shown));
            await call(api => api.participantApi.requestPrintout(activity.id, {
                code: shown,
                fileName: active,
                sha256: checksum,
                submissionId: submission.id,
            }));
            setPrinted(true);
            setAsking(false);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setPrinting(false);
        }
    };

    const resubmit = async () => {
        setSending(true);
        setError(undefined);
        try {
            // Over exactly the bytes being sent, as the submit form does. The
            // Server reads the declared checksum before the bytes and refuses a
            // submission that arrives without one — which is what this button
            // did until 2026-09-08.
            const checksum = await sha256(new TextEncoder().encode(draft));
            const created = await call(api => api.participantApi.submit(activity.id, submission.problemSlug, {
                // The same declaration the original carried, so a
                // resubmission is judged as what it is rather than as whatever
                // a default would have made it.
                props: (submission.props ?? { type: submission.problemType }) as Record<string, unknown>,
                code: draft,
                fileName: pastedFileName(submission.problemType, language),
                sha256: checksum,
            }));
            setSending(false);
            setEditing(false);
            onResubmitted(created);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
            setSending(false);
        }
    };

    return (
        <Stack gap="md">
            <Group justify="space-between" wrap="wrap">
                <Text size="sm" c="dimmed">[{submission.problemSlug}] {submission.problemName}</Text>
                <Group>
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
                    {/* **What is shown, not "the submission".** This view is
                        tabbed and a submission may be an archive, so a request
                        naming the submission would print something other than
                        the page being read — and while editing, the draft is
                        exactly what somebody wants on paper. The id travels for
                        provenance and the Server checks it is the caller's own. */}
                    {activity.modules.printouts && (
                        <Button
                            data-testid="print"
                            variant="light"
                            loading={printing}
                            onClick={() => setAsking(true)}
                            leftSection={<IconPrinter size={16} />}
                        >
                            {t("Print")}
                        </Button>
                    )}
                    {editing
                        ? (
                            <Button data-testid="resubmit" loading={sending} onClick={resubmit} leftSection={<IconSend size={16} />}>
                                {t("Send as a new submission")}
                            </Button>
                        )
                        : (
                            <Button data-testid="edit" variant="light" onClick={startEditing} leftSection={<IconEdit size={16} />}>
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
            {/* Said here rather than by a notification: the paper arrives later
                and from somebody else, so the one thing to confirm is that the
                asking worked. */}
            {printed && (
                <Alert color="green" data-testid="printed" withCloseButton onClose={() => setPrinted(false)}>
                    {t("Sent to print. Somebody at a printer will bring it.")}
                </Alert>
            )}

            {/* Asked before it is sent. Paper is somebody else's time and a
                printer somebody else's queue. */}
            <Modal
                opened={asking}
                onClose={() => setAsking(false)}
                title={<Title order={4}>{t("Send this to print?")}</Title>}
                centered
            >
                <Stack gap="md">
                    <Text size="sm">
                        {t("Somebody at a printer will print it and bring you the paper.")}
                    </Text>
                    <Text size="sm" c="dimmed" ff="monospace">{active}</Text>
                    <Group justify="flex-end">
                        <Button variant="default" onClick={() => setAsking(false)} disabled={printing}>
                            {t("Not yet")}
                        </Button>
                        <Button
                            data-testid="print-confirm"
                            loading={printing}
                            onClick={print}
                            leftSection={<IconPrinter size={16} />}
                        >
                            {t("Send to print")}
                        </Button>
                    </Group>
                </Stack>
            </Modal>

            {submission.files.length > 1 ? (
                <Tabs value={active} onChange={value => { setActive(value); setEditing(false); }}>
                    <Tabs.List>
                        {submission.files.map(f => (
                            <Tabs.Tab key={f.fileName} value={f.fileName}>{f.fileName}</Tabs.Tab>
                        ))}
                    </Tabs.List>
                </Tabs>
            ) : (
                <Text size="sm" c="dimmed">{active}</Text>
            )}

            <Suspense fallback={<Center h={420}><Loader /></Center>}>
                <CodeEditor
                    value={shown}
                    onChange={setDraft}
                    language={language}
                    problemType={submission.problemType}
                    readOnly={!editing}
                    height={420}
                />
            </Suspense>
        </Stack>
    );
}
