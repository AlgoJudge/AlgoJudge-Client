import { Center, Group, Loader, Pagination, Select, Stack, Table, Text, Title } from "@mantine/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { Activity, JobState, Series, SubmissionSummary } from "../../../../api/ParticipantApi";
import ActivityTime from "../../../../components/time/ActivityTime";
import { useApiEffect } from "../../../../provider/apiContext";
import LoadState from "../../../../components/LoadState";
import StateBadge from "../../../../components/submission/StateBadge";
import { languageText } from "../../../../components/submission/offered";

const PAGE_SIZE = 10;

const STATES: JobState[] = ["queued", "running", "completed", "failed", "cancelled"];

export default function SubmissionsPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { activityId } = useParams();

    const [activity, setActivity] = useState<Activity | undefined>(undefined);
    const [series, setSeries] = useState<Series[]>([]);
    const [items, setItems] = useState<SubmissionSummary[] | undefined>(undefined);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [problemId, setProblemId] = useState<string | null>(null);
    const [seriesId, setSeriesId] = useState<string | null>(null);
    const [state, setState] = useState<string | null>(null);

    const error = useApiEffect(async (api) => {
        if (!activityId) return;
        const activity = await api.participantApi.getActivity(activityId);
        setActivity(activity);
        setSeries(await api.participantApi.getSeries(activity.id));

        setItems(undefined);
        const result = await api.participantApi.getSubmissions(activity.id, {
            page, pageSize: PAGE_SIZE,
            problemId: problemId ?? undefined,
            seriesId: seriesId ?? undefined,
            states: state ? [state as JobState] : undefined,
        });
        setItems(result.items);
        setTotal(result.total);

        // The reason this screen exists is to watch something finish, so a state
        // change is applied in place rather than waiting for a refetch.
        api.participantApi.eventDispatcher.addEventListener("submissionStateChanged", evt => {
            if (evt.data.activityId !== activity.id) return;
            setItems(current => current?.map(s => s.id === evt.data.submission.id ? evt.data.submission : s));
        });
    }, [activityId, page, problemId, seriesId, state]);

    const problems = series.flatMap(s => (s.problems ?? []).map(p => ({
        value: p.id,
        label: `[${p.slug}] ${p.name}`,
    })));

    const onFilter = <T,>(set: (v: T) => void) => (value: T) => {
        set(value);
        setPage(1);
    };

    if (!activity) return <LoadState error={error} loading={!error} />;

    return (
        <Stack gap="md">
            <Title>{t("My submissions")}</Title>

            <Group gap="sm" wrap="wrap">
                <Select
                    placeholder={t("All problems")}
                    data={problems}
                    value={problemId}
                    onChange={onFilter(setProblemId)}
                    clearable
                    w={260}
                />
                <Select
                    placeholder={t("All series")}
                    data={series.map(s => ({ value: s.id, label: s.name }))}
                    value={seriesId}
                    onChange={onFilter(setSeriesId)}
                    clearable
                    w={200}
                />
                <Select
                    placeholder={t("Any status")}
                    data={STATES.map(s => ({ value: s, label: t(s) }))}
                    value={state}
                    onChange={onFilter(setState)}
                    clearable
                    w={180}
                />
            </Group>

            {!items && <Center my="xl"><Loader /></Center>}

            {items?.length === 0 && <Text c="dimmed">{t("No submissions match the filters")}</Text>}

            {items && items.length > 0 && (
                <Table.ScrollContainer minWidth={720}>
                    <Table striped highlightOnHover>
                        <Table.Thead>
                            <Table.Tr>
                                <Table.Th>{t("Submission date")}</Table.Th>
                                <Table.Th>{t("Problem")}</Table.Th>
                                <Table.Th>{t("Language")}</Table.Th>
                                <Table.Th>{t("Status")}</Table.Th>
                                <Table.Th>{t("Result")}</Table.Th>
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {items.map(s => (
                                <Table.Tr
                                    key={s.id}
                                    style={{ cursor: "pointer" }}
                                    onClick={() => navigate(`/activities/${activity.slug}/submissions/${s.id}`)}
                                >
                                    <Table.Td>
                                        <ActivityTime value={s.submittedAt} timeZone={activity.timeZone} />
                                    </Table.Td>
                                    <Table.Td>[{s.problemSlug}] {s.problemName}</Table.Td>
                                    <Table.Td>{languageText(s.props)}</Table.Td>
                                    <Table.Td><StateBadge state={s.state} verdict={s.verdict} score={s.score} maxScore={s.maxScore} /></Table.Td>
                                    <Table.Td>
                                        {s.score === undefined ? "—" : `${s.score} / ${s.maxScore ?? "?"}`}
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
        </Stack>
    );
}
