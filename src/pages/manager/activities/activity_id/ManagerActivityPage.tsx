import { Alert, Badge, Button, Group, Stack, Tabs, Text, Title } from "@mantine/core";
import { IconArchive, IconArchiveOff, IconArrowLeft, IconDeviceFloppy, IconExternalLink } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ACTIVITY_DOCUMENT_KINDS, activityEntryPath } from "../../../../api/activityDocuments";
import { ActivityInput, ManagedActivity, ManagedProblem, ManagedSeries } from "../../../../api/ManagerApi";
import { ActivityDocumentKind, ActivityDocumentRef } from "../../../../api/ParticipantApi";
import ActivityForm from "../../../../components/activity/ActivityForm";
import { toInput } from "../../../../components/activity/activityInput";
import DocumentsPanel from "../../../../components/content/DocumentsPanel";
import LoadState from "../../../../components/LoadState";
import { useApiCall, useApiEffect } from "../../../../provider/apiContext";
import { sha256 } from "../../../../utils/sha256";
import ParticipantsPanel from "./ParticipantsPanel";
import SeriesPanel from "./SeriesPanel";

export default function ManagerActivityPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const call = useApiCall();
    const { activityId } = useParams();
    // The tab lives in the URL so a reload, a bookmark and a shared link all
    // land where the manager was rather than back on the first tab.
    const [query, setQuery] = useSearchParams();
    const tab = query.get("tab") ?? "series";

    const [activity, setActivity] = useState<ManagedActivity | undefined>(undefined);
    const [draft, setDraft] = useState<ActivityInput | undefined>(undefined);
    const [series, setSeries] = useState<ManagedSeries[]>([]);
    const [problems, setProblems] = useState<ManagedProblem[]>([]);
    const [error, setError] = useState<string | undefined>(undefined);
    const [busy, setBusy] = useState(false);
    const [reload, setReload] = useState(0);

    const loadError = useApiEffect(async (api) => {
        if (!activityId) return;
        const loaded = await api.managerApi.getActivity(activityId);
        const loadedSeries = await api.managerApi.getSeries(loaded.id);
        // The picker offers what may be attached: archived entries have left it,
        // and a page of a hundred is more than any activity needs at once.
        const library = await api.managerApi.getProblems({ pageSize: 100 });

        // Set together: the series panel opens every series it is given on
        // mount, so arriving in two steps would leave it collapsed.
        setActivity(loaded);
        setDraft(toInput(loaded));
        setSeries(loadedSeries);
        setProblems(library.items);

        api.managerApi.eventDispatcher.addEventListener("seriesChanged", evt => {
            if (evt.data.activityId === loaded.id) setReload(n => n + 1);
        });
    }, [activityId, reload]);

    const run = async (operation: () => Promise<unknown>) => {
        setError(undefined);
        setBusy(true);
        try {
            await operation();
            setReload(n => n + 1);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    };

    /** Uploads bytes and answers with the id the activity will reference. */
    const store = async (bytes: Blob, name: string) => {
        const checksum = await sha256(bytes);
        return await call(api => api.fileApi.upload(bytes, name, checksum));
    };

    if (!activity || !draft) return <LoadState error={loadError} loading={!loadError} />;

    return (
        <Stack gap="md">
            <Group justify="space-between" wrap="wrap">
                <Stack gap={2}>
                    <Group gap="xs">
                        <Title order={2}>{activity.name}</Title>
                        {activity.archivedAt && <Badge color="gray">{t("Archived")}</Badge>}
                    </Group>
                    <Text size="sm" c="dimmed" ff="monospace">
                        {activity.slug} · {activity.type} · {activity.rankingType} · {activity.timeZone}
                    </Text>
                </Stack>
                <Group gap="xs">
                    <Button
                        variant="default"
                        leftSection={<IconExternalLink size={16} />}
                        component={Link}
                        to={activityEntryPath(activity)}
                    >
                        {t("Open as a participant")}
                    </Button>
                    <Button
                        variant="default"
                        leftSection={activity.archivedAt ? <IconArchiveOff size={16} /> : <IconArchive size={16} />}
                        loading={busy}
                        onClick={() => run(() => call(api =>
                            api.managerApi.setActivityArchived(activity.id, !activity.archivedAt)))}
                    >
                        {activity.archivedAt ? t("Restore") : t("Archive")}
                    </Button>
                    <Button variant="default" leftSection={<IconArrowLeft size={16} />} onClick={() => navigate("/manager/activities")}>
                        {t("Back")}
                    </Button>
                </Group>
            </Group>

            {error && <Alert color="red" withCloseButton onClose={() => setError(undefined)}>{error}</Alert>}

            {activity.archivedAt && (
                <Alert color="gray">
                    {t("An archived activity stays readable and accepts nothing new. Restore it to keep editing.")}
                </Alert>
            )}

            <Tabs value={tab} onChange={value => setQuery(value ? { tab: value } : {}, { replace: true })}>
                <Tabs.List>
                    <Tabs.Tab value="series">{t("Series and problems")} ({activity.problemCount})</Tabs.Tab>
                    <Tabs.Tab value="settings">{t("Settings")}</Tabs.Tab>
                    <Tabs.Tab value="documents">{t("Documents")}</Tabs.Tab>
                    <Tabs.Tab value="participants">{t("Participants")} ({activity.participantCount})</Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value="series" pt="md">
                    <SeriesPanel
                        activity={activity}
                        series={series}
                        problems={problems}
                        onChanged={() => setReload(n => n + 1)}
                        onError={setError}
                    />
                </Tabs.Panel>

                <Tabs.Panel value="settings" pt="md">
                    <Stack gap="md">
                        <ActivityForm
                            value={draft}
                            onChange={setDraft}
                            slugLocked
                            disabled={activity.archivedAt !== undefined}
                        />
                        <Group justify="flex-end">
                            <Button
                                leftSection={<IconDeviceFloppy size={16} />}
                                loading={busy}
                                disabled={activity.archivedAt !== undefined}
                                onClick={() => run(() => call(api => api.managerApi.updateActivity(activity.id, draft)))}
                            >
                                {t("Save")}
                            </Button>
                        </Group>
                    </Stack>
                </Tabs.Panel>

                <Tabs.Panel value="documents" pt="md">
                    {/* The same editor the instance publishes its documents in.
                        An activity is simply a second owner of the same kind of
                        thing, so it gets the same screen rather than a copy. */}
                    <DocumentsPanel<ActivityDocumentKind, ActivityDocumentRef>
                        kinds={ACTIVITY_DOCUMENT_KINDS}
                        label={kind => t(`activityDocument.${kind}`)}
                        published={activity.documents}
                        fileName={(kind, language) => language ? `${kind}-${language}.md` : `${kind}.md`}
                        busy={busy}
                        run={run}
                        store={store}
                        readText={fileId => call(api => api.fileApi.getText(fileId))}
                        publish={(kind, statements) =>
                            call(api => api.managerApi.publishActivityDocument(activity.id, kind, statements))}
                        unpublish={kind =>
                            call(api => api.managerApi.unpublishActivityDocument(activity.id, kind))}
                        history={kind =>
                            call(api => api.managerApi.getActivityDocumentHistory(activity.id, kind))}
                    />
                </Tabs.Panel>

                <Tabs.Panel value="participants" pt="md">
                    <ParticipantsPanel activity={activity} onError={setError} />
                </Tabs.Panel>
            </Tabs>
        </Stack>
    );
}
