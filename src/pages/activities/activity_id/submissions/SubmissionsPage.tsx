import { Center, Group, Loader, MultiSelect, Pagination, Stack, Table, Text, Title } from "@mantine/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { Activity, JobState, Series, SubmissionSummary } from "../../../../api/ParticipantApi";
import ActivityTime from "../../../../components/time/ActivityTime";
import { useApiEffect } from "../../../../provider/apiContext";
import LoadState from "../../../../components/LoadState";
import StateBadge from "../../../../components/submission/StateBadge";
import { languageText } from "../../../../components/submission/offered";
import DataTable from "../../../../components/table/DataTable";

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
    const [problemIds, setProblemIds] = useState<string[]>([]);
    const [seriesIds, setSeriesIds] = useState<string[]>([]);
    const [states, setStates] = useState<string[]>([]);

    const error = useApiEffect(async (api) => {
        if (!activityId) return;
        const activity = await api.participantApi.getActivity(activityId);
        setActivity(activity);
        setSeries(await api.participantApi.getSeries(activity.id));

        // **The list stays on screen while the next one loads.** Resetting it
        // here ran on every effect run, not only the first, so the `!items`
        // guard below fired on every refetch and took the screen down to a
        // spinner — filter row, open dialog and all.
        //
        // Deleting the reset is the whole fix: `items` is undefined only before
        // the first load has ever finished, which is what that guard was written
        // for. **The rule belongs to the idiom, not to this screen**: it was
        // fixed on `ParticipantsPanel` in August and across the eight manager
        // lists on 2026-09-14, and these four inherited neither because both
        // were recorded against the screens that found them.
        const result = await api.participantApi.getSubmissions(activity.id, {
            page, pageSize: PAGE_SIZE,
            problemIds, seriesIds, states: states as JobState[],
        });
        setItems(result.items);
        setTotal(result.total);

        // The reason this screen exists is to watch something finish, so a state
        // change is applied in place rather than waiting for a refetch.
        api.participantApi.eventDispatcher.addEventListener("submissionStateChanged", evt => {
            if (evt.data.activityId !== activity.id) return;
            setItems(current => current?.map(s => s.id === evt.data.submission.id ? evt.data.submission : s));
        });
    }, [activityId, page, problemIds, seriesIds, states]);

    const problems = series.flatMap(s => (s.problems ?? []).map(p => ({
        value: p.id,
        label: `[${p.slug}] ${p.name}`,
    })));

    // A narrower answer rarely has the page somebody was on, so any change to a
    // filter goes back to the first one. Page 3 of two pages reads as "nothing
    // here", which is the wrong answer to a filter that matched.
    const onFilter = (set: (v: string[]) => void) => (value: string[]) => {
        set(value);
        setPage(1);
    };

    if (!activity) return <LoadState error={error} loading={!error} />;

    return (
        <Stack gap="md">
            <Title>{t("My submissions")}</Title>

            <Group gap="sm" wrap="wrap">
                <MultiSelect
                    placeholder={problemIds.length === 0 ? t("All problems") : undefined}
                    data={problems}
                    value={problemIds}
                    onChange={onFilter(setProblemIds)}
                    data-testid="submission-problem"
                    clearable
                    searchable
                    w={{ base: "100%", sm: 260 }}
                />
                <MultiSelect
                    placeholder={seriesIds.length === 0 ? t("All series") : undefined}
                    data={series.map(s => ({ value: s.id, label: s.name }))}
                    value={seriesIds}
                    onChange={onFilter(setSeriesIds)}
                    data-testid="submission-series"
                    clearable
                    w={{ base: "100%", sm: 200 }}
                />
                <MultiSelect
                    placeholder={states.length === 0 ? t("Any status") : undefined}
                    data={STATES.map(s => ({ value: s, label: t(s) }))}
                    value={states}
                    onChange={onFilter(setStates)}
                    data-testid="submission-state"
                    clearable
                    w={{ base: "100%", sm: 180 }}
                />
            </Group>

            {/* **A refetch that failed has to say so here.** The `!activity`
                guard above is reached only before the first load, so once the
                screen is drawn a lost connection would otherwise leave stale
                rows looking current. */}
            {error !== undefined && <LoadState error={error} loading={false} />}
            {!items && <Center my="xl"><Loader /></Center>}

            {items?.length === 0 && <Text c="dimmed">{t("No submissions match the filters")}</Text>}

            {items && items.length > 0 && (
                <DataTable minWidth={720} striped highlightOnHover>
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
                </DataTable>
            )}

            <Group justify="center">
                <Pagination total={Math.ceil(total / PAGE_SIZE)} value={page} onChange={setPage} />
            </Group>
        </Stack>
    );
}
