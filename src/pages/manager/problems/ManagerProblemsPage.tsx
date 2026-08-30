import { Alert, Badge, Button, Group, Modal, Pagination, Select, Stack, Switch, Table, Text, TextInput, Title, Tooltip } from "@mantine/core";
import { IconArchive, IconArchiveOff, IconCopy, IconLock, IconPlus, IconSearch, IconTrash, IconUpload, IconUsers, IconWorld } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ManagedProblem, ProblemVisibility } from "../../../api/ManagerApi";
import LoadState from "../../../components/LoadState";
import ActivityTime from "../../../components/time/ActivityTime";
import CleanCopyModal from "../../../components/copy/CleanCopyModal";
import ExportButton from "../../../components/exchange/ExportButton";
import ImportBundleModal from "../../../components/exchange/ImportBundleModal";
import { collectProblemOnly } from "../../../exchange/collect";
import { useApiCall, useApiEffect } from "../../../provider/apiContext";
import { problemTypes } from "../../../renderers";

const PAGE_SIZE = 20;

/** The first type the Client can draw. There is always at least one. */
const DEFAULT_TYPE = problemTypes()[0]?.id ?? "standard-io@1";

const VISIBILITY_ICON: Record<ProblemVisibility, typeof IconLock> = {
    private: IconLock,
    shared: IconUsers,
    instance: IconWorld,
};

const VisibilityBadge = ({ problem }: { problem: ManagedProblem }) => {
    const { t } = useTranslation();
    const Icon = VISIBILITY_ICON[problem.visibility];
    const label = problem.visibility === "shared"
        ? `${t("visibility.shared")} (${problem.sharedWith.length})`
        : t(`visibility.${problem.visibility}`);
    return <Badge variant="light" leftSection={<Icon size={12} />}>{label}</Badge>;
};

