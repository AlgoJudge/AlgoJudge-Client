import { Badge, Box, Button, Card, Group, Overlay, Stack, Text, Title } from "@mantine/core";
import { IconLock } from "@tabler/icons-react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { Activity, ProblemSummary, Series } from "../../../../api/ParticipantApi";
import { maySubmit, seriesState } from "../../../../api/seriesState";
import ProblemStatusBadge from "../../../../components/problem/ProblemStatusBadge";
import ActivityTime from "../../../../components/time/ActivityTime";
import Countdown from "../../../../components/time/Countdown";
import { useApiCall, useApiEffect } from "../../../../provider/apiContext";
import LoadState from "../../../../components/LoadState";
import { activityRenderers } from "../../../../renderers";
import classes from "./ProblemsPage.module.css";

const ProblemRow = ({ problem, activitySlug, canSubmit }: {
    problem: ProblemSummary;
    activitySlug: string;
    /** False once the round has ended or been stopped: the statement stays, the button does not. */
    canSubmit: boolean;
}) => {
    const { t } = useTranslation();
    return (
        <Card className={classes.problem} component={Link} to={`/activities/${activitySlug}/problems/${problem.slug}`}>
            <Group justify="space-between" wrap="nowrap">
                <Text size="md" style={{ minWidth: 0 }}>[{problem.slug}] {problem.name}</Text>
                <Group gap="md" wrap="nowrap">
                    <ProblemStatusBadge status={problem.status} bestScore={problem.bestScore} maxScore={problem.maxScore} attempts={problem.attempts} />
                    {/* A disabled button rather than none: the way in stays where
                        it has always been, and says it is shut instead of
                        vanishing and leaving somebody looking for it. Two
                        buttons rather than one with a conditional element,
                        because a link that leads nowhere is not a link. */}
                    {canSubmit ? (
                        <Button
                            component={Link}
                            to={`/activities/${activitySlug}/submit/${problem.slug}`}
                            onClick={e => e.stopPropagation()}
                            size="compact-sm"
                        >
                            {t("Submit")}
                        </Button>
                    ) : (
                        <Button disabled size="compact-sm" onClick={e => e.stopPropagation()}>
                            {t("Submit")}
                        </Button>
                    )}
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
    // Three ways a round shows nothing, and they are not the same sentence:
    // it has not started, a manager took the statements away, or it is over and
    // the activity closes finished rounds.
    const state = seriesState(series);
    // **A fourth, and it wins over the dates.** A displaced round is running,
    // so the clock says "open" and the payload is empty, which this read as
    // "not started yet" — under a countdown to a moment already gone.
    const displaced = series.locked;
    const stopped = state === "paused" || state === "ended" || displaced !== undefined;
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
                            {displaced ? t("Locked by {{series}}", { series: displaced.seriesName })
                                : state === "paused" ? t("The series is paused")
                                : state === "ended" ? t("The series has ended")
                                : count === undefined ? t("Not started yet")
                                : `${t("Problems")}: ${count}`}
                        </Text>
                    </Group>
                    {!stopped && series.startDate && (
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

    const error = useApiEffect(async (scoped) => {
        if (!activityId) return;
        const activity = await scoped.participantApi.getActivity(activityId);
        setActivity(activity);
        setSeries(await scoped.participantApi.getSeries(activity.id));

        // A series changing and a status changing both arrive as events, so the
        // page updates without the participant reloading at the exact second a
        // round begins — or is stopped.
        scoped.participantApi.eventDispatcher.addEventListener("seriesChanged", evt => {
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
        return <LoadState error={error} loading={!error} />;
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
                // Drawn from what arrived rather than worked out: a series the
                // Server withheld the problems of has none to draw, whether that
                // is because it has not started or because it was stopped.
                const problems = s.problems
                    ? s.problems.map(p => (
                        <ProblemRow
                            key={p.id}
                            problem={p}
                            activitySlug={activity.slug}
                            canSubmit={maySubmit(s)}
                        />
                    ))
                    : <ClosedSeries series={s} timeZone={activity.timeZone} onOpen={reload} />;

                if (flat) return <Box key={s.id}>{problems}</Box>;

                return (
                    <Card key={s.id} className={classes.round}>
                        <Group justify="space-between" wrap="wrap">
                            <Group gap="xs">
                                <Title order={2}>{s.name}</Title>
                                {/* Said where the problems are, because that is
                                    where somebody is when it happens. */}
                                {s.pausedAt && (
                                    <Badge color="orange" variant="filled" size="lg">{t("Paused")}</Badge>
                                )}
                            </Group>
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
