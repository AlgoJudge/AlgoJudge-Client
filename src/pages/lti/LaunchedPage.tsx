import { Alert, Anchor, Button, Center, Loader, Stack, Text, Title } from "@mantine/core";
import { IconAlertTriangle, IconExternalLink } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../provider/authContext";
import { useLaunch } from "../../provider/launchContext";

/**
 * Where a launch lands, and the only page that knows it was one.
 *
 * It has three jobs and then gets out of the way: wait for the ticket to be
 * exchanged, send the person into the activity, and — when the session did not
 * survive the frame — say so.
 *
 * <b>That last one is the whole reason this is a page rather than a redirect.</b>
 * §5.3 asks for a stated fallback, because silence in an iframe is
 * indistinguishable from a broken tool: a learner sees an empty rectangle inside
 * their course and has no way to tell whether the tool is down, whether they are
 * signed out, or whether the teacher configured it wrongly.
 */
export default function LaunchedPage() {
    const { t } = useTranslation();
    const { status, launch } = useLaunch();
    const auth = useAuth();

    if (status === "loading" || auth.status === "loading") {
        return <Center my="xl"><Loader /></Center>;
    }

    // The launch worked and a session exists: into the activity, and this page
    // is never seen again.
    if (launch && auth.status === "authenticated") {
        return <Navigate to={`/activities/${launch.activitySlug}`} replace />;
    }

    // A ticket that was already spent, with a session: a reload, most likely.
    // The full interface works, so the person is not stuck.
    if (auth.status === "authenticated") {
        return <Navigate to="/activities" replace />;
    }

    // **No session inside the frame.** This is §5.3's open half made visible:
    // the launch itself needs no cookie — the state lives on the Server, because
    // Moodle implements no Platform Storage — but the session that follows it is
    // a cookie, and in an iframe that cookie is third-party.
    return (
        <Stack gap="md" maw={560} mx="auto" my="xl">
            <Title order={3}>{t("This activity could not open here")}</Title>

            <Alert
                variant="light"
                color="yellow"
                icon={<IconAlertTriangle size={18} />}
                title={t("Your browser is blocking the sign-in for this frame")}
            >
                <Text size="sm">
                    {t("AlgoJudge is shown inside your course, which makes it a different site as far as the browser is concerned. Some browsers refuse to keep a session in that position.")}
                </Text>
            </Alert>

            <Text size="sm">
                {t("Opening it in its own tab works, and you stay signed in there.")}
            </Text>

            <Button
                component="a"
                href={window.location.href}
                target="_blank"
                rel="noopener noreferrer"
                leftSection={<IconExternalLink size={18} />}
                variant="filled"
            >
                {t("Open in a new tab")}
            </Button>

            <Text size="xs" c="dimmed">
                {t("If it keeps happening, tell whoever administers the course: the tool may need to be set to open in a new window.")}
            </Text>

            <Anchor href="/" target="_top" size="sm">
                {t("Go to AlgoJudge")}
            </Anchor>
        </Stack>
    );
}
