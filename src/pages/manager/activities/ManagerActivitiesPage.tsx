import { Alert, Badge, Button, Group, Modal, Pagination, Select, Stack, Switch, Table, Text, TextInput, Title, Tooltip } from "@mantine/core";
import { IconArchive, IconArchiveOff, IconPlus, IconSearch, IconTrash } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ManagedActivity } from "../../../api/ManagerApi";
import LoadState from "../../../components/LoadState";
import ActivityTime from "../../../components/time/ActivityTime";
import { emptyActivity } from "../../../components/activity/activityInput";
import { activityTypes } from "../../../renderers";

/** The first type this Client can present, so the form opens on a working one. */
const DEFAULT_TYPE = activityTypes()[0]?.id ?? "contest@1";
import { useApiCall, useApiEffect } from "../../../provider/apiContext";

const PAGE_SIZE = 20;

/**
 * Derived from the dates rather than stored: a state column that can disagree
 * with the clock is worse than none.
 */
const state = (activity: ManagedActivity): "upcoming" | "ongoing" | "finished" | "untimed" => {
    const now = Date.now();
    if (activity.startDate && Date.parse(activity.startDate) > now) return "upcoming";
    if (activity.endDate && Date.parse(activity.endDate) < now) return "finished";
    return activity.startDate || activity.endDate ? "ongoing" : "untimed";
};

const STATE_COLOUR = { upcoming: "blue", ongoing: "teal", finished: "gray", untimed: "gray" } as const;

