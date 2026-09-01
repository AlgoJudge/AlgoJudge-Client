import {
    Accordion, Alert, Badge, Button, Card, Grid, Group, Modal, NumberInput, Select, Stack, Switch,
    Table, TagsInput, Text, TextInput, Title, Tooltip,
} from "@mantine/core";
import {
    IconAlertTriangle, IconArrowDown, IconArrowUp, IconCopy, IconPlus, IconTrash,
} from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
    DEFAULT_IMPORTANCE_SCOPE, NORMAL_IMPORTANCE, SERIES_IMPORTANCE_RANKS,
    SERIES_IMPORTANCE_SCOPES, SeriesImportanceScope,
} from "../../../../api/seriesImportance";
import { DEFAULT_RUNNER_TAG, MAX_RUNNER_TAGS } from "../../../../api/runnerTags";
import {
    ManagedActivity, ManagedProblem, ManagedProblemVersion, ManagedSeries, ManagedSeriesProblem,
    SeriesInput, SeriesProblemInput,
} from "../../../../api/ManagerApi";
import { problemEditing } from "../../../../renderers";
import ZonedDateTimeInput from "../../../../components/time/ZonedDateTimeInput";
import CleanCopyModal from "../../../../components/copy/CleanCopyModal";
import ExportButton from "../../../../components/exchange/ExportButton";
import { collectSeries } from "../../../../exchange/collect";
import { useApiCall } from "../../../../provider/apiContext";
import PauseSeriesModal, { PauseIntent } from "./PauseSeriesModal";
import ShiftSeries from "./ShiftSeries";
import OpaqueDocumentField from "../../../../components/manager/OpaqueDocumentField";

/**
 * Series and what is attached to them.
 *
 * The two live together because they are edited together: a series with no
 * problems is not yet a round, and an assignment outside a series has nowhere to
 * be. Ordering is by button rather than by drag — a keyboard reaches it, and a
 * round order is set once and left alone.
 */

const MB = 1024 * 1024;

/**
 * What each rank is called.
 *
 * Written out in full, so `check:i18n` can see them: a key assembled from a
 * rank would be a translation nothing checks, and a missing one renders as
 * English on a Polish screen with nothing else noticing. A rank this does not
 * know shows as its own number, which is the honest answer and keeps an unknown
 * one from breaking the select.
 */
const importanceName = (rank: number, t: (key: string) => string): string => {
    switch (rank) {
        case 0: return t("Ordinary");
        case 10: return t("Warm-up in class");
        case 20: return t("Contest in class");
        case 30: return t("Exam or midterm");
        case 40: return t("Trial round of a real contest");
        case 50: return t("Official contest");
        default: return String(rank);
    }
};

/**
 * What each scope is called. Written out for the same reason the ranks are:
 * `check:i18n` reads only calls it can see.
 */
const scopeName = (scope: SeriesImportanceScope, t: (key: string) => string): string =>
    scope === "installation" ? t("Across the whole system") : t("Within this activity only");

const emptySeries = (): SeriesInput => ({
    slug: "", name: "", revealProblemCount: true,
    importance: NORMAL_IMPORTANCE, importanceScope: DEFAULT_IMPORTANCE_SCOPE,
    addressRules: [], restrictionsEnabled: true,
    // Absent, not empty: a new round inherits its activity's Runners.
    runnerTags: undefined,
});

const toSeriesInput = (series: ManagedSeries): SeriesInput => ({
    slug: series.slug,
    name: series.name,
    startDate: series.startDate,
    endDate: series.endDate,
    revealProblemCount: series.revealProblemCount,
    rankingFreezeAt: series.rankingFreezeAt,
    rankingRevealAt: series.rankingRevealAt,
    rankingVisibleFrom: series.rankingVisibleFrom,
    rankingVisibleTo: series.rankingVisibleTo,
    importance: series.importance,
    importanceScope: series.importanceScope,
    addressRules: series.addressRules,
    restrictionsEnabled: series.restrictionsEnabled,
    runnerTags: series.runnerTags,
});

const toAssignmentInput = (assignment: ManagedSeriesProblem): SeriesProblemInput => ({
    problemId: assignment.problemId,
    slug: assignment.slug,
    name: assignment.name,
    pinnedProblemVersionId: assignment.pinnedProblemVersionId,
    config: assignment.config,
    spec: assignment.spec,
    props: assignment.props,
    maxPoints: assignment.maxPoints,
    maxUploadBytes: assignment.maxUploadBytes,
    maxAttachments: assignment.maxAttachments,
    maxSubmissions: assignment.maxSubmissions,
});

