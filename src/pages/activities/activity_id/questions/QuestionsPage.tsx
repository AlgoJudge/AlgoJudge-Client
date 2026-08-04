import { Badge, Center, Divider, Group, Loader, Modal, Pagination, Select, Stack, Table, Text, TextInput, Title, UnstyledButton } from "@mantine/core";
import { IconArrowDown, IconArrowUp, IconMessageReply, IconSearch, IconSelector, IconSpeakerphone } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { Activity, Question, QuestionKind, QuestionSort, Series } from "../../../../api/ParticipantApi";
import ActivityTime from "../../../../components/time/ActivityTime";
import { useApiCall, useApiEffect } from "../../../../provider/ApiProvider";
import LoadState from "../../../../components/LoadState";
import QuestionFormModal from "./submit_question/QuestionFormModal";
import classes from "./QuestionsPage.module.css";

const PAGE_SIZE = 10;

/**
 * A column header that sorts.
 *
 * Sorting is a request, not a client-side reorder: the page is cut on the
 * Server, so ordering the rows here would order the ten that happen to be shown.
 */
const SortableTh = ({ label, column, sortBy, order, onSort }: {
    label: string;
    column: QuestionSort;
    sortBy: QuestionSort;
    order: "asc" | "desc";
    onSort: (column: QuestionSort) => void;
}) => {
    const active = sortBy === column;
    const Icon = !active ? IconSelector : order === "asc" ? IconArrowUp : IconArrowDown;
    return (
        <Table.Th>
            <UnstyledButton onClick={() => onSort(column)} style={{ width: "100%" }}>
                <Group gap={4} wrap="nowrap">
                    <Text size="sm" fw={500}>{label}</Text>
                    <Icon size={14} opacity={active ? 1 : 0.4} />
                </Group>
            </UnstyledButton>
        </Table.Th>
    );
};

const KindBadge = ({ kind }: { kind: QuestionKind }) => {
    const { t } = useTranslation();
    return kind === "announcement"
        ? <Badge color="grape" variant="light" leftSection={<IconSpeakerphone size={12} />}>{t("Announcement")}</Badge>
        : <Badge color="blue" variant="light">{t("Question")}</Badge>;
};

/** Where a question applies: one problem, one series, or the activity at large. */
const Scope = ({ question }: { question: Question }) => {
    const { t } = useTranslation();
    if (question.problemSlug) return <Text size="sm">[{question.problemSlug}] {question.problemName}</Text>;
    if (question.seriesName) return <Text size="sm">{question.seriesName}</Text>;
    return <Text size="sm" c="dimmed">{t("General")}</Text>;
};

const QuestionModal = ({ question, timeZone, onClose }: { question?: Question; timeZone: string; onClose: () => void }) => {
    const { t } = useTranslation();
    if (!question) return null;
    return (
        <Modal opened onClose={onClose} title={<Title order={4}>{question.topic}</Title>} size="lg" centered>
            <Stack gap="sm">
                <Group gap="md" wrap="wrap">
                    <KindBadge kind={question.kind} />
                    <Text size="sm" c="dimmed">{t("Author")}: {question.authorName}</Text>
                    <Scope question={question} />
                    <ActivityTime value={question.createdAt} timeZone={timeZone} size="sm" c="dimmed" />
                </Group>
                <Divider />
                <Text style={{ whiteSpace: "pre-wrap" }}>{question.body}</Text>

                {question.answer ? (
                    <>
                        <Divider label={t("Answer")} labelPosition="left" />
                        <Stack gap={4}>
                            <Text style={{ whiteSpace: "pre-wrap" }}>{question.answer.body}</Text>
                            <Text size="xs" c="dimmed">
                                {question.answer.authorName}, <ActivityTime value={question.answer.answeredAt} timeZone={timeZone} size="xs" />
                            </Text>
                        </Stack>
                    </>
                ) : (
                    question.kind === "question" && (
                        <Text size="sm" c="dimmed">{t("Not answered yet")}</Text>
                    )
                )}
            </Stack>
        </Modal>
    );
};

