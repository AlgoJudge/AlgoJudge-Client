import {
    Alert, Badge, Button, Group, MultiSelect, Pagination, Select, Stack, Table, TagsInput, Text,
    TextInput, Title, Tooltip,
} from "@mantine/core";
import { IconRefresh, IconSearch } from "@tabler/icons-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Grant, ManagedActivitySummary, ManagedSeries, ManagedSubmission } from "../../../api/ManagerApi";
import { joined, listed, repeated } from "../filterParams";
import { JobState } from "../../../api/ParticipantApi";
import LoadState from "../../../components/LoadState";
import ActivityTime from "../../../components/time/ActivityTime";
import { useApiCall, useApiEffect } from "../../../provider/apiContext";
import { languageText } from "../../../components/submission/offered";
import DataTable from "../../../components/table/DataTable";
import { applied, useReload } from "../../../utils/live";

const PAGE_SIZE = 20;

const STATE_COLOR: Record<JobState, string> = {
    queued: "gray",
    running: "blue",
    completed: "teal",
    failed: "red",
    canceled: "gray",
    superseded: "gray",
};

const STATES: JobState[] = ["queued", "running", "completed", "failed", "canceled"];

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
    // Read through `useMemo` so each list keeps its identity between renders.
    // A fresh array every render is a fresh dependency every render, and the
    // effect below would refetch for ever; `query` changes only when the
    // address does, which is exactly when a filter has moved.
    const seriesIds = useMemo(() => listed(query.get("series")), [query]);
    const problemIds = useMemo(() => listed(query.get("problem")), [query]);
    const userIds = useMemo(() => listed(query.get("user")), [query]);
    const states = useMemo(() => listed(query.get("state")) as JobState[], [query]);
    const verdicts = useMemo(() => repeated(query, "verdict"), [query]);
    const search = query.get("q") ?? "";
    const page = Number(query.get("page") ?? "1");

    const [items, setItems] = useState<ManagedSubmission[] | undefined>(undefined);
    const [total, setTotal] = useState(0);
    const [activities, setActivities] = useState<ManagedActivitySummary[]>([]);
    const [series, setSeries] = useState<ManagedSeries[]>([]);
    /**
     * The activity's roster, for the participant filter.
     *
     * From the grants rather than from `searchUsers`: that one asks for
     * `user:read:all` at system scope, which the shipped manager template does
     * not carry, and it would offer every account in the installation rather
     * than the people in this course.
     */
    const [roster, setRoster] = useState<Grant[]>([]);
    const [error, setError] = useState<string | undefined>(undefined);
    const [busy, setBusy] = useState(false);
    const [reload, setReload] = useState(0);
    const [live, again] = useReload();

    const set = (patch: Record<string, string | string[] | undefined>) => {
        const next = new URLSearchParams(query);
        for (const [key, value] of Object.entries(patch)) {
            // An array is repeated keys rather than one joined value. Only the
            // verdict needs it, and it needs it because it is the one filter
            // whose values the Server does not own — see `filterParams`.
            if (Array.isArray(value)) {
                next.delete(key);
                for (const one of value) next.append(key, one);
            } else if (value) {
                next.set(key, value);
            } else {
                next.delete(key);
            }
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

        // A trimmed role may hold `submission:read:all` and not `grant:read:all`.
        // The participant filter is then simply not offered, which is better
        // than a screen that fails to load because one control could not be
        // filled.
        setRoster(activityId
            ? await api.managerApi
                .getGrants({ activityId, pageSize: 200 })
                .then(page => page.items, () => [])
            : []);

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
        const result = await api.managerApi.getSubmissions({
            page, pageSize: PAGE_SIZE,
            activityId, seriesIds, seriesProblemIds: problemIds, userIds, states, verdicts,
            search: search || undefined,
        });
        setItems(result.items);
        setTotal(result.total);

        api.managerApi.eventDispatcher.addEventListener("submissionChanged", evt => {
            // Patched in place rather than refetched: a rejudge that walks
            // through queued and running would otherwise reload the page three
            // times while a manager is reading it.
            // **And a submission that has just been made arrives here too.**
            // The Server sends this event from one place, on creation as well
            // as on every change, so a `map` alone left a manager watching a
            // list that never grew.
            setItems(current => applied(current, evt.data.submission, again));
        });
    }, [activityId, seriesIds, problemIds, userIds, states, verdicts, search, page, reload, live, again]);

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
            {/* **A refetch that fails has to say so.** The guard above only
                catches a first load, now that the list is no longer blanked, so
                without this a filter change that lost the connection would leave
                the previous rows on screen looking current. */}
            {loadError !== undefined && <LoadState error={loadError} loading={false} />}
            <Group justify="space-between" wrap="wrap">
                <Stack gap={2}>
                    <Title>{t("Submissions")}</Title>
                    <Text size="sm" c="dimmed">
                        {t("A rejudge adds an attempt; it never rewrites the one that was shown.")}
                    </Text>
                </Stack>
                {/* **One round, not several.** A rejudge of a round is an action on
                    that round, and the endpoint takes one; offering it while two
                    are narrowed to would either queue twice or quietly pick one.
                    Narrowing to a single round brings it back. */}
                {seriesIds.length === 1 && (
                    <Button
                        variant="light"
                        leftSection={<IconRefresh size={16} />}
                        loading={busy}
                        onClick={() => rejudge(async () => {
                            const count = await call(api => api.managerApi.rejudgeSeries(seriesIds[0]));
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
                {/* **The activity stays a single Select.** It is the scope the
                    Server asks the permission at, not a filter, so several of
                    them would be a different question rather than a wider one.
                    Everything narrowed inside it is cleared with it. */}
                <Select
                    placeholder={t("Every activity")}
                    data={activities.map(a => ({ value: a.id, label: a.name }))}
                    value={activityId ?? null}
                    onChange={v => set({
                        activity: v ?? undefined,
                        series: undefined, problem: undefined, user: undefined,
                    })}
                    data-testid="submission-activity"
                    clearable
                    searchable
                    w={240}
                />
                <MultiSelect
                    placeholder={seriesIds.length === 0 ? t("Every series") : undefined}
                    data={series.map(s => ({ value: s.id, label: s.name }))}
                    value={seriesIds}
                    onChange={v => set({ series: joined(v) })}
                    data-testid="submission-series"
                    clearable
                    disabled={!activityId}
                    w={220}
                />
                {/* The assignment, which is what the Server narrows on and what
                    the row's Problem column shows. Grouped by round, because two
                    rounds may both call something A. */}
                <MultiSelect
                    placeholder={problemIds.length === 0 ? t("Every problem") : undefined}
                    data={series.map(round => ({
                        group: round.name,
                        items: (round.problems ?? []).map(p => ({
                            value: p.id,
                            label: `[${p.slug}] ${p.name ?? p.problemName}`,
                        })),
                    }))}
                    value={problemIds}
                    onChange={v => set({ problem: joined(v) })}
                    data-testid="submission-problem"
                    clearable
                    searchable
                    disabled={!activityId}
                    w={240}
                />
                <MultiSelect
                    placeholder={userIds.length === 0 ? t("Everybody") : undefined}
                    data={roster.map(g => ({
                        value: g.userId,
                        label: `${g.userName} (${g.userLogin})`,
                    }))}
                    value={userIds}
                    onChange={v => set({ user: joined(v) })}
                    data-testid="submission-user"
                    clearable
                    searchable
                    disabled={!activityId}
                    w={260}
                />
                <MultiSelect
                    placeholder={states.length === 0 ? t("Every state") : undefined}
                    data={STATES.map(s => ({ value: s, label: t(`jobState.${s}`) }))}
                    value={states}
                    onChange={v => set({ state: joined(v) })}
                    data-testid="submission-state"
                    clearable
                    w={180}
                />
                {/* **Free text, and a sample rather than a catalog.** A verdict
                    is a label the Runner produced and the Server stores without
                    ever parsing, so that a problem type may invent one without a
                    Server release — which means there is no list of them to
                    fetch. The suggestions are what the rows on screen carry,
                    plus whatever is already chosen so a selection never
                    disappears from its own control. */}
                <TagsInput
                    placeholder={verdicts.length === 0 ? t("Every verdict") : undefined}
                    description={t("Suggested from the rows on screen; any verdict may be typed")}
                    data={[...new Set([
                        ...items.map(i => i.verdict).filter((v): v is string => Boolean(v)),
                        ...verdicts,
                    ])]}
                    value={verdicts}
                    onChange={v => set({ verdict: v })}
                    data-testid="submission-verdict"
                    clearable
                    w={260}
                />
            </Group>

            <DataTable minWidth={980} striped highlightOnHover>
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
                                    <ActivityTime value={submission.submittedAt} timeZone={submission.timeZone} />
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
                                    <Badge variant="light" color={STATE_COLOR[submission.state]}>
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
            </DataTable>

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
