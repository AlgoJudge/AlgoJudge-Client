import {
    Alert, Badge, Button, Group, Modal, MultiSelect, Pagination, Select, Stack, Table, Text, Title,
} from "@mantine/core";
import { IconPrinter, IconTrash } from "@tabler/icons-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { listed, joined } from "../filterParams";
import { useSearchParams } from "react-router-dom";
import { ManagedPrintout, PrintoutActivity } from "../../../api/ManagerApi";
import { PrintoutState } from "../../../api/ParticipantApi";
import LoadState from "../../../components/LoadState";
import DataTable from "../../../components/table/DataTable";
import { useApiCall, useApiEffect } from "../../../provider/apiContext";
import { printoutSheetUrl } from "./printoutSheetUrl";
import ActivityTime from "../../../components/time/ActivityTime";

const PAGE_SIZE = 20;

const STATE_COLOR: Record<PrintoutState, string> = {
    requested: "blue",
    printing: "orange",
    printed: "green",
    discarded: "gray",
};

/**
 * The queue somebody at a printer works from.
 *
 * **The one screen that can be handed to a person who holds nothing else.** The
 * area's permission is `printout:manage` alone, so a grant carrying that key
 * opens this and refuses the rest of the panel.
 *
 * Oldest first, and not configurable: a queue is worked from the front, and
 * whoever has waited longest is the one to serve.
 */