export default function QuestionsPage() {
    const { t } = useTranslation();
    const { activityId } = useParams();
    const call = useApiCall();

    const [activity, setActivity] = useState<Activity | undefined>(undefined);
    const [series, setSeries] = useState<Series[]>([]);
    const [items, setItems] = useState<Question[] | undefined>(undefined);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState("");
    const [kind, setKind] = useState<string | null>(null);
    const [seriesId, setSeriesId] = useState<string | null>(null);
    const [sortBy, setSortBy] = useState<QuestionSort>("createdAt");
    const [order, setOrder] = useState<"asc" | "desc">("desc");
    const [problemId, setProblemId] = useState<string | null>(null);
    const [opened, setOpened] = useState<Question | undefined>(undefined);
    const [reload, setReload] = useState(0);

    const error = useApiEffect(async (api) => {
        if (!activityId) return;
        const activity = await api.participantApi.getActivity(activityId);
        setActivity(activity);
        setSeries(await api.participantApi.getSeries(activity.id));

        setItems(undefined);
        // Filtering and paging both happen on the Server. Doing it the other way
        // round — slice, then filter — silently filters only the visible page.
        const result = await api.participantApi.getQuestions(activity.id, {
            page, pageSize: PAGE_SIZE,
            search: search || undefined,
            kind: (kind as QuestionKind) ?? undefined,
            seriesId: seriesId ?? undefined,
            problemId: problemId ?? undefined,
            sortBy,
            order,
        });
        setItems(result.items);
        setTotal(result.total);

        const refresh = (question: Question) =>
            setItems(current => current?.map(q => q.id === question.id ? question : q));
        api.participantApi.eventDispatcher.addEventListener("questionAnswered", evt => {
            if (evt.data.activityId === activity.id) refresh(evt.data.question);
        });
        // A publication adds a row that was not visible before, so the page is
        // refetched: patching would place it wherever it arrived rather than
        // where the sort puts it, and could push another row off the page.
        api.participantApi.eventDispatcher.addEventListener("questionPublished", evt => {
            if (evt.data.activityId === activity.id) setReload(n => n + 1);
        });
        api.participantApi.eventDispatcher.addEventListener("announcementPublished", evt => {
            if (evt.data.activityId === activity.id) setReload(n => n + 1);
        });
    }, [activityId, page, search, kind, seriesId, problemId, sortBy, order, reload]);

    const open = async (question: Question) => {
        setOpened(question);
        if (question.isRead || !activity) return;
        // Read state is per user and lives on the Server, so opening it here has
        // to say so rather than only dimming the row locally.
        await call(api => api.participantApi.markQuestionRead(activity.id, question.id));
        setItems(current => current?.map(q => q.id === question.id ? { ...q, isRead: true } : q));
    };

    const problems = series.flatMap(s => (s.problems ?? []).map(p => ({
        value: p.id,
        label: `[${p.slug}] ${p.name}`,
    })));

    const onFilter = <T,>(set: (v: T) => void) => (value: T) => {
        set(value);
        setPage(1);
    };

    const onSort = (column: QuestionSort) => {
        // Clicking the column already sorted on flips the direction; a new
        // column starts descending, which is what "newest first" means for the
        // date and what a reader expects the first click to do.
        setOrder(sortBy === column && order === "desc" ? "asc" : "desc");
        setSortBy(column);
        setPage(1);
    };

    if (!activity) return <LoadState error={error} loading={!error} />;

    return (
        <Stack gap="md">
            <Group justify="space-between" wrap="wrap">
                <Title>{t("Questions and announcements")}</Title>
                {/* Only asking. Announcing is a manager action and the design
                    marks it as such, so it is not offered here at all. */}
                <QuestionFormModal
                    activityId={activity.id}
                    series={series}
                    onCreated={() => setReload(n => n + 1)}
                />
            </Group>

            <Group gap="sm" wrap="wrap">
                <TextInput
                    placeholder={t("Search by topic")}
                    leftSection={<IconSearch size={16} />}
                    value={search}
                    onChange={e => onFilter(setSearch)(e.currentTarget.value)}
                    w={260}
                />
                <Select
                    placeholder={t("All kinds")}
                    data={[
                        { value: "question", label: t("Question") },
                        { value: "announcement", label: t("Announcement") },
                    ]}
                    value={kind}
                    onChange={onFilter(setKind)}
                    clearable
                    w={180}
                />
                <Select
                    placeholder={t("All series")}
                    data={series.map(s => ({ value: s.id, label: s.name }))}
                    value={seriesId}
                    onChange={onFilter(setSeriesId)}
                    clearable
                    w={220}
                />
                <Select
                    placeholder={t("All problems")}
                    data={problems}
                    value={problemId}
                    onChange={onFilter(setProblemId)}
                    clearable
                    w={260}
                />
            </Group>

            {!items && <Center my="xl"><Loader /></Center>}
            {items?.length === 0 && <Text c="dimmed">{t("Nothing matches the filters")}</Text>}

            {items && items.length > 0 && (
                <Table.ScrollContainer minWidth={720}>
                    <Table striped highlightOnHover>
                        <Table.Thead>
                            <Table.Tr>
                                <Table.Th>{t("Topic")}</Table.Th>
                                <Table.Th>{t("Author")}</Table.Th>
                                <SortableTh label={t("Series")} column="series" sortBy={sortBy} order={order} onSort={onSort} />
                                <SortableTh label={t("Problem")} column="problem" sortBy={sortBy} order={order} onSort={onSort} />
                                <SortableTh label={t("Date")} column="createdAt" sortBy={sortBy} order={order} onSort={onSort} />
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {items.map(q => (
                                <Table.Tr
                                    key={q.id}
                                    className={q.isRead ? classes.read : classes.unread}
                                    onClick={() => open(q)}
                                >
                                    <Table.Td>
                                        <Group gap="xs" wrap="nowrap">
                                            <KindBadge kind={q.kind} />
                                            <Text fw={q.isRead ? 400 : 600}>{q.topic}</Text>
                                            {q.answer && <IconMessageReply size={16} />}
                                        </Group>
                                    </Table.Td>
                                    <Table.Td>{q.authorName}</Table.Td>
                                    <Table.Td>
                                        {q.seriesName ?? <Text size="sm" c="dimmed">{t("Whole activity")}</Text>}
                                    </Table.Td>
                                    <Table.Td>
                                        {q.problemSlug
                                            ? <Text size="sm">[{q.problemSlug}] {q.problemName}</Text>
                                            : <Text size="sm" c="dimmed">—</Text>}
                                    </Table.Td>
                                    <Table.Td>
                                        <ActivityTime value={q.createdAt} timeZone={activity.timeZone} format="date" hideZone />
                                    </Table.Td>
                                </Table.Tr>
                            ))}
                        </Table.Tbody>
                    </Table>
                </Table.ScrollContainer>
            )}

            <Group justify="center">
                <Pagination total={Math.ceil(total / PAGE_SIZE)} value={page} onChange={setPage} />
            </Group>

            <QuestionModal question={opened} timeZone={activity.timeZone} onClose={() => setOpened(undefined)} />
        </Stack>
    );
}
