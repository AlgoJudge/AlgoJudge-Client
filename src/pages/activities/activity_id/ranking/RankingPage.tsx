import { Group, Paper, SegmentedControl, Stack, Text, Title } from "@mantine/core";
import { IconClock } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { Activity, ActivityResults, Series } from "../../../../api/ParticipantApi";
import { rankingWindow } from "../../../../api/rankingWindow";
import { seriesState } from "../../../../api/seriesState";
import { useApiEffect } from "../../../../provider/apiContext";
import ActivityTime from "../../../../components/time/ActivityTime";
import LoadState from "../../../../components/LoadState";
import { rankingRenderers } from "../../../../renderers";
import { narrow } from "../../../../renderers/ranking/scoreboard";

/** The value standing for the combined board, which has no series of its own. */
const COMBINED = "*";

/**
 * The standings: the combined board, and every round that has started.
 *
 * **Asked for once.** The Server sends every result the reader may see, and the
 * combined board already covers every round with an open window — so switching
 * between rounds narrows what is in hand rather than fetching again. Which board
 * those results add up to is the renderer's arithmetic, not the Server's.
 *
 * A round nobody has opened has no standing, so it is not offered — listing it
 * would promise a table that cannot exist yet.
 */
export default function RankingPage() {
    const { t } = useTranslation();
    const { activityId } = useParams();

    const [activity, setActivity] = useState<Activity | undefined>(undefined);
    const [series, setSeries] = useState<Series[]>([]);
    const [chosen, setChosen] = useState<string>(COMBINED);
    const [results, setResults] = useState<ActivityResults | undefined>(undefined);

    const error = useApiEffect(async (api) => {
        if (!activityId) return;
        const loaded = await api.participantApi.getActivity(activityId);
        setActivity(loaded);
        setSeries(await api.participantApi.getSeries(loaded.id));

        const load = async () => setResults(await api.participantApi.getResults(loaded.id));
        await load();

        // Which rounds are offered is decided by which have started, so a round
        // opening changes the picker — and may bring a board with it. Without
        // this the tab for a round that opened while somebody was reading simply
        // never appeared.
        api.participantApi.eventDispatcher.addEventListener("seriesChanged", async evt => {
            if (evt.data.activityId !== loaded.id) return;
            setSeries(await api.participantApi.getSeries(loaded.id));
            await load();
        });

        api.participantApi.eventDispatcher.addEventListener("rankingChanged", async evt => {
            if (evt.data.activityId !== loaded.id) return;
            // A freeze ending or a window opening means what is held is
            // incomplete in ways a merge cannot repair — the Server was
            // withholding, and only it knows what. Both refetch.
            if (evt.data.change !== "result" || !evt.data.result) {
                if (evt.data.change === "windowOpened") {
                    setSeries(await api.participantApi.getSeries(loaded.id));
                }
                await load();
                return;
            }
            // A single result merges in, which is why it is pushed at all. The
            // feed stays the source of state: a reconnection refetches, so a
            // dropped message cannot leave the board quietly wrong for long.
            const arrived = evt.data.result;
            setResults(current => current && ({
                ...current,
                results: [...current.results.filter(r => r.id !== arrived.id), arrived],
            }));
        });
    }, [activityId]);

    if (!activity || !results) return <LoadState error={error} loading={!error} />;

    const started = series.filter(s => seriesState(s) !== "upcoming");
    const chosenSeries = started.find(s => s.id === chosen);

    // **What was sent decides.** Whether a board exists is the Server's answer,
    // not a rule the screen re-derives: it applies the window, the freeze and
    // `scoreVisibility`, and whoever holds `ranking:read:unfrozen` is sent the
    // rounds those would have withheld. Working it out here as well produced a
    // board drawn out of a feed that carried none of it — five contestants, no
    // columns, everybody on nought — because the screen let a reader past a
    // window the feed had already closed.
    const withheld = chosenSeries
        ? !results.series.some(s => s.id === chosenSeries.id)
        : results.series.length === 0;

    // Only for the wording. The round says when its own board opens; the
    // combined one says when the earliest of them does.
    const windows = started.map(s => rankingWindow(s));
    const window = chosenSeries
        ? rankingWindow(chosenSeries)
        : windows.find(w => w.from !== undefined) ?? windows[0] ?? { visible: false };

    // Chosen by the activity's ranking type, not by its activity type: ICPC and
    // a points board are different tables, not different sorts of one table.
    const Ranking = rankingRenderers.resolve(activity.rankingType).value;

    // A standing among people whose scores you may not see is not a standing, so
    // under `participantOnly` the rows get no places. The Server has already
    // sent one contestant; this stops the Client numbering them anyway.
    const ranked = activity.scoreVisibility === "everyone";

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
            ) : (
                <Ranking
                    results={narrow(results, chosenSeries?.id)}
                    timeZone={activity.timeZone}
                    ranked={ranked}
                />
            )}
        </Stack>
    );
}
