import { Box, Button, Card, Center, Group, Loader, Overlay, Stack, Text, Title } from "@mantine/core";
import { IconLock } from "@tabler/icons-react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { Activity, ProblemSummary, Series } from "../../../../api/ParticipantApi";
import ProblemStatusBadge from "../../../../components/problem/ProblemStatusBadge";
import ActivityTime from "../../../../components/time/ActivityTime";
import Countdown from "../../../../components/time/Countdown";
import { useApiCall, useApiEffect } from "../../../../provider/ApiProvider";
import { activityRenderers } from "../../../../renderers";
import classes from "./ProblemsPage.module.css";

const ProblemRow = ({ problem, activitySlug }: { problem: ProblemSummary; activitySlug: string }) => {
    const { t } = useTranslation();
    return (
        <Card className={classes.problem} component={Link} to={`/activities/${activitySlug}/problems/${problem.slug}`}>
            <Group justify="space-between" wrap="nowrap">
                <Text size="md" style={{ minWidth: 0 }}>[{problem.slug}] {problem.name}</Text>
                <Group gap="md" wrap="nowrap">
                    <ProblemStatusBadge status={problem.status} bestScore={problem.bestScore} maxScore={problem.maxScore} attempts={problem.attempts} />
                    <Button
                        component={Link}
                        to={`/activities/${activitySlug}/submit/${problem.slug}`}
                        onClick={e => e.stopPropagation()}
                        size="compact-sm"
                    >
                        {t("Submit")}
                    </Button>
                </Group>
            </Group>
        </Card>
    );
};

/**
 * What a closed series shows.
 *
 * The problems are genuinely absent from the payload, so there is nothing to
 * hide behind the blur. Placeholders are drawn only when the manager allowed the
 * count to be shown, and they carry no names — a blur over real titles protects
 * nothing, since the text is in the DOM.
 */
const ClosedSeries = ({ series, timeZone, onOpen }: { series: Series; timeZone: string; onOpen: () => void }) => {
    const { t } = useTranslation();
    const count = series.problemCount;
    return (
        // Without a floor the container collapses when the problem count is
        // withheld too, and the overlay lands on top of the series heading.
        <Box className={classes.roundproblemlist} mih={count === undefined ? 120 : undefined}>
            {count !== undefined && Array.from({ length: count }, (_, i) => (
                <Card key={i} className={classes.problem} aria-hidden>
                    <Group justify="space-between">
                        <Text size="md">{"—".repeat(12)}</Text>
                        <Text size="sm">{"—".repeat(4)}</Text>
                    </Group>
                </Card>
            ))}
            <Overlay color="#fff" backgroundOpacity={0.3} blur={4} zIndex={1}>
                <Stack className={classes.roundoverlay} gap={4}>
                    <Group gap="xs">
                        <IconLock size={18} />
                        <Text size="lg" fw={700}>
                            {count === undefined ? t("Not started yet") : `${t("Problems")}: ${count}`}
                        </Text>
                    </Group>
                    {series.startDate && (
                        <>
                            <Text size="sm">
                                {t("Starts")}: <ActivityTime value={series.startDate} timeZone={timeZone} />
                            </Text>
                            <Text size="xl" fw={700}>
                                <Countdown target={series.startDate} onElapsed={onOpen} />
                            </Text>
                        </>
                    )}
                </Stack>
            </Overlay>
        </Box>
    );
};

export default function ProblemsPage() {
    const { t } = useTranslation();
    const { activityId } = useParams();
    const call = useApiCall();

    const [activity, setActivity] = useState<Activity | undefined>(undefined);
    const [series, setSeries] = useState<Series[] | undefined>(undefined);

    const reload = useCallback(async () => {
        if (!activityId) return;
        const loaded = await call(async scoped => {
            const activity = await scoped.participantApi.getActivity(activityId);
            return { activity, series: await scoped.participantApi.getSeries(activity.id) };
        });
        setActivity(loaded.activity);
        setSeries(loaded.series);
    }, [activityId, call]);

    useApiEffect(async (scoped) => {
        if (!activityId) return;
        const activity = await scoped.participantApi.getActivity(activityId);
        setActivity(activity);
        setSeries(await scoped.participantApi.getSeries(activity.id));

        // A series opening and a status changing both arrive as events, so the
        // page updates without the participant reloading at the exact second a
        // round begins.
        scoped.participantApi.eventDispatcher.addEventListener("sectionOpened", evt => {
            if (evt.data.activityId !== activity.id) return;
            setSeries(current => current?.map(s => s.id === evt.data.series.id ? evt.data.series : s));
        });
        scoped.participantApi.eventDispatcher.addEventListener("problemStatusChanged", evt => {
            if (evt.data.activityId !== activity.id) return;
            setSeries(current => current?.map(s => ({
                ...s,
                problems: s.problems?.map(p => p.id === evt.data.problem.id ? evt.data.problem : p),
            })));
        });
        // A manager moving a start or end time changes every countdown and
        // deadline on this page, and the series carry the times, so the whole
        // set is reloaded rather than guessed at.
        scoped.participantApi.eventDispatcher.addEventListener("activityTimesChanged", async evt => {
            if (evt.data.activityId !== activity.id) return;
            setSeries(await scoped.participantApi.getSeries(activity.id));
        });
    }, [activityId]);

    if (!activity || !series) {
        return <Center my="xl"><Loader size="xl" /></Center>;
    }

    const renderer = activityRenderers.resolve(activity.type).value;
    // One series is not a grouping. Rendering "Round 1" above the only round
    // there is adds a heading that carries no information.
    const flat = series.length === 1;

    return (
        <Stack gap="xs">
            <Title>{t("Problems")}</Title>

            {series.length === 0 && <Text px="md" c="dimmed">{t("This activity has no problems yet")}</Text>}

            {series.map(s => {
                const problems = s.isOpen
                    ? (s.problems ?? []).map(p => <ProblemRow key={p.id} problem={p} activitySlug={activity.slug} />)
                    : <ClosedSeries series={s} timeZone={activity.timeZone} onOpen={reload} />;

                if (flat) return <Box key={s.id}>{problems}</Box>;

                return (
                    <Card key={s.id} className={classes.round}>
                        <Group justify="space-between" wrap="wrap">
                            <Title order={2}>{s.name}</Title>
                            <Group gap="md">
                                {renderer.showStartCountdown && s.startDate && (
                                    <Text size="sm" c="dimmed">
                                        {t("Starts")}: <ActivityTime value={s.startDate} timeZone={activity.timeZone} />
                                    </Text>
                                )}
                                {renderer.showDeadline && s.endDate && (
                                    <Text size="sm" c="dimmed">
                                        {t("Deadline")}: <ActivityTime value={s.endDate} timeZone={activity.timeZone} />
                                    </Text>
                                )}
                            </Group>
                        </Group>
                        {problems}
                    </Card>
                );
            })}
        </Stack>
    );
}
