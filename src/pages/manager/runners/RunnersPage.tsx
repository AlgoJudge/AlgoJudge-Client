import {
    Alert, Badge, Button, Card, Group, Modal, Pagination, Select, Stack, Table, TagsInput, Text,
    TextInput, Title, Tooltip,
} from "@mantine/core";
import { IconCheck, IconSearch, IconTrash, IconX } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ManagedRunner, RunnerState } from "../../../api/ManagerApi";
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
    const [selected, setSelected] = useState<ManagedRunner | undefined>(undefined);
    const [tags, setTags] = useState<string[]>([]);
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
                                                onClick={() => { setSelected(runner); setTags(runner.tags); }}
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
                onClose={() => setSelected(undefined)}
                title={<Title order={4}>{selected?.name}</Title>}
                size="lg"
                centered
            >
                {selected && (
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
                )}
            </Modal>
        </Stack>
    );
}
