import { Stack, Title } from "@mantine/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { Activity } from "../../../../api/ParticipantApi";
import { useApiEffect } from "../../../../provider/ApiProvider";
import LoadState from "../../../../components/LoadState";
import { rankingRenderers } from "../../../../renderers";

export default function RankingPage() {
    const { t } = useTranslation();
    const { activityId } = useParams();

    const [activity, setActivity] = useState<Activity | undefined>(undefined);
    const [ranking, setRanking] = useState<unknown>(undefined);

    const error = useApiEffect(async (api) => {
        if (!activityId) return;
        const activity = await api.participantApi.getActivity(activityId);
        setActivity(activity);
        setRanking(await api.participantApi.getRanking(activity.id));

        // The Server decides what a participant may see, including during a
        // freeze, so a change is answered by refetching rather than by patching
        // a row the Client happens to know about.
        api.participantApi.eventDispatcher.addEventListener("rankingChanged", async evt => {
            if (evt.data.activityId !== activity.id) return;
            setRanking(await api.participantApi.getRanking(activity.id));
        });
    }, [activityId]);

    if (!activity || ranking === undefined) {
        return <LoadState error={error} loading={!error} />;
    }

    // Chosen by the activity's ranking type, not by its activity type: ICPC and
    // a points board are different tables, not different sorts of one table.
    const Ranking = rankingRenderers.resolve(activity.rankingType).value;

    return (
        <Stack gap="md">
            <Title>{t("Ranking")}</Title>
            <Ranking ranking={ranking} timeZone={activity.timeZone} />
        </Stack>
    );
}