export interface SeriesPanelProps {
    activity: ManagedActivity;
    series: ManagedSeries[];
    problems: ManagedProblem[];
    onChanged: () => void;
    onError: (message: string) => void;
}

export default function SeriesPanel({ activity, series, problems, onChanged, onError }: SeriesPanelProps) {
    const { t } = useTranslation();
    const call = useApiCall();

    const [busy, setBusy] = useState(false);
    const [drafts, setDrafts] = useState<Record<string, SeriesInput>>({});
    const [creating, setCreating] = useState<SeriesInput | undefined>(undefined);
    const [attachTo, setAttachTo] = useState<ManagedSeries | undefined>(undefined);
    const [attachment, setAttachment] = useState<SeriesProblemInput | undefined>(undefined);
    const [editing, setEditing] = useState<ManagedSeriesProblem | undefined>(undefined);
    const [versions, setVersions] = useState<ManagedProblemVersion[]>([]);
    /** Which series is being stopped or started again, and which of the two it is. */
    const [pausing, setPausing] = useState<PauseIntent | undefined>(undefined);
    const [copying, setCopying] = useState<ManagedSeries | undefined>(undefined);
    const [targets, setTargets] = useState<{ value: string; label: string }[]>([]);

    const locked = activity.archivedAt !== undefined;

    const run = async (operation: () => Promise<unknown>) => {
        setBusy(true);
        try {
            await operation();
            onChanged();
        } catch (e) {
            onError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    };

    const draftFor = (s: ManagedSeries) => drafts[s.id] ?? toSeriesInput(s);
    const setDraft = (s: ManagedSeries, patch: Partial<SeriesInput>) =>
        setDrafts({ ...drafts, [s.id]: { ...draftFor(s), ...patch } });

    const move = (index: number, delta: number) => {
        const ids = series.map(s => s.id);
        const target = index + delta;
        if (target < 0 || target >= ids.length) return;
        [ids[index], ids[target]] = [ids[target], ids[index]];
        run(() => call(api => api.managerApi.reorderSeries(activity.id, ids)));
    };

    const moveProblem = (s: ManagedSeries, index: number, delta: number) => {
        const ids = s.problems.map(p => p.id);
        const target = index + delta;
        if (target < 0 || target >= ids.length) return;
        [ids[index], ids[target]] = [ids[target], ids[index]];
        run(() => call(api => api.managerApi.reorderSeriesProblems(s.id, ids)));
    };

    /**
     * The activities a copy could go into, fetched when one is being made.
     *
     * **Archived ones are absent** because the Server refuses them, and a target
     * offered and then refused is worse than one never offered. This activity is
     * in the list: copying a round in place is how a second sitting is made, and
     * the assignment slugs are freed for it.
     */
    const openCopy = async (target: ManagedSeries) => {
        setCopying(target);
        const page = await call(api => api.managerApi.getActivities({ page: 1, pageSize: 100 }));
        setTargets(page.items.map(a => ({ value: a.id, label: `${a.name} (${a.slug})` })));
    };

    /** Version history is fetched only when a pin is being chosen. */
    const openAttach = async (target: ManagedSeries, existing?: ManagedSeriesProblem) => {
        setAttachTo(target);
        setEditing(existing);
        setAttachment(existing ? toAssignmentInput(existing) : { problemId: "", slug: "" });
        setVersions(existing ? await call(api => api.managerApi.getProblemVersions(existing.problemId)) : []);
    };

    const pickProblem = async (problemId: string) => {
        const problem = problems.find(p => p.id === problemId);
        setAttachment({
            ...(attachment ?? { problemId: "", slug: "" }),
            problemId,
            // The library slug is the default label, which is what a manager
            // usually wants and always overrides for a lettered contest.
            slug: attachment?.slug || problem?.slug || "",
            pinnedProblemVersionId: undefined,
        });
        setVersions(await call(api => api.managerApi.getProblemVersions(problemId)));
    };

    const saveAttachment = () => {
        if (!attachTo || !attachment?.problemId) return;
        run(async () => {
            await call(api => editing
                ? api.managerApi.updateSeriesProblem(editing.id, attachment)
                : api.managerApi.attachProblem(attachTo.id, attachment));
            setAttachTo(undefined);
            setAttachment(undefined);
            setEditing(undefined);
        });
    };

    return (
        <Stack gap="md">
            <Group justify="space-between" wrap="wrap">
                <Text size="sm" c="dimmed">
                    {t("A series is a round, a week or a class. The label comes from the activity type.")}
                </Text>
                <Button
                    leftSection={<IconPlus size={16} />}
                    disabled={locked}
                    onClick={() => setCreating(emptySeries())}
                >
                    {t("New series")}
                </Button>
            </Group>

            {series.length === 0 && (
                <Alert color="blue">{t("No series yet. An activity holds its problems in series.")}</Alert>
            )}

            {series.length > 0 && (
                <ShiftSeries
                    series={series}
                    timeZone={activity.timeZone}
                    disabled={locked}
                    busy={busy}
                    onShift={(seriesId, minutes) =>
                        run(() => call(api => api.managerApi.shiftSeries(seriesId, minutes)))}
                />
            )}

            <Accordion variant="separated" multiple defaultValue={series.map(s => s.id)}>
                {series.map((s, index) => (
                    <Accordion.Item key={s.id} value={s.id}>
                        {/* The button sits **beside** the control, not inside
                            it: a button within a button is invalid, and giving
                            it a div instead would take it off the keyboard. */}
                        <Group wrap="nowrap" gap="xs" pr="md">
                        <Accordion.Control>
                            <Group justify="space-between" wrap="wrap" pr="md">
                                <Group gap="xs">
                                    <Text fw={500}>{s.name}</Text>
                                    <Text size="xs" c="dimmed" ff="monospace">{s.slug}</Text>
                                    <Badge variant="light" size="sm">
                                        {s.problems.length} {t("problems.short")}
                                    </Badge>
                                    {s.rankingFreezeAt && (
                                        <Badge variant="light" color="blue" size="sm">{t("Freeze set")}</Badge>
                                    )}
                                    {!s.revealProblemCount && (
                                        <Badge variant="light" color="gray" size="sm">{t("Count hidden")}</Badge>
                                    )}
                                    {s.pausedAt ? (
                                        <Badge variant="filled" color="orange" size="sm">{t("Paused")}</Badge>
                                    ) : s.isOpen ? (
                                        <Badge variant="light" color="teal" size="sm">{t("Running")}</Badge>
                                    ) : null}
                                </Group>
                            </Group>
                        </Accordion.Control>
                        {/* One click from the list: stopping a round should not
                            need the series opened first. */}
                        <Button data-testid="series-pause-toggle"
                            variant={s.pausedAt ? "filled" : "light"}
                            color={s.pausedAt ? "teal" : "orange"}
                            size="compact-sm"
                            disabled={locked}
                            onClick={() => setPausing({ series: s, resuming: s.pausedAt !== undefined })}
                        >
                            {s.pausedAt ? t("Resume") : t("Pause")}
                        </Button>
                        </Group>
                        <Accordion.Panel>
                            <Stack gap="md">
                                <Card withBorder radius="sm">
                                    <Grid>
                                        <Grid.Col span={{ base: 12, sm: 6 }}>
                                            <TextInput
                                                label={t("Name")}
                                                value={draftFor(s).name}
                                                onChange={e => setDraft(s, { name: e.currentTarget.value })}
                                                disabled={locked}
                                            />
                                        </Grid.Col>
                                        <Grid.Col span={{ base: 12, sm: 6 }}>
                                            <TextInput
                                                label={t("Slug")}
                                                value={draftFor(s).slug}
                                                onChange={e => setDraft(s, { slug: e.currentTarget.value })}
                                                disabled={locked}
                                            />
                                        </Grid.Col>
                                        <Grid.Col span={{ base: 12, sm: 6 }}>
                                            <ZonedDateTimeInput
                                                label={t("Opens")}
                                                value={draftFor(s).startDate}
                                                timeZone={activity.timeZone}
                                                onChange={startDate => setDraft(s, { startDate })}
                                                disabled={locked}
                                            />
                                        </Grid.Col>
                                        <Grid.Col span={{ base: 12, sm: 6 }}>
                                            <ZonedDateTimeInput
                                                label={t("Closes")}
                                                value={draftFor(s).endDate}
                                                timeZone={activity.timeZone}
                                                onChange={endDate => setDraft(s, { endDate })}
                                                disabled={locked}
                                            />
                                        </Grid.Col>
                                        {/* Four instants on one round, so each
                                            says what it does rather than when:
                                            the freeze hides late results within
                                            a board, the window decides whether
                                            there is a board at all. */}
                                        <Grid.Col span={{ base: 12, sm: 6 }}>
                                            <ZonedDateTimeInput
                                                label={t("Ranking visible from")}
                                                description={t("Empty means from this series' own start")}
                                                value={draftFor(s).rankingVisibleFrom}
                                                timeZone={activity.timeZone}
                                                onChange={rankingVisibleFrom => setDraft(s, { rankingVisibleFrom })}
                                                disabled={locked}
                                            />
                                        </Grid.Col>
                                        <Grid.Col span={{ base: 12, sm: 6 }}>
                                            <ZonedDateTimeInput
                                                label={t("Ranking visible until")}
                                                description={t("Empty means for ever")}
                                                value={draftFor(s).rankingVisibleTo}
                                                timeZone={activity.timeZone}
                                                onChange={rankingVisibleTo => setDraft(s, { rankingVisibleTo })}
                                                disabled={locked}
                                            />
                                        </Grid.Col>
                                        <Grid.Col span={{ base: 12, sm: 6 }}>
                                            <ZonedDateTimeInput
                                                label={t("Ranking freezes at")}
                                                value={draftFor(s).rankingFreezeAt}
                                                timeZone={activity.timeZone}
                                                onChange={rankingFreezeAt => setDraft(s, { rankingFreezeAt })}
                                                disabled={locked}
                                            />
                                        </Grid.Col>
                                        <Grid.Col span={{ base: 12, sm: 6 }}>
                                            <ZonedDateTimeInput
                                                label={t("Ranking revealed at")}
                                                description={t("Clear both to unfreeze now")}
                                                value={draftFor(s).rankingRevealAt}
                                                timeZone={activity.timeZone}
                                                onChange={rankingRevealAt => setDraft(s, { rankingRevealAt })}
                                                disabled={locked}
                                            />
                                        </Grid.Col>
                                    </Grid>
                                    {/* **What this round puts out of reach.**
                                        The rank prints its number, because the
                                        ordering is what the list means — a
                                        manager choosing one has to see what it
                                        loses to. */}
                                    <Grid mt="sm">
                                        <Grid.Col span={{ base: 12, md: 4 }}>
                                            <Select
                                                label={t("Importance")}
                                                description={t("While this round runs, anything of a lower importance is locked for whoever takes part in it.")}
                                                data={SERIES_IMPORTANCE_RANKS.map(rank => ({
                                                    value: String(rank),
                                                    label: `${importanceName(rank, t)} (${rank})`,
                                                }))}
                                                value={String(draftFor(s).importance ?? NORMAL_IMPORTANCE)}
                                                onChange={value => setDraft(s, { importance: Number(value) })}
                                                disabled={locked}
                                                allowDeselect={false}
                                            />
                                        </Grid.Col>
                                        {/* Disabled at `normal`, where it decides
                                            nothing: an enabled control that
                                            changes no outcome is a control
                                            somebody reads as broken. */}
                                        <Grid.Col span={{ base: 12, md: 3 }}>
                                            <Select
                                                label={t("Importance reaches")}
                                                description={t("Whether the lock reaches other activities the participant takes part in.")}
                                                data={SERIES_IMPORTANCE_SCOPES.map(scope => ({
                                                    value: scope,
                                                    label: scopeName(scope, t),
                                                }))}
                                                value={draftFor(s).importanceScope ?? DEFAULT_IMPORTANCE_SCOPE}
                                                onChange={value => setDraft(s, {
                                                    importanceScope: (value ?? DEFAULT_IMPORTANCE_SCOPE) as SeriesImportanceScope,
                                                })}
                                                disabled={locked
                                                    || (draftFor(s).importance ?? NORMAL_IMPORTANCE) === NORMAL_IMPORTANCE}
                                                allowDeselect={false}
                                            />
                                        </Grid.Col>
                                        <Grid.Col span={{ base: 12, md: 5 }}>
                                            <TextInput
                                                label={t("Reachable only from")}
                                                description={t("Address ranges, separated by commas, e.g. 10.0.5.0/24. Empty means anywhere. Elsewhere the round is not shown at all.")}
                                                placeholder="10.0.5.0/24"
                                                value={(draftFor(s).addressRules ?? [])
                                                    .map(rule => rule.network).join(", ")}
                                                onChange={e => setDraft(s, {
                                                    addressRules: e.currentTarget.value
                                                        .split(",")
                                                        .map(part => part.trim())
                                                        .filter(part => part.length > 0)
                                                        .map(network => ({ network })),
                                                })}
                                                disabled={locked}
                                            />
                                        </Grid.Col>
                                    </Grid>
                                    {/* **Two states, and a `TagsInput` alone
                                        cannot express them.** Empty and
                                        inherited would look identical in it,
                                        and they are the two things a manager
                                        most needs to tell apart — so the choice
                                        is made by the switch and the field only
                                        appears once it has been made. A round
                                        that wants the general Runners while its
                                        activity is pinned writes `default`. */}
                                    <Grid mt="sm">
                                        <Grid.Col span={{ base: 12, md: 5 }}>
                                            <Switch
                                                label={t("Judged by its own Runners")}
                                                description={t("Off, this round is judged by whatever the activity says.")}
                                                checked={draftFor(s).runnerTags !== undefined}
                                                onChange={e => setDraft(s, {
                                                    runnerTags: e.currentTarget.checked
                                                        ? [DEFAULT_RUNNER_TAG]
                                                        : undefined,
                                                })}
                                                disabled={locked}
                                            />
                                        </Grid.Col>
                                        {draftFor(s).runnerTags !== undefined && (
                                            <Grid.Col span={{ base: 12, md: 7 }}>
                                                <TagsInput
                                                    label={t("Runner tags")}
                                                    description={t("Runners reached: {{count}}", { count: s.matchingRunners })}
                                                    placeholder={t("e.g. lab-a")}
                                                    maxTags={MAX_RUNNER_TAGS}
                                                    value={draftFor(s).runnerTags ?? []}
                                                    onChange={runnerTags => setDraft(s, { runnerTags })}
                                                    disabled={locked}
                                                />
                                            </Grid.Col>
                                        )}
                                    </Grid>
                                    <Group justify="space-between" mt="sm" wrap="wrap">
                                        <Switch
                                            label={t("Reveal the problem count while closed")}
                                            checked={draftFor(s).revealProblemCount}
                                            onChange={e => setDraft(s, { revealProblemCount: e.currentTarget.checked })}
                                            disabled={locked}
                                        />
                                        {/* The switch for a wrong list on the
                                            day: it lifts the round's rank and
                                            its ranges at once and keeps both. */}
                                        <Switch
                                            label={t("Restrictions in force")}
                                            checked={draftFor(s).restrictionsEnabled !== false}
                                            onChange={e => setDraft(s, { restrictionsEnabled: e.currentTarget.checked })}
                                            disabled={locked}
                                        />
                                        <Group gap="xs">
                                            <Tooltip label={t("Move up")}>
                                                <Button variant="subtle" size="compact-sm" disabled={locked || index === 0} onClick={() => move(index, -1)}>
                                                    <IconArrowUp size={14} />
                                                </Button>
                                            </Tooltip>
                                            <Tooltip label={t("Move down")}>
                                                <Button variant="subtle" size="compact-sm" disabled={locked || index === series.length - 1} onClick={() => move(index, 1)}>
                                                    <IconArrowDown size={14} />
                                                </Button>
                                            </Tooltip>
                                            <Tooltip label={t("Copy this round")}>
                                                <Button
                                                    variant="subtle"
                                                    size="compact-sm"
                                                    aria-label={t("Copy this round")}
                                                    loading={busy}
                                                    onClick={() => openCopy(s)}
                                                >
                                                    <IconCopy size={14} />
                                                </Button>
                                            </Tooltip>
                                            <ExportButton
                                                compact
                                                label={t("Export this round")}
                                                filename={`algojudge-${activity.slug}-${s.slug}`}
                                                collect={api => collectSeries(api, activity.id, s.id)}
                                                onError={onError}
                                            />
                                            <Button
                                                variant="subtle"
                                                color="red"
                                                size="compact-sm"
                                                leftSection={<IconTrash size={14} />}
                                                disabled={locked || s.problems.some(p => p.submissionCount > 0)}
                                                loading={busy}
                                                onClick={() => run(() => call(api => api.managerApi.deleteSeries(s.id)))}
                                            >
                                                {t("Delete")}
                                            </Button>
                                            <Button data-testid="save"
                                                size="compact-sm"
                                                loading={busy}
                                                disabled={locked}
                                                onClick={() => run(() => call(api => api.managerApi.updateSeries(s.id, draftFor(s))))}
                                            >
                                                {t("Save")}
                                            </Button>
                                        </Group>
                                    </Group>
                                </Card>

                                <Group justify="space-between">
                                    <Title order={6}>{t("Problems")}</Title>
                                    <Button
                                        variant="light"
                                        size="compact-sm"
                                        leftSection={<IconPlus size={14} />}
                                        disabled={locked}
                                        onClick={() => openAttach(s)}
                                    >
                                        {t("Attach a problem")}
                                    </Button>
                                </Group>

                                <Table.ScrollContainer minWidth={760}>
                                    <Table striped>
                                        <Table.Thead>
                                            <Table.Tr>
                                                <Table.Th w={60}>#</Table.Th>
                                                <Table.Th>{t("Slug")}</Table.Th>
                                                <Table.Th>{t("Problem")}</Table.Th>
                                                <Table.Th>{t("Version")}</Table.Th>
                                                <Table.Th>{t("Limits")}</Table.Th>
                                                <Table.Th>{t("Submissions")}</Table.Th>
                                                <Table.Th />
                                            </Table.Tr>
                                        </Table.Thead>
                                        <Table.Tbody>
                                            {s.problems.map((assignment, position) => (
                                                <Table.Tr key={assignment.id}>
                                                    <Table.Td>
                                                        <Group gap={2} wrap="nowrap">
                                                            <Button variant="subtle" size="compact-xs" disabled={locked || position === 0} onClick={() => moveProblem(s, position, -1)}>
                                                                <IconArrowUp size={12} />
                                                            </Button>
                                                            <Button variant="subtle" size="compact-xs" disabled={locked || position === s.problems.length - 1} onClick={() => moveProblem(s, position, 1)}>
                                                                <IconArrowDown size={12} />
                                                            </Button>
                                                        </Group>
                                                    </Table.Td>
                                                    <Table.Td><Text fw={500} ff="monospace">{assignment.slug}</Text></Table.Td>
                                                    <Table.Td>
                                                        <Stack gap={0}>
                                                            <Text size="sm">{assignment.name ?? assignment.problemName}</Text>
                                                            <Text size="xs" c="dimmed" ff="monospace">{assignment.problemSlug}</Text>
                                                        </Stack>
                                                    </Table.Td>
                                                    <Table.Td>
                                                        <Group gap={4} wrap="nowrap">
                                                            {/* Attaching pins the version that was current at
                                                                the time (2026-08-08), so a pin is the ordinary
                                                                case and "follows the current one" is the rare
                                                                one. What matters is when the two have parted:
                                                                the library moved on and this round did not,
                                                                which is the whole reason to pin — and a badge
                                                                saying only "v2" leaves a manager unable to
                                                                tell that from "v2 is the newest". */}
                                                            {assignment.pinnedVersion
                                                                ? <Tooltip
                                                                    label={assignment.pinnedVersion === assignment.currentVersion
                                                                        ? t("Judged against the newest version")
                                                                        : t("Judged against v{{pinned}}; the problem is now at v{{current}}",
                                                                            { pinned: assignment.pinnedVersion, current: assignment.currentVersion })}>
                                                                    <Badge
                                                                        variant="light"
                                                                        size="sm"
                                                                        color={assignment.pinnedVersion === assignment.currentVersion ? undefined : "orange"}>
                                                                        v{assignment.pinnedVersion}
                                                                        {assignment.pinnedVersion !== assignment.currentVersion
                                                                            && ` / v${assignment.currentVersion}`}
                                                                    </Badge>
                                                                </Tooltip>
                                                                : <Badge variant="outline" color="gray" size="sm">
                                                                    {t("current")} (v{assignment.currentVersion})
                                                                </Badge>}
                                                            {/* Nothing judges without a package, and the
                                                                time to learn that is before the round
                                                                opens — **unless the type has none to
                                                                begin with**. A `uva@1` problem is judged
                                                                by the archive, and wore this warning on
                                                                every round it was ever attached to. */}
                                                            {!assignment.hasPackage
                                                                && problemEditing.resolve(
                                                                    problems.find(one => one.id === assignment.problemId)?.type,
                                                                ).value.package && (
                                                                <Tooltip label={t("No package: nothing can be judged")}>
                                                                    <Badge variant="light" color="red" size="sm" leftSection={<IconAlertTriangle size={11} />}>
                                                                        {t("Missing")}
                                                                    </Badge>
                                                                </Tooltip>
                                                            )}
                                                        </Group>
                                                    </Table.Td>
                                                    <Table.Td>
                                                        <Text size="xs" c="dimmed">
                                                            {assignment.maxUploadBytes
                                                                ? `${Math.round(assignment.maxUploadBytes / MB)} MB`
                                                                : t("inherited")}
                                                            {assignment.maxSubmissions !== undefined && ` · ${assignment.maxSubmissions}×`}
                                                            {assignment.maxPoints !== undefined && ` · ${assignment.maxPoints} ${t("pts")}`}
                                                        </Text>
                                                    </Table.Td>
                                                    <Table.Td><Text size="sm">{assignment.submissionCount}</Text></Table.Td>
                                                    <Table.Td>
                                                        <Group gap="xs" justify="flex-end" wrap="nowrap">
                                                            <Button variant="light" size="compact-sm" disabled={locked} onClick={() => openAttach(s, assignment)}>
                                                                {t("Edit")}
                                                            </Button>
                                                            <Tooltip label={assignment.submissionCount > 0
                                                                ? t("Something has been submitted here — it cannot be removed")
                                                                : t("Detach")}>
                                                                <Button
                                                                    variant="subtle"
                                                                    color="red"
                                                                    size="compact-sm"
                                                                    disabled={locked || assignment.submissionCount > 0}
                                                                    loading={busy}
                                                                    onClick={() => run(() => call(api => api.managerApi.detachProblem(assignment.id)))}
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

                                {s.problems.length === 0 && (
                                    <Text size="sm" c="dimmed">{t("Nothing attached yet")}</Text>
                                )}
                            </Stack>
                        </Accordion.Panel>
                    </Accordion.Item>
                ))}
            </Accordion>

            <Modal
                opened={creating !== undefined}
                onClose={() => setCreating(undefined)}
                title={<Title order={4}>{t("New series")}</Title>}
                centered
            >
                {creating && (
                    <Stack gap="sm">
                        <TextInput
                            label={t("Name")}
                            value={creating.name}
                            onChange={e => setCreating({ ...creating, name: e.currentTarget.value })}
                            required
                        />
                        <TextInput
                            label={t("Slug")}
                            description={t("Unique within this activity")}
                            value={creating.slug}
                            onChange={e => setCreating({ ...creating, slug: e.currentTarget.value })}
                            required
                        />
                        <ZonedDateTimeInput
                            label={t("Opens")}
                            value={creating.startDate}
                            timeZone={activity.timeZone}
                            onChange={startDate => setCreating({ ...creating, startDate })}
                        />
                        <ZonedDateTimeInput
                            label={t("Closes")}
                            value={creating.endDate}
                            timeZone={activity.timeZone}
                            onChange={endDate => setCreating({ ...creating, endDate })}
                        />
                        <Group justify="space-between">
                            <Button data-testid="back" variant="default" onClick={() => setCreating(undefined)}>{t("Back")}</Button>
                            <Button data-testid="save"
                                loading={busy}
                                onClick={() => run(async () => {
                                    await call(api => api.managerApi.createSeries(activity.id, creating));
                                    setCreating(undefined);
                                })}
                            >
                                {t("Save")}
                            </Button>
                        </Group>
                    </Stack>
                )}
            </Modal>

            <Modal
                opened={attachTo !== undefined}
                onClose={() => { setAttachTo(undefined); setEditing(undefined); }}
                title={<Title order={4}>{editing ? t("Edit the assignment") : t("Attach a problem")}</Title>}
                centered
                size="lg"
            >
                {attachment && (
                    <Stack gap="sm">
                        <Select
                            label={t("Problem")}
                            placeholder={t("Search by name or slug")}
                            data={problems.map(p => ({ value: p.id, label: `${p.name} (${p.slug})` }))}
                            value={attachment.problemId || null}
                            onChange={v => v && pickProblem(v)}
                            searchable
                            disabled={editing !== undefined}
                            required
                        />
                        <Grid>
                            <Grid.Col span={{ base: 12, sm: 6 }}>
                                <TextInput
                                    label={t("Slug in this activity")}
                                    description={t("What a participant sees, for example A. Unique across the activity.")}
                                    value={attachment.slug}
                                    onChange={e => setAttachment({ ...attachment, slug: e.currentTarget.value })}
                                    required
                                />
                            </Grid.Col>
                            <Grid.Col span={{ base: 12, sm: 6 }}>
                                <TextInput
                                    label={t("Name in this activity")}
                                    description={t("Empty keeps the library's name")}
                                    value={attachment.name ?? ""}
                                    onChange={e => setAttachment({ ...attachment, name: e.currentTarget.value || undefined })}
                                />
                            </Grid.Col>
                        </Grid>
                        <Select
                            label={t("Statement version")}
                            description={t("Pin one so a running series cannot change underneath it")}
                            data={[
                                { value: "", label: t("Always the current one") },
                                ...versions.map(v => ({
                                    value: v.id,
                                    label: `v${v.version}${v.note ? ` — ${v.note}` : ""}${v.hasPackage ? "" : ` (${t("no package")})`}`,
                                })),
                            ]}
                            value={attachment.pinnedProblemVersionId ?? ""}
                            onChange={v => setAttachment({ ...attachment, pinnedProblemVersionId: v || undefined })}
                        />
                        <Grid>
                            <Grid.Col span={{ base: 12, sm: 3 }}>
                                <NumberInput
                                    label={t("Worth")}
                                    description={t("Points here, empty keeps the problem's own")}
                                    min={1}
                                    value={attachment.maxPoints ?? ""}
                                    onChange={v => setAttachment({
                                        ...attachment,
                                        maxPoints: typeof v === "number" ? v : undefined,
                                    })}
                                />
                            </Grid.Col>
                            <Grid.Col span={{ base: 12, sm: 3 }}>
                                <NumberInput
                                    label={t("Maximum upload")}
                                    description={t("MB, empty inherits")}
                                    min={1}
                                    value={attachment.maxUploadBytes ? Math.round(attachment.maxUploadBytes / MB) : ""}
                                    onChange={v => setAttachment({
                                        ...attachment,
                                        maxUploadBytes: typeof v === "number" ? v * MB : undefined,
                                    })}
                                />
                            </Grid.Col>
                            <Grid.Col span={{ base: 12, sm: 3 }}>
                                <NumberInput
                                    label={t("Files per submission")}
                                    description={t("Empty inherits")}
                                    min={1}
                                    value={attachment.maxAttachments ?? ""}
                                    onChange={v => setAttachment({
                                        ...attachment,
                                        maxAttachments: typeof v === "number" ? v : undefined,
                                    })}
                                />
                            </Grid.Col>
                            <Grid.Col span={{ base: 12, sm: 3 }}>
                                <NumberInput
                                    label={t("Submissions")}
                                    description={t("Empty inherits")}
                                    min={1}
                                    value={attachment.maxSubmissions ?? ""}
                                    onChange={v => setAttachment({
                                        ...attachment,
                                        maxSubmissions: typeof v === "number" ? v : undefined,
                                    })}
                                />
                            </Grid.Col>
                        </Grid>
                        {/*
                          * **The three documents this assignment carries**, each
                          * with one reader. The Server stores all three and reads
                          * none of them; what is inside is the problem type's
                          * vocabulary, which is why these are text areas and not
                          * forms.
                          */}
                        <OpaqueDocumentField
                            label={t("Configuration")}
                            description={t("What changes the verdict: limits, and the languages that may be submitted. Laid over the package's own.")}
                            placeholder={'{ "type": "standard-io@1", "languages": ["cpp20-gcc", "python3"], "limits": { "timeMs": 1000, "memoryBytes": 268435456 } }'}
                            value={attachment.config}
                            onChange={config => setAttachment({ ...attachment, config })}
                        />
                        <OpaqueDocumentField
                            label={t("Submit form")}
                            description={t("What the submit form offers. Where this and the configuration disagree about languages, the configuration is what happens.")}
                            placeholder={'{ "type": "standard-io@1", "languages": ["cpp20-gcc", "python3"] }'}
                            value={attachment.spec}
                            onChange={spec => setAttachment({ ...attachment, spec })}
                        />
                        <OpaqueDocumentField
                            label={t("Display")}
                            description={t("Shown above the statement. Wrong here means an untidy page and nothing else.")}
                            placeholder={'{ "type": "standard-io@1", "languages": "C++20 (GCC), Python 3" }'}
                            value={attachment.props}
                            onChange={props => setAttachment({ ...attachment, props })}
                        />
                        <Group justify="space-between">
                            <Button data-testid="back" variant="default" onClick={() => { setAttachTo(undefined); setEditing(undefined); }}>
                                {t("Back")}
                            </Button>
                            <Button data-testid="save" loading={busy} onClick={saveAttachment}>{t("Save")}</Button>
                        </Group>
                    </Stack>
                )}
            </Modal>

            <PauseSeriesModal
                intent={pausing}
                busy={busy}
                onClose={() => setPausing(undefined)}
                onPause={(seriesId, hideProblems) => {
                    setPausing(undefined);
                    run(() => call(api => api.managerApi.pauseSeries(seriesId, { hideProblems })));
                }}
                onResume={(seriesId, extendEnd) => {
                    setPausing(undefined);
                    run(() => call(api => api.managerApi.resumeSeries(seriesId, { extendEnd })));
                }}
            />

            <CleanCopyModal
                opened={copying !== undefined}
                onClose={() => setCopying(undefined)}
                title={t("Copy this round")}
                carries={t("The copy carries the problems assigned to this round, their pinned versions and their settings, its ranking dates, its importance and the addresses it may be reached from. Every date moves so that the copy starts when you say.")}
                drops={t("It arrives closed and holds nobody's work: no submissions, no results, nothing announced. The problems are the library's own — a copy points at the same ones rather than duplicating them.")}
                target={{
                    label: t("Which activity it goes into"),
                    description: t("This one makes a second sitting of the same round. Where a problem slug is already taken there, the copy is given a free one."),
                    options: targets,
                    initial: activity.id,
                }}
                name={{ label: t("A name of its own"), placeholder: t("r2") }}
                date={{ label: t("When the copy starts") }}
                confirmLabel={t("Copy it")}
                busy={busy}
                onConfirm={chosen => run(async () => {
                    const id = copying?.id;
                    if (!id) return;
                    await call(api => api.managerApi.duplicateSeries(
                        id, chosen.target, chosen.name, chosen.date));
                    setCopying(undefined);
                })}
            />
        </Stack>
    );
}