export default function ManagerPrintoutsPage() {
    const { t } = useTranslation();
    const call = useApiCall();

    const [query, setQuery] = useSearchParams();
    const activityId = query.get("activity") ?? undefined;
    // Its identity has to survive a render, or the effect refetches forever.
    const states = useMemo(() => listed(query.get("state")) as PrintoutState[], [query]);
    const page = Number(query.get("page") ?? "1");

    const [items, setItems] = useState<ManagedPrintout[] | undefined>(undefined);
    const [total, setTotal] = useState(0);
    const [activities, setActivities] = useState<PrintoutActivity[]>([]);
    const [confirming, setConfirming] = useState<ManagedPrintout | undefined>(undefined);
    const [busy, setBusy] = useState(false);
    const [failed, setFailed] = useState<string | undefined>(undefined);
    const [reload, setReload] = useState(0);

    const set = (patch: Record<string, string | undefined>) => {
        const next = new URLSearchParams(query);
        for (const [key, value] of Object.entries(patch)) {
            if (value) next.set(key, value);
            else next.delete(key);
        }
        // A narrower result makes page 3 empty, which reads as "nothing here".
        if (!("page" in patch)) next.delete("page");
        setQuery(next, { replace: true });
    };

    const loadError = useApiEffect(async (api) => {
        // **From the printing key, not from the panel's activity summary.** That
        // one narrows on `activity:update`, so an operator would be handed an
        // empty filter with no error to notice.
        setActivities(await api.managerApi.getPrintoutActivities());

        // **The list stays on screen while the next one loads.** This reset ran
        // on every effect run, not only the first, so the guard below fired on
        // every refetch and took the whole screen down to a spinner — with the
        // filter row in it. A manager typed one letter, the field was unmounted
        // under their hands, and the next letter went nowhere.
        //
        // Deleting the reset is the whole fix: `items` is undefined only before
        // the first load has ever finished, which turns that guard into what it
        // was written to be. The precedent, and the argument, are in
        // `ParticipantsPanel` and in `MANAGER_PANEL.md`.
        const result = await api.managerApi.getPrintouts({
            page, pageSize: PAGE_SIZE, activityId, states,
        });
        setItems(result.items);
        setTotal(result.total);

        // Two people at one printer, each looking at a list that has not moved,
        // is how the same page gets printed twice.
        api.managerApi.eventDispatcher.addEventListener(
            "printoutChanged", () => setReload(n => n + 1));
    }, [activityId, states, page, reload]);

    if (!items && !loadError) return <LoadState error={undefined} loading />;

    /**
     * Open the sheet, then ask.
     *
     * The tab is opened **from the click** rather than after an await: a popup
     * blocker refuses a window opened later, and the operator would be left with
     * a confirm dialog and nothing to confirm.
     */
    const open = (printout: ManagedPrintout) => {
        // **The tab is opened from the click, before anything is awaited.** A
        // popup blocker refuses a window opened after a promise resolves, and
        // the operator would be left with a dialog and nothing to confirm.
        //
        // **No `noopener`, deliberately.** It severs the new tab from the
        // opener, and with it the copy of `sessionStorage` a same-origin tab
        // inherits — which is where a session lives when the Client is driven
        // against its own fake, so the sheet would open on the sign-in screen.
        // It buys nothing here: this is our own route on our own origin, and
        // `window.opener` reaching back is only a hazard for a page that is not.
        window.open(printoutSheetUrl(printout.id), "_blank");
        setConfirming(printout);

        // Then say so, so the other person working this queue can see the row is
        // somebody's. A failure here is not worth stopping the printing over —
        // the sheet is already open — so it only reloads the list.
        void call(api => api.managerApi.claimPrintout(printout.id))
            .then(() => setReload(n => n + 1))
            .catch(() => setReload(n => n + 1));
    };

    const release = async (printout: ManagedPrintout) => {
        setBusy(true);
        try {
            await call(api => api.managerApi.releasePrintout(printout.id));
            setReload(n => n + 1);
        } catch (e) {
            setFailed(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    };

    const resolve = async (outcome: "printed" | "discarded") => {
        if (!confirming) return;
        setBusy(true);
        setFailed(undefined);
        try {
            await call(api => api.managerApi.resolvePrintout(confirming.id, outcome));
            setConfirming(undefined);
            setReload(n => n + 1);
        } catch (e) {
            setFailed(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Stack gap="md">
            {/* The queue's own Refresh button stood here. It is the panel's
                now, above every screen, so a manager does not have to learn
                which lists happen to have one. */}
            <Title>{t("Printouts")}</Title>

            <Group wrap="wrap">
                <Select
                    w={240}
                    clearable
                    searchable
                    data-testid="printout-activity"
                    placeholder={t("Every activity")}
                    value={activityId ?? null}
                    onChange={value => set({ activity: value ?? undefined })}
                    data={activities.map(a => ({ value: a.id, label: a.name }))}
                />
                <MultiSelect
                    w={200}
                    clearable
                    data-testid="printout-state"
                    placeholder={states.length === 0 ? t("Every state") : undefined}
                    value={states}
                    onChange={value => set({ state: joined(value) })}
                    data={[
                        { value: "requested", label: t("Waiting") },
                        { value: "printing", label: t("At a printer") },
                        { value: "printed", label: t("Printed") },
                        { value: "discarded", label: t("Discarded") },
                    ]}
                />
            </Group>

            {loadError ? <LoadState error={loadError} loading={false} /> : null}

            {items?.length === 0 && (
                <Text c="dimmed" data-testid="printouts-empty">{t("Nothing is waiting.")}</Text>
            )}

            {items && items.length > 0 && (
                <DataTable minWidth={980} striped highlightOnHover>
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th>{t("Who")}</Table.Th>
                            <Table.Th>{t("Activity")}</Table.Th>
                            <Table.Th>{t("File name")}</Table.Th>
                            <Table.Th>{t("Asked for")}</Table.Th>
                            <Table.Th>{t("State")}</Table.Th>
                            <Table.Th />
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody data-testid="printout-queue">
                        {items.map(printout => (
                            <Table.Tr key={printout.id} data-printout={printout.id}>
                                <Table.Td>
                                    <Text fw={500} size="sm">{printout.requestedByName}</Text>
                                    {printout.groupName && (
                                        <Text size="xs" c="dimmed">{printout.groupName}</Text>
                                    )}
                                </Table.Td>
                                <Table.Td>
                                    <Text size="sm">{printout.activityName}</Text>
                                    {/* One person works several rooms from this
                                        queue, and a slug is what they are called
                                        out loud. */}
                                    <Text size="xs" c="dimmed" ff="monospace">{printout.activitySlug}</Text>
                                </Table.Td>
                                <Table.Td>
                                    <Text ff="monospace" size="sm">{printout.fileName}</Text>
                                    {printout.title && <Text size="xs" c="dimmed">{printout.title}</Text>}
                                </Table.Td>
                                <Table.Td>
                                    <ActivityTime value={printout.requestedAt} size="sm" />
                                </Table.Td>
                                <Table.Td>
                                    <Badge color={STATE_COLOR[printout.state]} variant="light">
                                        {printout.state === "printed" ? t("Printed")
                                            : printout.state === "discarded" ? t("Discarded")
                                                : printout.state === "printing" ? t("At a printer")
                                                    : t("Waiting")}
                                    </Badge>
                                </Table.Td>
                                <Table.Td>
                                    <Group gap="xs" justify="flex-end" wrap="nowrap">
                                        {/* **Said before it is clicked.** Two
                                            people at one printer each opening a
                                            sheet is how one page is printed
                                            twice; the label is what stops it. */}
                                        {printout.state === "printing" && !printout.claimedByMe && (
                                            <Text size="xs" c="dimmed" data-testid="printout-held-by">
                                                {t("With {{name}}", { name: printout.claimedByName ?? "" })}
                                            </Text>
                                        )}
                                        {printout.state === "printing" && printout.claimedByMe && (
                                            <Button
                                                size="compact-sm"
                                                variant="subtle"
                                                color="gray"
                                                data-testid="printout-release"
                                                onClick={() => release(printout)}
                                                disabled={busy}
                                            >
                                                {t("Hand back")}
                                            </Button>
                                        )}
                                        {printout.state !== "printed" && printout.state !== "discarded" && (
                                            <Button
                                                size="compact-sm"
                                                variant="light"
                                                data-testid="printout-print"
                                                leftSection={<IconPrinter size={14} />}
                                                onClick={() => open(printout)}
                                            >
                                                {printout.state === "printing" && !printout.claimedByMe
                                                    ? t("Take over")
                                                    : t("Print")}
                                            </Button>
                                        )}
                                    </Group>
                                </Table.Td>
                            </Table.Tr>
                        ))}
                    </Table.Tbody>
                </DataTable>
            )}

            {total > PAGE_SIZE && (
                <Group justify="center">
                    <Pagination
                        value={page}
                        onChange={value => set({ page: String(value) })}
                        total={Math.ceil(total / PAGE_SIZE)}
                    />
                </Group>
            )}

            {/* Dismiss is the safe default: the sheet stays reopenable until the
                operator says what happened, and confirming cannot be undone. */}
            <Modal
                opened={confirming !== undefined}
                onClose={() => setConfirming(undefined)}
                title={<Title order={4}>{t("Did it print?")}</Title>}
                centered
            >
                <Stack gap="md">
                    <Text size="sm">
                        {t("Confirming disposes of the source. It cannot be undone, and the sheet cannot be opened again.")}
                    </Text>
                    {confirming && (
                        <Text size="sm" c="dimmed">
                            {confirming.requestedByName} · {confirming.fileName}
                        </Text>
                    )}
                    {failed && <Alert color="red">{failed}</Alert>}
                    <Group justify="flex-end">
                        <Button variant="default" onClick={() => setConfirming(undefined)} disabled={busy}>
                            {t("Not yet")}
                        </Button>
                        <Button
                            variant="light"
                            color="gray"
                            data-testid="printout-discard"
                            leftSection={<IconTrash size={16} />}
                            onClick={() => resolve("discarded")}
                            loading={busy}
                        >
                            {t("Discard")}
                        </Button>
                        <Button
                            data-testid="printout-printed"
                            leftSection={<IconPrinter size={16} />}
                            onClick={() => resolve("printed")}
                            loading={busy}
                        >
                            {t("Printed")}
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </Stack>
    );
}
