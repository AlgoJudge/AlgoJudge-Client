import {
    Alert, Badge, Button, Card, Group, Modal, Pagination, Select, Stack, Switch, Text, Textarea,
    TextInput, Title, Tooltip,
} from "@mantine/core";
import { IconEye, IconEyeOff, IconMessageReply, IconPlus, IconSearch, IconTrash } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { ManagedActivitySummary, ManagedQuestion, ManagedSeries } from "../../../api/ManagerApi";
import { QuestionKind } from "../../../api/ParticipantApi";
import LoadState from "../../../components/LoadState";
import ActivityTime from "../../../components/time/ActivityTime";
import { useApiCall, useApiEffect } from "../../../provider/apiContext";

const PAGE_SIZE = 20;

/**
 * Questions and announcements, across activities.
 *
 * Answering and publishing are separate acts, and the screen keeps them
 * separate: most answers concern one team's submission and would tell everyone
 * else nothing, while the few that are worth publishing become the FAQ a contest
 * needs. Answering with "publish" ticked does both in one step.
 */
export default function ManagerQuestionsPage() {
    const { t } = useTranslation();
    const call = useApiCall();

    const [query, setQuery] = useSearchParams();
    const activityId = query.get("activity") ?? undefined;
    const seriesId = query.get("series") ?? undefined;
    const kind = (query.get("kind") ?? undefined) as QuestionKind | undefined;
    const unansweredOnly = query.get("unanswered") === "1";
    const search = query.get("q") ?? "";
    const page = Number(query.get("page") ?? "1");

    const [items, setItems] = useState<ManagedQuestion[] | undefined>(undefined);
    const [total, setTotal] = useState(0);
    const [activities, setActivities] = useState<ManagedActivitySummary[]>([]);
    const [series, setSeries] = useState<ManagedSeries[]>([]);
    const [answering, setAnswering] = useState<ManagedQuestion | undefined>(undefined);
    const [draft, setDraft] = useState({ body: "", publish: false });
    const [announcing, setAnnouncing] = useState(false);
    const [announcement, setAnnouncement] = useState({ topic: "", body: "", seriesId: "" });
    const [error, setError] = useState<string | undefined>(undefined);
    const [busy, setBusy] = useState(false);
    const [reload, setReload] = useState(0);

    const set = (patch: Record<string, string | undefined>) => {
        const next = new URLSearchParams(query);
        for (const [key, value] of Object.entries(patch)) {
            if (value) next.set(key, value);
            else next.delete(key);
        }
        if (!("page" in patch)) next.delete("page");
        setQuery(next, { replace: true });
    };

    const loadError = useApiEffect(async (api) => {
        setActivities(await api.managerApi.getManagedActivities());
        setSeries(activityId ? await api.managerApi.getSeries(activityId) : []);

        setItems(undefined);
        const result = await api.managerApi.getQuestions({
            page, pageSize: PAGE_SIZE,
            activityId, seriesId, kind,
            unansweredOnly: unansweredOnly || undefined,
            search: search || undefined,
        });
        setItems(result.items);
        setTotal(result.total);

        api.managerApi.eventDispatcher.addEventListener("questionChanged", () => setReload(n => n + 1));
    }, [activityId, seriesId, kind, unansweredOnly, search, page, reload]);

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

    const scopeOf = (question: ManagedQuestion) => [
        question.activitySlug,
        question.seriesName,
        question.problemSlug ? `[${question.problemSlug}]` : undefined,
    ].filter(Boolean).join(" · ");

    return (
        <Stack gap="md">
            <Group justify="space-between" wrap="wrap">
                <Stack gap={2}>
                    <Title>{t("Questions and announcements")}</Title>
                    <Text size="sm" c="dimmed">
                        {t("Answering and publishing are two acts: an answer stays private until you publish it.")}
                    </Text>
                </Stack>
                <Tooltip label={activityId ? "" : t("Choose an activity first")} disabled={!!activityId}>
                    <Button
                        leftSection={<IconPlus size={16} />}
                        disabled={!activityId}
                        onClick={() => { setAnnouncement({ topic: "", body: "", seriesId: "" }); setAnnouncing(true); }}
                    >
                        {t("New announcement")}
                    </Button>
                </Tooltip>
            </Group>

            {error && <Alert color="red" withCloseButton onClose={() => setError(undefined)}>{error}</Alert>}

            <Group gap="md" wrap="wrap">
                <TextInput
                    placeholder={t("Search by topic, body or author")}
                    leftSection={<IconSearch size={16} />}
                    value={search}
                    onChange={e => set({ q: e.currentTarget.value })}
                    w={280}
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
                    placeholder={t("Both kinds")}
                    data={[
                        { value: "question", label: t("questionKind.question") },
                        { value: "announcement", label: t("questionKind.announcement") },
                    ]}
                    value={kind ?? null}
                    onChange={v => set({ kind: v ?? undefined })}
                    clearable
                    w={180}
                />
                <Switch
                    label={t("Waiting for an answer")}
                    checked={unansweredOnly}
                    onChange={e => set({ unanswered: e.currentTarget.checked ? "1" : undefined })}
                />
            </Group>

            <Stack gap="sm">
                {items.map(question => (
                    <Card key={question.id} withBorder radius="sm">
                        <Group justify="space-between" align="flex-start" wrap="wrap">
                            <Stack gap={4} style={{ flex: 1, minWidth: 280 }}>
                                <Group gap="xs">
                                    <Badge
                                        variant="light"
                                        color={question.kind === "announcement" ? "grape" : "blue"}
                                    >
                                        {t(`questionKind.${question.kind}`)}
                                    </Badge>
                                    <Text fw={500}>{question.topic}</Text>
                                    {question.isPublished
                                        ? <Badge variant="light" color="teal" size="sm">{t("Published")}</Badge>
                                        : question.kind === "question" && question.answer === undefined
                                            ? <Badge variant="light" color="orange" size="sm">{t("Waiting")}</Badge>
                                            : <Badge variant="light" color="gray" size="sm">{t("Private answer")}</Badge>}
                                </Group>
                                <Text size="xs" c="dimmed">
                                    {question.authorName ?? t("Staff")} · {scopeOf(question)} ·{" "}
                                    <ActivityTime value={question.createdAt} timeZone="Europe/Warsaw" hideZone />
                                    {question.isPublished && ` · ${question.readCount} ${t("reads")}`}
                                </Text>
                                <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>{question.body}</Text>

                                {question.answer && (
                                    <Card withBorder radius="sm" mt="xs" bg="var(--mantine-color-default-hover)">
                                        <Text size="xs" c="dimmed" mb={4}>
                                            {question.answer.authorName} ·{" "}
                                            <ActivityTime value={question.answer.answeredAt} timeZone="Europe/Warsaw" hideZone />
                                        </Text>
                                        <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>{question.answer.body}</Text>
                                    </Card>
                                )}
                            </Stack>

                            <Group gap="xs">
                                {question.kind === "question" && (
                                    <Button
                                        variant="light"
                                        size="compact-sm"
                                        leftSection={<IconMessageReply size={14} />}
                                        onClick={() => {
                                            setAnswering(question);
                                            setDraft({ body: question.answer?.body ?? "", publish: question.isPublished });
                                        }}
                                    >
                                        {question.answer ? t("Edit the answer") : t("Answer")}
                                    </Button>
                                )}
                                {/* Publishing an unanswered question would show
                                    everyone the doubt without the answer. */}
                                <Tooltip label={question.isPublished ? t("Unpublish") : t("Publish")}>
                                    <Button
                                        variant="subtle"
                                        size="compact-sm"
                                        loading={busy}
                                        disabled={question.kind === "question" && !question.answer && !question.isPublished}
                                        onClick={() => run(() => call(api =>
                                            api.managerApi.setQuestionPublished(question.id, !question.isPublished)))}
                                    >
                                        {question.isPublished ? <IconEyeOff size={14} /> : <IconEye size={14} />}
                                    </Button>
                                </Tooltip>
                                {question.kind === "announcement" && (
                                    <Tooltip label={t("Delete")}>
                                        <Button
                                            variant="subtle"
                                            color="red"
                                            size="compact-sm"
                                            loading={busy}
                                            onClick={() => run(() => call(api =>
                                                api.managerApi.deleteAnnouncement(question.id)))}
                                        >
                                            <IconTrash size={14} />
                                        </Button>
                                    </Tooltip>
                                )}
                            </Group>
                        </Group>
                    </Card>
                ))}
            </Stack>

            {items.length === 0 && <Text c="dimmed">{t("Nothing matches the filters")}</Text>}

            <Group justify="center">
                <Pagination
                    total={Math.ceil(total / PAGE_SIZE)}
                    value={page}
                    onChange={value => set({ page: String(value) })}
                />
            </Group>

            <Modal
                opened={answering !== undefined}
                onClose={() => setAnswering(undefined)}
                title={<Title order={4}>{t("Answer")}</Title>}
                size="lg"
                centered
            >
                {answering && (
                    <Stack gap="sm">
                        <Card withBorder radius="sm">
                            <Text fw={500} size="sm">{answering.topic}</Text>
                            <Text size="sm" c="dimmed" style={{ whiteSpace: "pre-wrap" }}>{answering.body}</Text>
                        </Card>
                        <Textarea
                            label={t("Answer")}
                            autosize
                            minRows={4}
                            value={draft.body}
                            onChange={e => setDraft({ ...draft, body: e.currentTarget.value })}
                            required
                        />
                        <Switch
                            label={t("Publish to every participant")}
                            description={t("Leave it off when the answer concerns only this person")}
                            checked={draft.publish}
                            onChange={e => setDraft({ ...draft, publish: e.currentTarget.checked })}
                        />
                        <Group justify="space-between">
                            <Button variant="default" onClick={() => setAnswering(undefined)}>{t("Back")}</Button>
                            <Button
                                loading={busy}
                                disabled={draft.body.trim().length === 0}
                                onClick={() => run(async () => {
                                    await call(api => api.managerApi.answerQuestion(answering.id, {
                                        body: draft.body.trim(),
                                        publish: draft.publish,
                                    }));
                                    setAnswering(undefined);
                                })}
                            >
                                {t("Save")}
                            </Button>
                        </Group>
                    </Stack>
                )}
            </Modal>

            <Modal
                opened={announcing}
                onClose={() => setAnnouncing(false)}
                title={<Title order={4}>{t("New announcement")}</Title>}
                size="lg"
                centered
            >
                <Stack gap="sm">
                    <TextInput
                        label={t("Topic")}
                        value={announcement.topic}
                        onChange={e => setAnnouncement({ ...announcement, topic: e.currentTarget.value })}
                        required
                    />
                    <Textarea
                        label={t("Body")}
                        autosize
                        minRows={4}
                        value={announcement.body}
                        onChange={e => setAnnouncement({ ...announcement, body: e.currentTarget.value })}
                        required
                    />
                    <Select
                        label={t("Series")}
                        description={t("Empty means the whole activity")}
                        data={series.map(s => ({ value: s.id, label: s.name }))}
                        value={announcement.seriesId || null}
                        onChange={v => setAnnouncement({ ...announcement, seriesId: v ?? "" })}
                        clearable
                    />
                    <Text size="sm" c="dimmed">
                        {t("An announcement is published the moment it is created.")}
                    </Text>
                    <Group justify="space-between">
                        <Button variant="default" onClick={() => setAnnouncing(false)}>{t("Back")}</Button>
                        <Button
                            loading={busy}
                            disabled={!announcement.topic.trim() || !announcement.body.trim()}
                            onClick={() => run(async () => {
                                if (!activityId) return;
                                await call(api => api.managerApi.createAnnouncement(activityId, {
                                    topic: announcement.topic.trim(),
                                    body: announcement.body.trim(),
                                    seriesId: announcement.seriesId || undefined,
                                }));
                                setAnnouncing(false);
                            })}
                        >
                            {t("Save")}
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </Stack>
    );
}
