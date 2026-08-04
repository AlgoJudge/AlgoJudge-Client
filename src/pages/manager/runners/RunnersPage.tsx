import {
    Alert, Badge, Button, Card, Code, Group, Loader, Modal, Pagination, Select, Stack, Table, Tabs,
    TagsInput, Text, TextInput, Title, Tooltip,
} from "@mantine/core";
import { IconCheck, IconSearch, IconTrash, IconX } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { ManagedRunner, RunnerAttachment, RunnerState } from "../../../api/ManagerApi";
import LoadState from "../../../components/LoadState";
import ActivityTime from "../../../components/time/ActivityTime";
import { useApiCall, useApiEffect } from "../../../provider/ApiProvider";

const PAGE_SIZE = 20;

const STATE_COLOUR: Record<RunnerState, string> = {
    pendingApproval: "orange",
    approved: "teal",
    revoked: "gray",
};

const STATES: RunnerState[] = ["pendingApproval", "approved", "revoked"];

/** Only text can be shown in a tab; anything else is a download, not a panel. */
const textAttachments = (runner: ManagedRunner): RunnerAttachment[] =>
    runner.attachments.filter(a => a.mimeType.startsWith("text/"));

/**
 * The Runners an installation has, and what each one said about itself.
 *
 * Everything but the tags is reported by the Runner: product, version, the
 * problem types it accepts, its address, its key fingerprint and its machine.
 * The screen displays the report and never fills a gap in it — a Runner that has
 * not connected has no machine, and saying so is the honest answer.
 *
 * Approval and connection are shown separately. An approved Runner that is
 * offline is an outage; a connected Runner that is not approved evaluates
 * nothing. Collapsing the two into one "status" hides both.
 */