export default function ManagerActivitiesPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const call = useApiCall();

    const [items, setItems] = useState<ManagedActivity[] | undefined>(undefined);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState("");
    const [includeArchived, setIncludeArchived] = useState(false);
    const [creating, setCreating] = useState(false);
    const [draft, setDraft] = useState({ slug: "", name: "", type: DEFAULT_TYPE });
    const chosenType = activityTypes().find(type => type.id === draft.type);
    const [error, setError] = useState<string | undefined>(undefined);
    const [busy, setBusy] = useState(false);
    const [reload, setReload] = useState(0);

    const loadError = useApiEffect(async (api) => {
        setItems(undefined);
        const result = await api.managerApi.getActivities({
            page, pageSize: PAGE_SIZE,
            search: search || undefined,
            includeArchived: includeArchived || undefined,
        });
        setItems(result.items);
        setTotal(result.total);
        api.managerApi.eventDispatcher.addEventListener("activityChanged", () => setReload(n => n + 1));
    }, [page, search, includeArchived, reload]);

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

    // Created with defaults and opened for editing: the full settings form is
    // the detail screen's, and asking for all of it before the activity exists
    // would be a worse first step.
    const create = () => run(async () => {
        const created = await call(api => api.managerApi.createActivity({
            ...emptyActivity(),
            slug: draft.slug.trim(),
            name: draft.name.trim(),
            type: draft.type,
        }));
        setCreating(false);
        setDraft({ slug: "", name: "", type: DEFAULT_TYPE });
        navigate(`/manager/activities/${created.id}`);
    });

    if (!items) return <LoadState error={loadError} loading={!loadError} />;

    return (
        <Stack gap="md">
            <Group justify="space-between" wrap="wrap">
                <Stack gap={2}>
                    <Title>{t("Activities")}</Title>
                    <Text size="sm" c="dimmed">
                        {t("A contest, a course, a practice set — one place where problems are given to people.")}
                    </Text>
                </Stack>
                <Button leftSection={<IconPlus size={16} />} onClick={() => setCreating(true)}>
                    {t("New activity")}
                </Button>
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
                <Switch
                    label={t("Include archived")}
                    checked={includeArchived}
                    onChange={e => { setIncludeArchived(e.currentTarget.checked); setPage(1); }}
                />
            </Group>

            <Table.ScrollContainer minWidth={900}>
                <Table striped highlightOnHover>
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th>{t("Name")}</Table.Th>
                            <Table.Th>{t("Type")}</Table.Th>
                            <Table.Th>{t("State")}</Table.Th>
                            <Table.Th>{t("Starts")}</Table.Th>
                            <Table.Th>{t("Series")}</Table.Th>
                            <Table.Th>{t("Problems")}</Table.Th>
                            <Table.Th>{t("Participants")}</Table.Th>
                            <Table.Th />
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {items.map(activity => (
                            <Table.Tr key={activity.id} opacity={activity.archivedAt ? 0.55 : 1}>
                                <Table.Td>
                                    <Group gap="xs" wrap="nowrap">
                                        <Text
                                            fw={500}
                                            style={{ cursor: "pointer" }}
                                            onClick={() => navigate(`/manager/activities/${activity.id}`)}
                                        >
                                            {activity.name}
                                        </Text>
                                        {activity.archivedAt && <Badge size="sm" color="gray">{t("Archived")}</Badge>}
                                    </Group>
                                    <Text size="xs" c="dimmed" ff="monospace">{activity.slug}</Text>
                                </Table.Td>
                                <Table.Td>
                                    <Stack gap={2}>
                                        <Text size="sm" ff="monospace">{activity.type}</Text>
                                        <Text size="xs" c="dimmed">{t("ranking")}: {activity.rankingType}</Text>
                                    </Stack>
                                </Table.Td>
                                <Table.Td>
                                    <Badge variant="light" color={STATE_COLOUR[state(activity)]}>
                                        {t(`activityState.${state(activity)}`)}
                                    </Badge>
                                </Table.Td>
                                <Table.Td>
                                    {activity.startDate
                                        ? <ActivityTime value={activity.startDate} timeZone={activity.timeZone} format="datetime" />
                                        : <Text size="sm" c="dimmed">—</Text>}
                                </Table.Td>
                                <Table.Td><Text size="sm">{activity.seriesCount}</Text></Table.Td>
                                <Table.Td><Text size="sm">{activity.problemCount}</Text></Table.Td>
                                <Table.Td><Text size="sm">{activity.participantCount}</Text></Table.Td>
                                <Table.Td>
                                    <Group gap="xs" justify="flex-end" wrap="nowrap">
                                        <Button
                                            variant="light"
                                            size="compact-sm"
                                            onClick={() => navigate(`/manager/activities/${activity.id}`)}
                                        >
                                            {t("Open")}
                                        </Button>
                                        <Tooltip label={activity.archivedAt ? t("Restore") : t("Archive")}>
                                            <Button
                                                variant="subtle"
                                                size="compact-sm"
                                                loading={busy}
                                                onClick={() => run(() => call(api =>
                                                    api.managerApi.setActivityArchived(activity.id, !activity.archivedAt)))}
                                            >
                                                {activity.archivedAt ? <IconArchiveOff size={14} /> : <IconArchive size={14} />}
                                            </Button>
                                        </Tooltip>
                                        {/* Deletion destroys submissions people may
                                            still come back for, so it is refused for
                                            anything that ran — said here rather than
                                            after the click. */}
                                        <Tooltip label={activity.participantCount > 0
                                            ? t("This activity has participants — archive it instead")
                                            : t("Delete")}>
                                            <Button
                                                variant="subtle"
                                                color="red"
                                                size="compact-sm"
                                                disabled={activity.participantCount > 0}
                                                loading={busy}
                                                onClick={() => run(() => call(api => api.managerApi.deleteActivity(activity.id)))}
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

            <Modal opened={creating} onClose={() => setCreating(false)} title={<Title order={4}>{t("New activity")}</Title>} centered>
                <Stack gap="sm">
                    <TextInput
                        label={t("Name")}
                        value={draft.name}
                        onChange={e => setDraft({ ...draft, name: e.currentTarget.value })}
                        required
                    />
                    <TextInput
                        label={t("Slug")}
                        description={t("Used in URLs, for example AMMPZ-2019. Immutable once set.")}
                        value={draft.slug}
                        onChange={e => setDraft({ ...draft, slug: e.currentTarget.value })}
                        required
                    />
                    {/* A choice, not a free field, as it is for a problem: the
                        type decides how the activity presents its series, and a
                        string nothing is registered for gets whatever generic
                        behaviour the fallback happens to have. */}
                    <Select
                        label={t("Type")}
                        description={chosenType ? t(chosenType.description) : undefined}
                        data={activityTypes().map(type => ({
                            value: type.id,
                            label: `${t(type.label)} — ${type.id}`,
                        }))}
                        value={draft.type}
                        onChange={value => value && setDraft({ ...draft, type: value })}
                        allowDeselect={false}
                    />
                    <Text size="sm" c="dimmed">
                        {t("The rest is edited on the activity itself, with sensible defaults to start from.")}
                    </Text>
                    <Group justify="space-between">
                        <Button variant="default" onClick={() => setCreating(false)}>{t("Back")}</Button>
                        <Button loading={busy} onClick={create}>{t("Save")}</Button>
                    </Group>
                </Stack>
            </Modal>
        </Stack>
    );
}
