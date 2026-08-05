import { Center, Loader, Stack, Title } from "@mantine/core";
import { Suspense, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { Activity } from "../../../../api/ParticipantApi";
import { useApiEffect } from "../../../../provider/apiContext";
import LoadState from "../../../../components/LoadState";
import { statementRenderers } from "../../../../renderers";

export default function RulesPage() {
    const { t } = useTranslation();
    const { activityId } = useParams();

    const [activity, setActivity] = useState<Activity | undefined>(undefined);
    const [rules, setRules] = useState<unknown>(undefined);

    const error = useApiEffect(async (api) => {
        if (!activityId) return;
        const activity = await api.participantApi.getActivity(activityId);
        setActivity(activity);
        setRules(await api.participantApi.getRules(activity.id));
    }, [activityId]);

    if (!activity || rules === undefined) {
        return <LoadState error={error} loading={!error} />;
    }

    // Rules use the same content format as a problem statement, so they use the
    // same renderer rather than a second one that would drift from it.
    const Content = statementRenderers.resolve("rules@1").value;

    return (
        <Stack gap="md">
            <Title>{t("Rules")}</Title>
            <Suspense fallback={<Center my="xl"><Loader /></Center>}>
                <Content content={rules} attachments={[]} />
            </Suspense>
        </Stack>
    );
}