export default function ManagerProblemsPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const call = useApiCall();

    const [copying, setCopying] = useState<ManagedProblem | undefined>(undefined);
    const [importing, setImporting] = useState(false);
    const [items, setItems] = useState<ManagedProblem[] | undefined>(undefined);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState("");
    const [mineOnly, setMineOnly] = useState(false);
    const [includeArchived, setIncludeArchived] = useState(false);
    const [creating, setCreating] = useState(false);
    const [draft, setDraft] = useState({ slug: "", name: "", type: DEFAULT_TYPE });
    const [error, setError] = useState<string | undefined>(undefined);
    const [busy, setBusy] = useState(false);
    const [reload, setReload] = useState(0);

    const loadError = useApiEffect(async (api) => {
        setItems(undefined);
        const result = await api.managerApi.getProblems({
            page, pageSize: PAGE_SIZE,
            search: search || undefined,
            mineOnly: mineOnly || undefined,
            includeArchived: includeArchived || undefined,
        });
        setItems(result.items);
        setTotal(result.total);
        api.managerApi.eventDispatcher.addEventListener("problemChanged", () => setReload(n => n + 1));
    }, [page, search, mineOnly, includeArchived, reload]);

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

    const create = () => run(async () => {
        const created = await call(api => api.managerApi.createProblem({
            slug: draft.slug.trim(),
            name: draft.name.trim(),
            type: draft.type,
        }));
        setCreating(false);
        setDraft({ slug: "", name: "", type: DEFAULT_TYPE });
        navigate(`/manager/problems/${created.id}`);
    });

    if (!items) return <LoadState error={loadError} loading={!loadError} />;

    const chosenType = problemTypes().find(type => type.id === draft.type);

    return (
        <Stack gap="md">
            <Group justify="space-between" wrap="wrap">
                <Stack gap={2}>
                    <Title>{t("Problems")}</Title>
                    <Text size="sm" c="dimmed">
                        {t("A problem is private until you share it. Only its author can attach a private problem.")}
                    </Text>
                </Stack>
                <Group gap="sm">
                    <Button data-testid="import-file" variant="default" leftSection={<IconUpload size={16} />} onClick={() => setImporting(true)}>
                        {t("Import from a file")}
                    </Button>
                    <Button leftSection={<IconPlus size={16} />} onClick={() => setCreating(true)}>
                        {t("New problem")}
                    </Button>
                </Group>
            </Group>

            {error && <Alert color="red" withCloseButton onClose={() => setError(undefined)}>{error}</Alert>}

            <Group gap="md" wrap="wrap">
                <TextInput
                    placeholder={t("Search by name or slug")}
                    leftSection={<IconSearch size={16} />}
                    value={search}
                    onChange={e => { setSearch(e.currentTarget.value); setPage(1); }}
                    w={300}
                />
                <Switch label={t("Only mine")} checked={mineOnly} onChange={e => { setMineOnly(e.currentTarget.checked); setPage(1); }} />
                <Switch label={t("Include archived")} checked={includeArchived} onChange={e => { setIncludeArchived(e.currentTarget.checked); setPage(1); }} />
            </Group>

            <Table.ScrollContainer minWidth={900}>
                <Table striped highlightOnHover>
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th>{t("Name")}</Table.Th>
                            <Table.Th>{t("Type")}</Table.Th>
                            <Table.Th>{t("Owner")}</Table.Th>
                            <Table.Th>{t("Visibility")}</Table.Th>
                            <Table.Th>{t("Version")}</Table.Th>
                            <Table.Th>{t("Attached")}</Table.Th>
                            <Table.Th>{t("Date")}</Table.Th>
                            <Table.Th />
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {items.map(problem => (
                            <Table.Tr key={problem.id} opacity={problem.archivedAt ? 0.55 : 1}>
                                <Table.Td>
                                    <Group gap="xs" wrap="nowrap">
                                        <Text
                                            fw={500}
                                            style={{ cursor: "pointer" }}
                                            onClick={() => navigate(`/manager/problems/${problem.id}`)}
                                        >
                                            {problem.name}
                                        </Text>
                                        {problem.archivedAt && <Badge size="sm" color="gray">{t("Archived")}</Badge>}
                                    </Group>
                                    <Text size="xs" c="dimmed" ff="monospace">{problem.slug}</Text>
                                </Table.Td>
                                <Table.Td><Text size="sm" ff="monospace">{problem.type}</Text></Table.Td>
                                <Table.Td><Text size="sm">{problem.ownerName}</Text></Table.Td>
                                <Table.Td><VisibilityBadge problem={problem} /></Table.Td>
                                <Table.Td>
                                    <Text size="sm">
                                        {problem.currentVersion === 0 ? "—" : `v${problem.currentVersion}`}
                                        {problem.versionCount > 1 && (
                                            <Text component="span" size="xs" c="dimmed"> / {problem.versionCount}</Text>
                                        )}
                                    </Text>
                                </Table.Td>
                                <Table.Td>
                                    {problem.attachedCount > 0
                                        ? <Badge variant="outline" size="sm">{problem.attachedCount}</Badge>
                                        : <Text size="sm" c="dimmed">—</Text>}
                                </Table.Td>
                                <Table.Td>
                                    <ActivityTime value={problem.createdAt} timeZone="Europe/Warsaw" format="date" hideZone />
                                </Table.Td>
                                <Table.Td>
                                    <Group gap="xs" justify="flex-end" wrap="nowrap">
                                        <Button variant="light" size="compact-sm" onClick={() => navigate(`/manager/problems/${problem.id}`)}>
                                            {t("Open")}
                                        </Button>
                                        <Tooltip label={t("Duplicate")}>
                                            <Button
                                                variant="subtle"
                                                size="compact-sm"
                                                aria-label={t("Duplicate")}
                                                loading={busy}
                                                onClick={() => setCopying(problem)}
                                            >
                                                <IconCopy size={14} />
                                            </Button>
                                        </Tooltip>
                                        <ExportButton
                                            compact
                                            label={t("Export to a file")}
                                            filename={`algojudge-${problem.slug}`}
                                            collect={api => collectProblemOnly(api, problem.id)}
                                            onError={message => setError(message || undefined)}
                                        />
                                        <Tooltip label={problem.archivedAt ? t("Restore") : t("Archive")}>
                                            <Button
                                                variant="subtle"
                                                size="compact-sm"
                                                loading={busy}
                                                onClick={() => run(() => call(api => api.managerApi.setProblemArchived(problem.id, !problem.archivedAt)))}
                                            >
                                                {problem.archivedAt ? <IconArchiveOff size={14} /> : <IconArchive size={14} />}
                                            </Button>
                                        </Tooltip>
                                        {/* Deleting is refused while the problem is
                                            attached anywhere, so the button says so
                                            instead of failing on click. */}
                                        <Tooltip label={problem.attachedCount > 0
                                            ? t("Attached to an activity — archive it instead")
                                            : t("Delete")}>
                                            <Button
                                                variant="subtle"
                                                color="red"
                                                size="compact-sm"
                                                disabled={problem.attachedCount > 0}
                                                loading={busy}
                                                onClick={() => run(() => call(api => api.managerApi.deleteProblem(problem.id)))}
                                            >
                                                <IconTrash size={14} />
                                            </Button>
                                        </Tooltip>
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

            <Modal opened={creating} onClose={() => setCreating(false)} title={<Title order={4}>{t("New problem")}</Title>} centered>
                <Stack gap="sm">
                    <TextInput
                        label={t("Name")}
                        value={draft.name}
                        onChange={e => setDraft({ ...draft, name: e.currentTarget.value })}
                        required
                    />
                    <TextInput
                        label={t("Slug")}
                        description={t("Used in URLs and copied into an assignment by default")}
                        value={draft.slug}
                        onChange={e => setDraft({ ...draft, slug: e.currentTarget.value })}
                        required
                    />
                    {/* A choice, not a free field: the type decides which renderers
                        draw the statement and the result, and a string nothing is
                        registered for produces a problem every screen refuses to
                        show. */}
                    <Select
                        label={t("Type")}
                        description={chosenType ? t(chosenType.description) : undefined}
                        data={problemTypes().map(type => ({
                            value: type.id,
                            label: `${t(type.label)} — ${type.id}`,
                        }))}
                        value={draft.type}
                        onChange={value => value && setDraft({ ...draft, type: value })}
                        allowDeselect={false}
                    />
                    <Group justify="space-between">
                        <Button data-testid="back" variant="default" onClick={() => setCreating(false)}>{t("Back")}</Button>
                        <Button data-testid="save" loading={busy} onClick={create}>{t("Save")}</Button>
                    </Group>
                </Stack>
            </Modal>

            <CleanCopyModal
                opened={copying !== undefined}
                onClose={() => setCopying(undefined)}
                title={t("Duplicate this problem")}
                carries={t("The copy carries the newest version only — its statement, its files and its package. The history does not travel: notes about changes that never happened to this copy would be somebody else's past.")}
                drops={t("It arrives private and owned by you, whatever the original was, and it is attached to nothing. Its slug is derived from the original's.")}
                confirmLabel={t("Copy it")}
                busy={busy}
                onConfirm={() => run(async () => {
                    const id = copying?.id;
                    if (!id) return;
                    await call(api => api.managerApi.duplicateProblem(id));
                    setCopying(undefined);
                })}
            />

            <ImportBundleModal
                opened={importing}
                onClose={() => setImporting(false)}
                onImported={() => { setImporting(false); setReload(n => n + 1); }}
            />
        </Stack>
    );
}
