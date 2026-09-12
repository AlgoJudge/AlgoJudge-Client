import {
    Alert, Badge, Button, Card, Center, FileInput, Group, Loader, Modal, Pagination, Select,
    Stack, Table, Text, Title,
} from "@mantine/core";
import { IconPrinter, IconX } from "@tabler/icons-react";
import { lazy, Suspense, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { Activity, Printout, PrintoutState } from "../../../../api/ParticipantApi";
import LoadState from "../../../../components/LoadState";
import type { EditorLanguage } from "../../../../components/editor/editorLanguages";
import DataTable from "../../../../components/table/DataTable";
import ActivityTime from "../../../../components/time/ActivityTime";
import { useApiCall, useApiEffect } from "../../../../provider/apiContext";
import { sha256 } from "../../../../utils/sha256";

const CodeEditor = lazy(() => import("../../../../components/editor/CodeEditor"));

const PAGE_SIZE = 10;

const STATE_COLOUR: Record<PrintoutState, string> = {
    requested: "blue",
    printed: "green",
    discarded: "gray",
};

/**
 * Asking for a page of source on paper, and what has been asked for so far.
 *
 * **The submit form's shape, because it is the same act.** A file or the editor,
 * one locking the other, and no third way — somebody who already has the file
 * picks it, and somebody working from a fragment types it.
 *
 * **Any text, not only a submission's.** Somebody debugging on paper wants the
 * part they are stuck on, not the last thing they sent.
 *
 * The list is the reader's own and no wider: every enrolled participant holds
 * the key, so an activity-wide list would be everybody's file names.
 */
export default function PrintoutsPage() {
    const { t } = useTranslation();
    const { activityId } = useParams();
    const call = useApiCall();

    const [activity, setActivity] = useState<Activity | undefined>(undefined);
    const [items, setItems] = useState<Printout[] | undefined>(undefined);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [reload, setReload] = useState(0);

    const [file, setFile] = useState<File | null>(null);
    const [code, setCode] = useState("");
    const [language, setLanguage] = useState<string | null>(null);
    const [languages, setLanguages] = useState<EditorLanguage[]>([]);
    const [confirming, setConfirming] = useState(false);
    const [busy, setBusy] = useState(false);
    const [failed, setFailed] = useState<string | undefined>(undefined);

    // **Asked of Monaco, and imported the way the editor is.** A static import
    // would pull the editor into this page's first bundle, which is the cost
    // `CodeEditor` is lazy to avoid.
    useEffect(() => {
        let live = true;
        void import("../../../../components/editor/editorLanguages")
            .then(module => { if (live) setLanguages(module.editorLanguages()); });
        return () => { live = false; };
    }, []);

    const error = useApiEffect(async (api) => {
        if (!activityId) return;
        const found = await api.participantApi.getActivity(activityId);
        setActivity(found);

        setItems(undefined);
        const result = await api.participantApi.getPrintouts(found.id, { page, pageSize: PAGE_SIZE });
        setItems(result.items);
        setTotal(result.total);
    }, [activityId, page, reload]);

    if (!activity) return <LoadState error={error} loading={!error} />;

    // One or the other, as the submit form has it: a file locks the editor and
    // an editor with anything in it locks the file field.
    const codeLocked = file !== null;
    const fileLocked = code.trim().length > 0;

    // **The name comes from the file, or from the language.** There is no field
    // for it: a picked file has a name already, and a typed fragment gets the
    // extension of the language it says it is — the rule `pastedFileName`
    // records, and the reason the language select is here at all.
    // A picked file has a name; a typed fragment takes the extension of the
    // language it says it is, and `.txt` when it says nothing.
    const extension = languages.find(l => l.id === language)?.extension ?? ".txt";
    const name = file ? file.name : `main${extension}`;

    const send = async () => {
        setBusy(true);
        setFailed(undefined);
        try {
            const text = file ? await file.text() : code;
            const digest = await sha256(new TextEncoder().encode(text));
            await call(api => api.participantApi.requestPrintout(activity.id, {
                code: text,
                fileName: name,
                sha256: digest,
            }));
            setCode("");
            setFile(null);
            setConfirming(false);
            setPage(1);
            setReload(n => n + 1);
        } catch (e) {
            setFailed(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    };

    const ready = (file !== null || code.trim().length > 0) && !busy;

    return (
        <Stack gap="md">
            <Title>{t("Printouts")}</Title>

            <Card withBorder radius="sm">
                <Stack gap="sm">
                    <Text size="sm" c="dimmed">
                        {t("Somebody at a printer collects these and brings the paper to you.")}
                    </Text>

                    <Group align="flex-start" grow wrap="wrap">
                        <Select
                            label={t("Programming language")}
                            description={t("Decides the name the page is printed under.")}
                            data-testid="printout-language"
                            data={languages.map(l => ({ value: l.id, label: l.label }))}
                            value={language}
                            onChange={setLanguage}
                            disabled={codeLocked}
                            clearable
                        />
                        <FileInput
                            label={t("File")}
                            description={fileLocked
                                ? t("Clear the editor to attach a file instead")
                                : t("Its own name is the one printed.")}
                            placeholder={t("Choose a file")}
                            data-testid="printout-file"
                            value={file}
                            onChange={setFile}
                            disabled={fileLocked}
                            clearable
                            rightSection={file && <IconX size={16} onClick={() => setFile(null)} style={{ cursor: "pointer" }} />}
                        />
                    </Group>

                    <Stack gap={4}>
                        <Text size="sm" fw={500}>{t("Source code")}</Text>
                        {codeLocked && (
                            <Text size="xs" c="dimmed">{t("A file is attached, so the editor is disabled")}</Text>
                        )}
                        <Suspense fallback={<Center h={420}><Loader /></Center>}>
                            <CodeEditor
                                value={code}
                                onChange={setCode}
                                language={language ?? undefined}
                                readOnly={codeLocked}
                            />
                        </Suspense>
                    </Stack>

                    {failed && <Alert color="red" withCloseButton onClose={() => setFailed(undefined)}>{failed}</Alert>}
                    <Group justify="flex-end">
                        <Button
                            data-testid="printout-send"
                            leftSection={<IconPrinter size={16} />}
                            onClick={() => setConfirming(true)}
                            disabled={!ready}
                        >
                            {t("Send to print")}
                        </Button>
                    </Group>
                </Stack>
            </Card>

            <Title order={4}>{t("What you have asked for")}</Title>

            {items?.length === 0 && (
                <Text c="dimmed" data-testid="printouts-empty">{t("Nothing yet.")}</Text>
            )}

            {items && items.length > 0 && (
                <DataTable minWidth={640} striped highlightOnHover>
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th>{t("File name")}</Table.Th>
                            <Table.Th>{t("Asked for")}</Table.Th>
                            <Table.Th>{t("State")}</Table.Th>
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody data-testid="printouts-mine">
                        {items.map(printout => (
                            <Table.Tr key={printout.id}>
                                <Table.Td><Text ff="monospace" size="sm">{printout.fileName}</Text></Table.Td>
                                <Table.Td>
                                    <ActivityTime timeZone={activity.timeZone} value={printout.requestedAt} />
                                </Table.Td>
                                <Table.Td>
                                    <Badge color={STATE_COLOUR[printout.state]} variant="light">
                                        {printout.state === "printed" ? t("Printed")
                                            : printout.state === "discarded" ? t("Discarded")
                                                : t("Waiting")}
                                    </Badge>
                                </Table.Td>
                            </Table.Tr>
                        ))}
                    </Table.Tbody>
                </DataTable>
            )}

            {total > PAGE_SIZE && (
                <Group justify="center">
                    <Pagination value={page} onChange={setPage} total={Math.ceil(total / PAGE_SIZE)} />
                </Group>
            )}

            {/* Asked before it is sent, not after. Paper is somebody else's time
                and a printer somebody else's queue, so a mis-click costs more
                than a keystroke. */}
            <Modal
                opened={confirming}
                onClose={() => setConfirming(false)}
                title={<Title order={4}>{t("Send this to print?")}</Title>}
                centered
            >
                <Stack gap="md">
                    <Text size="sm">
                        {t("Somebody at a printer will print it and bring you the paper.")}
                    </Text>
                    <Text size="sm" c="dimmed" ff="monospace">{name}</Text>
                    <Group justify="flex-end">
                        <Button variant="default" onClick={() => setConfirming(false)} disabled={busy}>
                            {t("Not yet")}
                        </Button>
                        <Button
                            data-testid="printout-confirm"
                            leftSection={<IconPrinter size={16} />}
                            onClick={send}
                            loading={busy}
                        >
                            {t("Send to print")}
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </Stack>
    );
}
