import { Alert, Badge, Button, Group, Pagination, Select, Stack, Table, Text, TextInput, Title, Tooltip } from "@mantine/core";
import { IconRefresh, IconSearch } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ManagedActivitySummary, ManagedSeries, ManagedSubmission } from "../../../api/ManagerApi";
import { JobState } from "../../../api/ParticipantApi";
import LoadState from "../../../components/LoadState";
import ActivityTime from "../../../components/time/ActivityTime";
import { useApiCall, useApiEffect } from "../../../provider/apiContext";
import { languageText } from "../../../components/submission/offered";

const PAGE_SIZE = 20;

const STATE_COLOUR: Record<JobState, string> = {
    queued: "gray",
    running: "blue",
    completed: "teal",
    failed: "red",
    cancelled: "gray",
    superseded: "gray",
};

const STATES: JobState[] = ["queued", "running", "completed", "failed", "cancelled"];

/**
 * Every submission in the installation, across activities.
 *
 * The filters are in the URL because this screen is what a manager sends someone
 * a link to — "look at this participant's attempts on B" is a filter, and it
 * should survive being pasted into a message.
 */
export default function ManagerSubmissionsPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const call = useApiCall();

    const [query, setQuery] = useSearchParams();
    const activityId = query.get("activity") ?? undefined;
    const seriesId = query.get("series") ?? undefined;
    const state = (query.get("state") ?? undefined) as JobState | undefined;
    const search = query.get("q") ?? "";
    const page = Number(query.get("page") ?? "1");

    const [items, setItems] = useState<ManagedSubmission[] | undefined>(undefined);
    const [total, setTotal] = useState(0);
    const [activities, setActivities] = useState<ManagedActivitySummary[]>([]);
    const [series, setSeries] = useState<ManagedSeries[]>([]);
    const [error, setError] = useState<string | undefined>(undefined);
    const [busy, setBusy] = useState(false);
    const [reload, setReload] = useState(0);

    const set = (patch: Record<string, string | undefined>) => {
        const next = new URLSearchParams(query);
        for (const [key, value] of Object.entries(patch)) {
            if (value) next.set(key, value);
            else next.delete(key);
        }
        // Any change to a filter invalidates the page number: page 3 of a
        // narrower result is usually empty, which reads as "nothing here".
        if (!("page" in patch)) next.delete("page");
        setQuery(next, { replace: true });
    };

    const loadError = useApiEffect(async (api) => {
        setActivities(await api.managerApi.getManagedActivities());
        // Series only make sense inside one activity, so the second filter
        // appears when the first is set rather than listing every series there is.
        setSeries(activityId ? await api.managerApi.getSeries(activityId) : []);

        setItems(undefined);
        const result = await api.managerApi.getSubmissions({
            page, pageSize: PAGE_SIZE,
            activityId, seriesId, state,
            search: search || undefined,
        });
        setItems(result.items);
        setTotal(result.total);

        api.managerApi.eventDispatcher.addEventListener("submissionChanged", evt => {
            // Patched in place rather than refetched: a rejudge that walks
            // through queued and running would otherwise reload the page three
            // times while a manager is reading it.
            setItems(current => current?.map(s => s.id === evt.data.submission.id ? evt.data.submission : s));
        });
    }, [activityId, seriesId, state, search, page, reload]);

    const rejudge = async (operation: () => Promise<unknown>) => {
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

    return (
        <Stack gap="md">
            <Group justify="space-between" wrap="wrap">
                <Stack gap={2}>
                    <Title>{t("Submissions")}</Title>
                    <Text size="sm" c="dimmed">
                        {t("A rejudge adds an attempt; it never rewrites the one that was shown.")}
                    </Text>
                </Stack>
                {seriesId && (
                    <Button
                        variant="light"
                        leftSection={<IconRefresh size={16} />}
                        loading={busy}
                        onClick={() => rejudge(async () => {
                            const count = await call(api => api.managerApi.rejudgeSeries(seriesId));
                            setError(`${t("Queued a rejudge of")} ${count} ${t("submissions.short")}`);
                        })}
                    >
                        {t("Rejudge this series")}
                    </Button>
                )}
            </Group>

            {error && <Alert color="blue" withCloseButton onClose={() => setError(undefined)}>{error}</Alert>}

            <Group gap="md" wrap="wrap">
                <TextInput
                    placeholder={t("Search by user or problem")}
                    leftSection={<IconSearch size={16} />}
                    value={search}
                    onChange={e => set({ q: e.currentTarget.value })}
                    w={260}
                />
                <Select
                    placeholder={t("Every activity")}
                    data={activities.map(a => ({ value: a.id, label: a.name }))}
                    value={activityId ?? null}
                    onChange={v => set({ activity: v ?? undefined, series: undefined })}
                    clearable
                    searchable
                    w={240}
                />
                <Select
                    placeholder={t("Every series")}
                    data={series.map(s => ({ value: s.id, label: s.name }))}
                    value={seriesId ?? null}
                    onChange={v => set({ series: v ?? undefined })}
                    clearable
                    disabled={!activityId}
                    w={220}
                />
                <Select
                    placeholder={t("Every state")}
                    data={STATES.map(s => ({ value: s, label: t(`jobState.${s}`) }))}
                    value={state ?? null}
                    onChange={v => set({ state: v ?? undefined })}
                    clearable
                    w={180}
                />
            </Group>

            <Table.ScrollContainer minWidth={980}>
                <Table striped highlightOnHover>
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th>{t("Date")}</Table.Th>
                            <Table.Th>{t("User")}</Table.Th>
                            <Table.Th>{t("Problem")}</Table.Th>
                            <Table.Th>{t("Language")}</Table.Th>
                            <Table.Th>{t("State")}</Table.Th>
                            <Table.Th>{t("Verdict")}</Table.Th>
                            <Table.Th>{t("Score")}</Table.Th>
                            <Table.Th />
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {items.map(submission => (
                            <Table.Tr key={submission.id}>
                                <Table.Td>
                                    {/* The date opens the submission: it is what
                                        names a submission, the way a title names
                                        a problem. The button stays. */}
                                    <span
                                        style={{ cursor: "pointer" }}
                                        onClick={() => navigate(`/manager/submissions/${submission.id}`)}
                                    >
                                        <ActivityTime value={submission.submittedAt} timeZone="Europe/Warsaw" hideZone />
                                    </span>
                                </Table.Td>
                                <Table.Td><Text size="sm">{submission.userName}</Text></Table.Td>
                                <Table.Td>
                                    <Stack gap={0}>
                                        <Text size="sm">[{submission.problemSlug}] {submission.problemName}</Text>
                                        <Text size="xs" c="dimmed">{submission.activitySlug} · {submission.seriesName}</Text>
                                    </Stack>
                                </Table.Td>
                                <Table.Td><Text size="sm">{languageText(submission.props)}</Text></Table.Td>
                                <Table.Td>
                                    <Group gap={4} wrap="nowrap">
                                        <Badge variant="light" color={STATE_COLOUR[submission.state]}>
                                            {t(`jobState.${submission.state}`)}
                                        </Badge>
                                        {submission.attempts > 1 && (
                                            <Tooltip label={t("Attempts")}>
                                                <Badge variant="outline" color="gray" size="sm">×{submission.attempts}</Badge>
                                            </Tooltip>
                                        )}
                                        {/* On the list because a judge scanning
                                            two hundred rows should see which
                                            were ruled out without opening each. */}
                                        {submission.excluded && (
                                            <Tooltip label={t("Not counted in the ranking")}>
                                                <Badge variant="light" color="orange" size="sm">
                                                    {t("Not counted")}
                                                </Badge>
                                            </Tooltip>
                                        )}
                                    </Group>
                                </Table.Td>
                                <Table.Td><Text size="sm">{submission.verdict ?? "—"}</Text></Table.Td>
                                <Table.Td>
                                    <Text size="sm">
                                        {submission.score === undefined
                                            ? "—"
                                            : `${submission.score} / ${submission.maxScore ?? 100}`}
                                    </Text>
                                </Table.Td>
                                <Table.Td>
                                    <Group gap="xs" justify="flex-end" wrap="nowrap">
                                        <Button
                                            variant="light"
                                            size="compact-sm"
                                            onClick={() => navigate(`/manager/submissions/${submission.id}`)}
                                        >
                                            {t("Open")}
                                        </Button>
                                        <Tooltip label={t("Rejudge")}>
                                            <Button
                                                variant="subtle"
                                                size="compact-sm"
                                                loading={busy}
                                                onClick={() => rejudge(() =>
                                                    call(api => api.managerApi.rejudgeSubmission(submission.id)))}
                                            >
                                                <IconRefresh size={14} />
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
                <Pagination
                    total={Math.ceil(total / PAGE_SIZE)}
                    value={page}
                    onChange={value => set({ page: String(value) })}
                />
            </Group>
        </Stack>
    );
}
