import { Center, Loader, Stack, Text, Title } from "@mantine/core";
import { lazy, Suspense, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { pickDocumentRef } from "../../../../api/activityDocuments";
import { Activity } from "../../../../api/ParticipantApi";
import { useApiEffect } from "../../../../provider/apiContext";
import LoadState from "../../../../components/LoadState";

const ContentView = lazy(() => import("../../../../content/ContentView"));

/**
 * The activity's rules.
 *
 * A document like the two front pages and like a problem statement: stored as a
 * file, referred to by id, and optional. Whoever runs the activity may publish
 * none, and then there is nothing here — and nothing linking here either, so
 * anybody reading this arrived by typing the address or from a bookmark kept
 * from before it was withdrawn.
 */
export default function RulesPage() {
    const { t, i18n } = useTranslation();
    const { activityId } = useParams();

    const [activity, setActivity] = useState<Activity | undefined>(undefined);
    // Null rather than undefined for "asked, and there is none".
    const [content, setContent] = useState<string | undefined | null>(undefined);

    const error = useApiEffect(async (api) => {
        if (!activityId) return;
        const loaded = await api.participantApi.getActivity(activityId);
        setActivity(loaded);
        const ref = pickDocumentRef(loaded.documents, "rules", i18n.language);
        setContent(ref ? await api.fileApi.getText(ref.fileId) : null);
    }, [activityId, i18n.language]);

    if (!activity || content === undefined) {
        return <LoadState error={error} loading={!error} />;
    }

    return (
        <Stack gap="md">
            <Title>{t("Rules")}</Title>
            {content === null ? (
                <Text c="dimmed">{t("This activity publishes no rules.")}</Text>
            ) : (
                <Suspense fallback={<Center my="xl"><Loader /></Center>}>
                    <ContentView content={content} attachments={[]} />
                </Suspense>
            )}
        </Stack>
    );
}
