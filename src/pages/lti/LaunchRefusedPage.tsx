import { Alert, Anchor, Button, Code, Stack, Text, Title } from "@mantine/core";
import { IconAlertTriangle, IconExternalLink } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";

/**
 * Why a launch did not open, in a sentence somebody can act on.
 *
 * The Server redirects here with a code rather than a message, because the
 * reader's language is decided in this repository — and because a student
 * mid-lab reading `invalid_grant` has been told nothing at all.
 *
 * <b>The audience is two people at once</b>, which is why several of these say
 * "ask whoever set this up": a learner can do nothing about a misconfigured
 * placement, and a teacher reading the same screen needs to know which of their
 * settings is wrong.
 */
export default function LaunchRefusedPage() {
    const { t } = useTranslation();
    const [parameters] = useSearchParams();
    const reason = parameters.get("reason") ?? "";

    const explanation = explain(reason, t);

    return (
        <Stack gap="md" maw={620} mx="auto" my="xl">
            <Title order={3}>{t("This activity could not open")}</Title>

            <Alert
                variant="light"
                color="red"
                icon={<IconAlertTriangle size={18} />}
                title={explanation.title}
            >
                <Text size="sm">{explanation.detail}</Text>
            </Alert>

            {explanation.forTheTeacher && (
                <Text size="sm" c="dimmed">{explanation.forTheTeacher}</Text>
            )}

            {/* The code travels where a person can copy it. A support message
                saying "it does not work" costs an exchange of emails; one saying
                `sharingNotAcknowledged` is answered in a minute. */}
            <Text size="xs" c="dimmed">
                {t("Reference")}: <Code>{reason || "unknown"}</Code>
            </Text>

            <Button
                component="a"
                href="/"
                target="_top"
                variant="default"
                leftSection={<IconExternalLink size={18} />}
            >
                {t("Go to AlgoJudge")}
            </Button>

            <Anchor href="/" target="_top" size="xs" c="dimmed">
                {t("Sign in and find the activity yourself")}
            </Anchor>
        </Stack>
    );
}

interface Explanation {
    title: string;
    detail: string;
    /** What the person who configured the placement has to change, if anybody. */
    forTheTeacher?: string;
}

/**
 * One entry per code the Server can send. Anything unrecognised falls to a
 * sentence that admits it — inventing a reassuring one for a code this
 * repository does not know is how a wrong explanation gets acted on.
 */
const explain = (reason: string, t: (key: string) => string): Explanation => {
    switch (reason) {
        case "noActivity":
            return {
                title: t("This activity is not connected to anything yet"),
                detail: t("The link in your course does not say which AlgoJudge activity it should open."),
                forTheTeacher: t("In the course, edit this external tool and add a custom parameter: activity=<the activity's slug>."),
            };
        case "sharingNotAcknowledged":
            return {
                title: t("This activity is already used by another course"),
                detail: t("Somebody has to confirm that it should be reachable from both before it opens here."),
                forTheTeacher: t("Open the activity in AlgoJudge and accept that it is shared, or place a copy of it in this course instead."),
            };
        case "unknownPlatform":
            return {
                title: t("AlgoJudge does not know this course platform"),
                detail: t("Nobody has registered it, so a launch from it cannot be trusted."),
                forTheTeacher: t("An AlgoJudge administrator registers the platform once, and every course on it works afterwards."),
            };
        case "platformDisabled":
            return {
                title: t("Launches from this platform are switched off"),
                detail: t("An administrator turned them off. Nothing has been lost — the activity and its results are still there."),
            };
        case "platformUnreachable":
            return {
                title: t("AlgoJudge could not reach the course platform"),
                detail: t("The two have to talk to each other to open an activity, and that did not work this time."),
                forTheTeacher: t("Usually temporary. If it lasts, an administrator should check that AlgoJudge can reach the platform over the network."),
            };
        case "badState":
        case "badToken":
            return {
                title: t("The launch could not be verified"),
                detail: t("Most often this is a page that was left open too long, or one that was reloaded. Going back to the course and clicking the activity again usually works."),
            };
        case "unsupportedMessage":
            return {
                title: t("This kind of link is not supported yet"),
                detail: t("AlgoJudge opens an activity link. Whatever was clicked asked for something else."),
            };
        default:
            return {
                title: t("The launch was refused"),
                detail: t("AlgoJudge did not accept this launch and did not say why in a way this page recognises."),
            };
    }
};
