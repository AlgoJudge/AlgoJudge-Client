import {
    Alert, Badge, Button, Card, Group, Pagination, Stack, Table, Text, Textarea, TextInput, Title,
} from "@mantine/core";
import { IconPrinter } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { Activity, Printout, PrintoutState } from "../../../../api/ParticipantApi";
import LoadState from "../../../../components/LoadState";
import DataTable from "../../../../components/table/DataTable";
import ActivityTime from "../../../../components/time/ActivityTime";
import { useApiCall, useApiEffect } from "../../../../provider/apiContext";
import { sha256 } from "../../../../utils/sha256";

const PAGE_SIZE = 10;

const STATE_COLOUR: Record<PrintoutState, string> = {
    requested: "blue",
    printed: "green",
    discarded: "gray",
};

/**
 * Asking for a page of source on paper, and what has been asked for so far.
 *
 * **Any text, not only a submission's.** Somebody debugging on paper wants the
 * fragment they are stuck on, not the last thing they sent — so this is a box
 * rather than a picker. The Print button in the source view sends through the
 * same call, with the submission named for provenance.
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

    const [fileName, setFileName] = useState("");
    const [title, setTitle] = useState("");
    const [code, setCode] = useState("");
    const [busy, setBusy] = useState(false);
    const [failed, setFailed] = useState<string | undefined>(undefined);

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

    const send = async () => {
        setBusy(true);
        setFailed(undefined);
        try {
            // Over the bytes actually being sent, which is what the Server
            // recomputes. Computed here and not in the transport, so the two
            // cannot come to disagree about what was measured.
            const digest = await sha256(new TextEncoder().encode(code));
            await call(api => api.participantApi.requestPrintout(activity.id, {
                code,
                fileName: fileName.trim(),
                sha256: digest,
                title: title.trim() || undefined,
            }));
            setCode("");
            setTitle("");
            setFileName("");
            setPage(1);
            setReload(n => n + 1);
        } catch (e) {
            setFailed(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    };

    const ready = fileName.trim().length > 0 && code.length > 0 && !busy;

    return (
        <Stack gap="md">
            <Title>{t("Printouts")}</Title>

            <Card withBorder radius="sm">
                <Stack gap="sm">
                    <Text size="sm" c="dimmed">
                        {t("Somebody at a printer collects these and brings the paper to you.")}
                    </Text>
                    <Group grow align="flex-start">
                        <TextInput
                            label={t("File name")}
                            placeholder="main.cpp"
                            data-testid="printout-file-name"
                            value={fileName}
                            onChange={e => setFileName(e.currentTarget.value)}
                            disabled={busy}
                            required
                        />
                        <TextInput
                            label={t("Note")}
                            description={t("Optional. Printed at the top of the page.")}
                            data-testid="printout-title"
                            value={title}
                            onChange={e => setTitle(e.currentTarget.value)}
                            disabled={busy}
                        />
                    </Group>
                    <Textarea
                        label={t("Source")}
                        data-testid="printout-source"
                        autosize
                        minRows={8}
                        maxRows={20}
                        value={code}
                        onChange={e => setCode(e.currentTarget.value)}
                        disabled={busy}
                        required
                    />
                    {failed && <Alert color="red" withCloseButton onClose={() => setFailed(undefined)}>{failed}</Alert>}
                    <Group justify="flex-end">
                        <Button
                            data-testid="printout-send"
                            leftSection={<IconPrinter size={16} />}
                            onClick={send}
                            loading={busy}
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
                            <Table.Th>{t("Note")}</Table.Th>
                            <Table.Th>{t("Asked for")}</Table.Th>
                            <Table.Th>{t("State")}</Table.Th>
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody data-testid="printouts-mine">
                        {items.map(printout => (
                            <Table.Tr key={printout.id}>
                                <Table.Td><Text ff="monospace" size="sm">{printout.fileName}</Text></Table.Td>
                                <Table.Td><Text size="sm">{printout.title ?? "—"}</Text></Table.Td>
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
        </Stack>
    );
}