export default function RunnersPage() {
    const { t } = useTranslation();
    const call = useApiCall();

    const [items, setItems] = useState<ManagedRunner[] | undefined>(undefined);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState("");
    const [state, setState] = useState<RunnerState | undefined>(undefined);
    // The open Runner is in the URL: "look at this machine's log" is a link
    // somebody sends, the same as a filtered submission list.
    const [query, setQuery] = useSearchParams();
    const [selected, setSelected] = useState<ManagedRunner | undefined>(undefined);
    const [tags, setTags] = useState<string[]>([]);
    /** Attachment bodies, keyed by file id, fetched when their tab is opened. */
    const [files, setFiles] = useState<Record<string, string>>({});
    const [error, setError] = useState<string | undefined>(undefined);
    const [busy, setBusy] = useState(false);
    const [reload, setReload] = useState(0);

    const loadError = useApiEffect(async (api) => {
        setItems(undefined);
        const result = await api.managerApi.getRunners({
            page, pageSize: PAGE_SIZE,
            state,
            search: search || undefined,
        });
        setItems(result.items);
        setTotal(result.total);

        // A link straight to one Runner opens it once the list has arrived.
        const wanted = query.get("runner");
        if (wanted) {
            const runner = result.items.find(r => r.id === wanted);
            if (runner) {
                setSelected(runner);
                setTags(runner.tags);
                const file = runner.attachments.find(a => a.id === query.get("file"));
                if (file) {
                    setFiles({ [file.id]: await api.managerApi.getRunnerAttachment(runner.id, file.id) });
                }
            }
        }

        api.managerApi.eventDispatcher.addEventListener("runnerChanged", () => setReload(n => n + 1));
    }, [page, search, state, reload]);

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

    /**
     * A file is fetched when its tab is first opened, not with the Runner: a
     * machine report is tens of kilobytes nobody reads most of the time.
     */
    const openFile = async (runner: ManagedRunner, attachment: RunnerAttachment) => {
        if (files[attachment.id] !== undefined) return;
        const body = await call(api => api.managerApi.getRunnerAttachment(runner.id, attachment.id));
        setFiles(current => ({ ...current, [attachment.id]: body }));
    };

    if (!items) return <LoadState error={loadError} loading={!loadError} />;

    const waiting = items.filter(r => r.state === "pendingApproval").length;

    return (
        <Stack gap="md">
            <Stack gap={2}>
                <Title>{t("Runners")}</Title>
                <Text size="sm" c="dimmed">
                    {t("A Runner registers its own key and evaluates nothing until an administrator approves it.")}
                </Text>
            </Stack>

            {error && <Alert color="red" withCloseButton onClose={() => setError(undefined)}>{error}</Alert>}

            {waiting > 0 && (
                <Alert color="orange">
                    {/* Counted after the label rather than before it: a number in
                        front of a noun needs grammatical agreement, and the
                        translation files do not carry plural forms. */}
                    {t("Waiting for approval")}: {waiting}
                </Alert>
            )}

            <Group gap="md" wrap="wrap">
                <TextInput
                    placeholder={t("Search by name, address, fingerprint or tag")}
                    leftSection={<IconSearch size={16} />}
                    value={search}
                    onChange={e => { setSearch(e.currentTarget.value); setPage(1); }}
                    w={320}
                />
                <Select
                    placeholder={t("Every state")}
                    data={STATES.map(s => ({ value: s, label: t(`runnerState.${s}`) }))}
                    value={state ?? null}
                    onChange={v => { setState((v ?? undefined) as RunnerState | undefined); setPage(1); }}
                    clearable
                    w={220}
                />
            </Group>

            <Table.ScrollContainer minWidth={1000}>
                <Table striped highlightOnHover>
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th>{t("Runner")}</Table.Th>
                            <Table.Th>{t("Version")}</Table.Th>
                            <Table.Th>{t("Problem types")}</Table.Th>
                            <Table.Th>{t("Machine")}</Table.Th>
                            <Table.Th>{t("State")}</Table.Th>
                            <Table.Th>{t("Last seen")}</Table.Th>
                            <Table.Th />
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {items.map(runner => (
                            <Table.Tr key={runner.id} opacity={runner.state === "revoked" ? 0.55 : 1}>
                                <Table.Td>
                                    <Stack gap={0}>
                                        <Group gap="xs">
                                            <Text
                                                fw={500}
                                                style={{ cursor: "pointer" }}
                                                onClick={() => {
                                                    setSelected(runner);
                                                    setTags(runner.tags);
                                                    setFiles({});
                                                    setQuery({ runner: runner.id }, { replace: true });
                                                }}
                                            >
                                                {runner.name}
                                            </Text>
                                            {/* Connection and approval are different
                                                facts and are shown as different things. */}
                                            <Badge
                                                size="sm"
                                                variant="dot"
                                                color={runner.isConnected ? "teal" : "gray"}
                                            >
                                                {t(runner.isConnected ? "online" : "offline")}
                                            </Badge>
                                        </Group>
                                        <Text size="xs" c="dimmed" ff="monospace">{runner.address}</Text>
                                    </Stack>
                                </Table.Td>
                                <Table.Td>
                                    <Stack gap={0}>
                                        <Text size="sm">{runner.version}</Text>
                                        <Text size="xs" c="dimmed">{runner.product}</Text>
                                    </Stack>
                                </Table.Td>
                                <Table.Td>
                                    <Group gap={4}>
                                        {runner.problemTypes.map(type => (
                                            <Badge key={type} size="sm" variant="light" ff="monospace">{type}</Badge>
                                        ))}
                                    </Group>
                                </Table.Td>
                                <Table.Td>
                                    {runner.machine
                                        ? (
                                            <Text size="xs" c="dimmed">
                                                {runner.machine.cores} × {runner.machine.cpu}
                                                <br />
                                                {Math.round((runner.machine.memoryMb ?? 0) / 1024)} GB · {runner.machine.os}
                                            </Text>
                                        )
                                        : <Text size="xs" c="dimmed">{t("never connected")}</Text>}
                                </Table.Td>
                                <Table.Td>
                                    <Tooltip label={runner.revokedReason ?? ""} disabled={!runner.revokedReason}>
                                        <Badge variant="light" color={STATE_COLOUR[runner.state]}>
                                            {t(`runnerState.${runner.state}`)}
                                        </Badge>
                                    </Tooltip>
                                </Table.Td>
                                <Table.Td>
                                    {runner.lastSeenAt
                                        ? <ActivityTime value={runner.lastSeenAt} timeZone="Europe/Warsaw" hideZone />
                                        : <Text size="sm" c="dimmed">—</Text>}
                                </Table.Td>
                                <Table.Td>
                                    <Group gap="xs" justify="flex-end" wrap="nowrap">
                                        {runner.state === "pendingApproval" && (
                                            <Button
                                                variant="light"
                                                size="compact-sm"
                                                leftSection={<IconCheck size={14} />}
                                                loading={busy}
                                                onClick={() => run(() => call(api => api.managerApi.approveRunner(runner.id)))}
                                            >
                                                {t("Approve")}
                                            </Button>
                                        )}
                                        {runner.state === "approved" && (
                                            <Tooltip label={t("Revoke the key — the Runner must register again")}>
                                                <Button
                                                    variant="subtle"
                                                    color="red"
                                                    size="compact-sm"
                                                    loading={busy}
                                                    onClick={() => run(() => call(api =>
                                                        api.managerApi.revokeRunner(runner.id, undefined)))}
                                                >
                                                    <IconX size={14} />
                                                </Button>
                                            </Tooltip>
                                        )}
                                        {runner.state === "revoked" && (
                                            <Tooltip label={t("Forget it")}>
                                                <Button
                                                    variant="subtle"
                                                    color="red"
                                                    size="compact-sm"
                                                    loading={busy}
                                                    onClick={() => run(() => call(api => api.managerApi.forgetRunner(runner.id)))}
                                                >
                                                    <IconTrash size={14} />
                                                </Button>
                                            </Tooltip>
                                        )}
                                    </Group>
                                </Table.Td>
                            </Table.Tr>
                        ))}
                    </Table.Tbody>
                </Table>
            </Table.ScrollContainer>

            {items.length === 0 && <Text c="dimmed">{t("Nothing matches the filters")}</Text>}

            <Group justify="center">
                <Pagination total={Math.ceil(total / PAGE_SIZE)} value={page} onChange={setPage} />
            </Group>

            <Modal
                opened={selected !== undefined}
                onClose={() => { setSelected(undefined); setQuery({}, { replace: true }); }}
                title={<Title order={4}>{selected?.name}</Title>}
                size="lg"
                centered
            >
                {selected && (
                    <Tabs
                        value={query.get("file") ?? "general"}
                        onChange={value => {
                            // In the URL as well, so a link can point straight at
                            // a machine's log rather than at the Runner.
                            setQuery(value && value !== "general"
                                ? { runner: selected.id, file: value }
                                : { runner: selected.id }, { replace: true });
                            const attachment = selected.attachments.find(a => a.id === value);
                            if (attachment) openFile(selected, attachment);
                        }}
                    >
                        <Tabs.List>
                            <Tabs.Tab value="general">{t("General")}</Tabs.Tab>
                            {/* One tab per text attachment, named by the file. The
                                panel is a list of whatever the Runner uploaded —
                                a Runner that starts sending something new gets a
                                tab for it without a Client change. */}
                            {textAttachments(selected).map(attachment => (
                                <Tabs.Tab key={attachment.id} value={attachment.id}>
                                    {attachment.name}
                                </Tabs.Tab>
                            ))}
                        </Tabs.List>

                        <Tabs.Panel value="general" pt="md">
                    <Stack gap="sm">
                        <Card withBorder radius="sm">
                            <Table variant="vertical" layout="fixed">
                                <Table.Tbody>
                                    <Table.Tr>
                                        <Table.Th w={200}>{t("Product")}</Table.Th>
                                        <Table.Td>{selected.product} {selected.version}</Table.Td>
                                    </Table.Tr>
                                    <Table.Tr>
                                        <Table.Th>{t("Address")}</Table.Th>
                                        <Table.Td ff="monospace">{selected.address}</Table.Td>
                                    </Table.Tr>
                                    <Table.Tr>
                                        <Table.Th>{t("Key fingerprint")}</Table.Th>
                                        <Table.Td ff="monospace" fz="xs">{selected.fingerprint}</Table.Td>
                                    </Table.Tr>
                                    <Table.Tr>
                                        <Table.Th>{t("Public key")}</Table.Th>
                                        <Table.Td>
                                            {/* The fingerprint is for reading aloud
                                                when approving; the key itself is
                                                what a mismatch is diagnosed with. */}
                                            <Code block style={{ fontSize: 11, wordBreak: "break-all", whiteSpace: "pre-wrap" }}>
                                                {selected.publicKey}
                                            </Code>
                                        </Table.Td>
                                    </Table.Tr>
                                    <Table.Tr>
                                        <Table.Th>{t("Registered")}</Table.Th>
                                        <Table.Td>
                                            <ActivityTime value={selected.registeredAt} timeZone="Europe/Warsaw" />
                                        </Table.Td>
                                    </Table.Tr>
                                    <Table.Tr>
                                        <Table.Th>{t("Completed jobs")}</Table.Th>
                                        <Table.Td>{selected.completedJobs}</Table.Td>
                                    </Table.Tr>
                                    {selected.machine && (
                                        <Table.Tr>
                                            <Table.Th>{t("Machine")}</Table.Th>
                                            <Table.Td>
                                                {selected.machine.cpu} · {selected.machine.cores} {t("cores")} ·{" "}
                                                {Math.round((selected.machine.memoryMb ?? 0) / 1024)} GB · {selected.machine.os}
                                            </Table.Td>
                                        </Table.Tr>
                                    )}
                                </Table.Tbody>
                            </Table>
                        </Card>

                        <Alert color="blue">
                            {t("Everything above is what the Runner reported about itself. Only the tags are set here.")}
                        </Alert>

                        <TagsInput
                            label={t("Tags")}
                            description={t("Used to steer work at particular machines")}
                            value={tags}
                            onChange={setTags}
                        />
                        <Group justify="space-between">
                            <Button variant="default" onClick={() => setSelected(undefined)}>{t("Back")}</Button>
                            <Button
                                loading={busy}
                                onClick={() => run(async () => {
                                    await call(api => api.managerApi.setRunnerTags(selected.id, tags));
                                    setSelected(undefined);
                                })}
                            >
                                {t("Save")}
                            </Button>
                        </Group>
                    </Stack>
                        </Tabs.Panel>

                        {textAttachments(selected).map(attachment => (
                            <Tabs.Panel key={attachment.id} value={attachment.id} pt="md">
                                <Stack gap="xs">
                                    <Group justify="space-between">
                                        <Text size="xs" c="dimmed">
                                            {Math.ceil(attachment.sizeBytes / 1024)} kB ·{" "}
                                            <ActivityTime value={attachment.uploadedAt} timeZone="Europe/Warsaw" />
                                        </Text>
                                        <Text size="xs" c="dimmed" ff="monospace">
                                            sha256 {attachment.sha256.slice(0, 16)}…
                                        </Text>
                                    </Group>
                                    {files[attachment.id] === undefined
                                        ? <Group justify="center" my="xl"><Loader size="sm" /></Group>
                                        : (
                                            <Code block style={{ maxHeight: 420, overflow: "auto", whiteSpace: "pre" }}>
                                                {files[attachment.id]}
                                            </Code>
                                        )}
                                </Stack>
                            </Tabs.Panel>
                        ))}
                    </Tabs>
                )}
            </Modal>
        </Stack>
    );
}
