import { Group, Paper, SegmentedControl, Stack, Text, Title } from "@mantine/core";
import { IconClock } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { Activity, Series } from "../../../../api/ParticipantApi";
import { rankingWindow } from "../../../../api/rankingWindow";
import { seriesState } from "../../../../api/seriesState";
import { useApiEffect } from "../../../../provider/apiContext";
import { usePermissions } from "../../../../provider/permissionsContext";
import ActivityTime from "../../../../components/time/ActivityTime";
import LoadState from "../../../../components/LoadState";
import { rankingRenderers } from "../../../../renderers";

/** The value standing for the combined board, which has no series of its own. */
const COMBINED = "*";

/**
 * The standings: the combined board, and every round that has started.
 *
 * A round nobody has opened has no standing, so it is not offered — listing it
 * would promise a table that cannot exist yet. Each board is asked of the Server
 * rather than filtered here: a round's places are its own, and rows filtered in
 * the Client would carry places that are not places.
 */
export default function RankingPage() {
    const { t } = useTranslation();
    const { activityId } = useParams();
    const { has } = usePermissions();

    const [activity, setActivity] = useState<Activity | undefined>(undefined);
    const [series, setSeries] = useState<Series[]>([]);
    const [chosen, setChosen] = useState<string>(COMBINED);
    const [ranking, setRanking] = useState<unknown>(undefined);

    const error = useApiEffect(async (api) => {
        if (!activityId) return;
        const loaded = await api.participantApi.getActivity(activityId);
        setActivity(loaded);
        setSeries(await api.participantApi.getSeries(loaded.id));

        const forSeries = chosen === COMBINED ? undefined : chosen;
        setRanking(await api.participantApi.getRanking(loaded.id, forSeries));

        // The Server decides what a participant may see, including during a
        // freeze, so a change is answered by refetching rather than by patching
        // a row the Client happens to know about.
        api.participantApi.eventDispatcher.addEventListener("rankingChanged", async evt => {
            if (evt.data.activityId !== loaded.id) return;
            setRanking(await api.participantApi.getRanking(loaded.id, forSeries));
        });
    }, [activityId, chosen]);

    if (!activity) return <LoadState error={error} loading={!error} />;

    const started = series.filter(s => seriesState(s) !== "upcoming");

    // The window belongs to the round. The combined board is a combination of
    // the rounds whose windows are open, so it is there while **any** of them
    // is — and says when the earliest one opens while none is.
    const chosenSeries = started.find(s => s.id === chosen);
    const windows = started.map(s => rankingWindow(s));
    const window = chosenSeries
        ? rankingWindow(chosenSeries)
        : windows.find(w => w.visible) ?? windows[0] ?? { visible: started.length === 0 };

    // Whoever may read a frozen board may read one outside its window: the
    // window is what an organiser tells participants, not an access rule.
    const withheld = !window.visible && !has("ranking:read:unfrozen");

    // Chosen by the activity's ranking type, not by its activity type: ICPC and
    // a points board are different tables, not different sorts of one table.
    const Ranking = rankingRenderers.resolve(activity.rankingType).value;

    return (
        <Stack gap="md">
            <Title>{t("Ranking")}</Title>

            {/* Offered even while the board is withheld: switching between rounds
                is not what is being withheld, and a control that appears out of
                nowhere at six o'clock is worse than one that waits. */}
            {started.length > 0 && (
                <SegmentedControl
                    value={chosen}
                    onChange={setChosen}
                    data={[
                        { value: COMBINED, label: t("Combined") },
                        ...started.map(s => ({ value: s.id, label: s.name })),
                    ]}
                />
            )}

            {withheld ? (
                <Paper withBorder p="xl" radius="md">
                    <Group gap="xs">
                        <IconClock size={18} />
                        <Text>
                            {window.from ? (
                                <>
                                    {t("The ranking opens on")}{" "}
                                    <ActivityTime value={window.from} timeZone={activity.timeZone} />
                                </>
                            ) : window.to ? (
                                <>
                                    {t("The ranking was available until")}{" "}
                                    <ActivityTime value={window.to} timeZone={activity.timeZone} />
                                </>
                            ) : t("The ranking is not available.")}
                        </Text>
                    </Group>
                </Paper>
            ) : ranking === undefined ? (
                <LoadState error={error} loading={!error} />
            ) : (
                <Ranking ranking={ranking} timeZone={activity.timeZone} />
            )}
        </Stack>
    );
}
