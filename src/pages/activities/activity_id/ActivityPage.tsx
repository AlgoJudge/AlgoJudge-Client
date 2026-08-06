import { Alert, Anchor, Button, Center, Checkbox, Group, Loader, Paper, PasswordInput, Stack, Text, Title } from "@mantine/core";
import { IconAlertTriangle, IconLock, IconLogin2, IconNotes } from "@tabler/icons-react";
import { lazy, Suspense, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useLocation, useParams } from "react-router-dom";
import { hasDocument, pickDocumentRef } from "../../../api/activityDocuments";
import { Activity } from "../../../api/ParticipantApi";
import DocumentModal from "../../../components/content/DocumentModal";
import LoadState from "../../../components/LoadState";
import { useApiCall, useApiEffect } from "../../../provider/apiContext";

const ContentView = lazy(() => import("../../../content/ContentView"));

/**
 * An activity's own page, in its two forms.
 *
 * Somebody **in** the activity reads what its organiser wrote for participants.
 * Somebody who is not reads what they wrote for outsiders, and gets the form to
 * enrol themselves — which is the only way in that does not involve a manager
 * doing it by hand.
 *
 * Both documents are optional, as every document in the product is. An activity
 * whose organiser wrote no participant page has nothing to draw here, so the
 * address does not stop: it goes on to the problems, which is what somebody
 * clicking the activity was after.
 */
export default function ActivityPage() {
    const { t, i18n } = useTranslation();
    const { activityId } = useParams();
    const location = useLocation();
    const call = useApiCall();

    const [activity, setActivity] = useState<Activity | undefined>(undefined);
    // Null rather than undefined for "asked, and there is none".
    const [content, setContent] = useState<string | undefined | null>(undefined);
    const [password, setPassword] = useState("");
    const [accepted, setAccepted] = useState(false);
    const [busy, setBusy] = useState(false);
    const [refused, setRefused] = useState<string | undefined>(undefined);
    const [reload, setReload] = useState(0);
    /** Whether the rules are open over the form. */
    const [reading, setReading] = useState(false);

    /**
     * The password out of the link.
     *
     * A fragment is never sent to a server — not to an access log, a proxy or a
     * referrer header — which is why the share link puts it there. It is taken
     * once and cleared, so it does not sit in the address bar afterwards or end
     * up in a screenshot of somebody's browser.
     */
    useEffect(() => {
        const fromLink = location.hash.replace(/^#/, "");
        if (!fromLink) return;
        setPassword(decodeURIComponent(fromLink));
        window.history.replaceState(null, "", location.pathname + location.search);
    }, [location.hash, location.pathname, location.search]);

    const error = useApiEffect(async (api) => {
        if (!activityId) return;
        const loaded = await api.participantApi.getActivity(activityId);
        setActivity(loaded);
        // Which document this is depends on which side of the fence the reader
        // is on, so enrolling changes the page as well as the sidebar.
        const kind = loaded.membership === "enrolled" ? "home" : "welcome";
        const ref = pickDocumentRef(loaded.documents, kind, i18n.language);
        setContent(ref ? await api.fileApi.getText(ref.fileId) : null);

        // Enrolling announces itself, and so does the organiser publishing a
        // document. Either way the whole page is asked for again rather than
        // patched: there is a document to fetch behind it.
        api.participantApi.eventDispatcher.addEventListener("activityUpdated", evt => {
            if (evt.data.activity.id === loaded.id) setReload(n => n + 1);
        });
    }, [activityId, i18n.language, reload]);

    if (!activity || content === undefined) {
        return <LoadState error={error} loading={!error} />;
    }

    const enrolled = activity.membership === "enrolled";

    // Nothing to stop for. The address still works; it simply carries on to
    // what the reader came for rather than drawing an empty page.
    if (enrolled && !hasDocument(activity.documents, "home")) {
        return <Navigate to={`/activities/${activity.slug}/problems`} replace />;
    }

    const rules = pickDocumentRef(activity.documents, "rules", i18n.language);
    const mustAccept = rules !== undefined;
    const needsPassword = activity.joinPolicy === "password";
    const canEnrol = activity.joinPolicy !== "closed"
        && (!mustAccept || accepted)
        && (!needsPassword || password.trim().length > 0);

    const enrol = async () => {
        setRefused(undefined);
        setBusy(true);
        try {
            await call(api => api.participantApi.enroll(activity.id, {
                password: needsPassword ? password : undefined,
                acceptedRules: mustAccept ? accepted : undefined,
            }));
            // The participant page is a different document from the one on
            // screen, so the whole page is asked for again. Bumped here as well
            // as by the event, because only the fake is certain to announce it.
            setReload(n => n + 1);
        } catch (e) {
            setRefused(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Stack gap="lg">
            <Group justify="space-between" align="center" wrap="wrap">
                <Title>{activity.name}</Title>
                {/* What somebody in the activity came for. Not offered to
                    anybody else: there is nothing there for them yet. */}
                {enrolled && (
                    <Button
                        component={Link}
                        to={`/activities/${activity.slug}/problems`}
                        leftSection={<IconNotes size={16} />}
                    >
                        {t("Go to the problems")}
                    </Button>
                )}
            </Group>

            {/* An activity whose organiser wrote nothing shows nothing: not a
                placeholder and not an apology. Somebody not enrolled still gets
                the form, which is what they came for. */}
            {content !== null && (
                <Paper withBorder p="xl" radius="md">
                    <Suspense fallback={<Center my="xl"><Loader /></Center>}>
                        <ContentView content={content} attachments={[]} />
                    </Suspense>
                </Paper>
            )}

            {!enrolled && (
                <Paper withBorder p="xl" radius="md">
                    <Stack gap="md">
                        <Title order={3}>{t("Enrol in this activity")}</Title>

                        {activity.joinPolicy === "closed" ? (
                            <Text c="dimmed">
                                {t("Enrolment in this activity is done by its organiser.")}
                            </Text>
                        ) : (
                            <>
                                {mustAccept && (
                                    <Checkbox
                                        checked={accepted}
                                        onChange={e => setAccepted(e.currentTarget.checked)}
                                        disabled={busy}
                                        required
                                        label={
                                            <Anchor
                                                component="button"
                                                type="button"
                                                size="sm"
                                                // Opened over the form. The
                                                // document's own name is the
                                                // modal's title, which is where
                                                // it belongs — repeating it here
                                                // said the same thing twice.
                                                onClick={() => setReading(true)}
                                            >
                                                {t("I have read and accept the rules")}
                                            </Anchor>
                                        }
                                    />
                                )}

                                {needsPassword && (
                                    <PasswordInput
                                        label={t("Join password")}
                                        description={t("The one you were given, or the one that came in the link")}
                                        leftSection={<IconLock size={16} />}
                                        value={password}
                                        onChange={e => setPassword(e.currentTarget.value)}
                                        disabled={busy}
                                        w={{ base: "100%", sm: 320 }}
                                    />
                                )}

                                {refused && (
                                    <Alert color="red" icon={<IconAlertTriangle size={18} />}>
                                        {refused}
                                    </Alert>
                                )}

                                <Group>
                                    <Button
                                        leftSection={<IconLogin2 size={16} />}
                                        onClick={() => void enrol()}
                                        loading={busy}
                                        disabled={!canEnrol}
                                    >
                                        {t("Enrol")}
                                    </Button>
                                </Group>
                            </>
                        )}
                    </Stack>
                </Paper>
            )}

            <DocumentModal
                opened={reading}
                onClose={() => setReading(false)}
                title={rules?.title ?? t("Rules")}
                fileId={rules?.fileId}
            />
        </Stack>
    );
}
