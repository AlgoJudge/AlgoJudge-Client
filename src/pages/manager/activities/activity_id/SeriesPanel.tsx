import {
    Accordion, Alert, Badge, Button, Card, Grid, Group, Modal, NumberInput, Select, Stack, Switch,
    Table, Text, TextInput, Title, Tooltip,
} from "@mantine/core";
import {
    IconAlertTriangle, IconArrowDown, IconArrowUp, IconPlus, IconTrash,
} from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
    ManagedActivity, ManagedProblem, ManagedProblemVersion, ManagedSeries, ManagedSeriesProblem,
    SeriesInput, SeriesProblemInput,
} from "../../../../api/ManagerApi";
import ZonedDateTimeInput from "../../../../components/time/ZonedDateTimeInput";
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

const emptySeries = (): SeriesInput => ({ slug: "", name: "", revealProblemCount: true });

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
                        <Button
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
                                    <Group justify="space-between" mt="sm" wrap="wrap">
                                        <Switch
                                            label={t("Reveal the problem count while closed")}
                                            checked={draftFor(s).revealProblemCount}
                                            onChange={e => setDraft(s, { revealProblemCount: e.currentTarget.checked })}
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
                                            <Button
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
                                                                opens. */}
                                                            {!assignment.hasPackage && (
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
                            <Button variant="default" onClick={() => setCreating(undefined)}>{t("Back")}</Button>
                            <Button
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
                            <Button variant="default" onClick={() => { setAttachTo(undefined); setEditing(undefined); }}>
                                {t("Back")}
                            </Button>
                            <Button loading={busy} onClick={saveAttachment}>{t("Save")}</Button>
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
        </Stack>
    );
}
