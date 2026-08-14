import { Alert, Button, Stack, Text, Title } from "@mantine/core";
import { IconExternalLink, IconInfoCircle } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";

/**
 * The one action §4.4 allows when a launch resolves to nobody.
 *
 * Somebody arrived from their course and AlgoJudge could not tell who they are:
 * the platform is not trusted to say, or it said a name no account holds. The
 * answer is not to create anything — no self-registration, and a launch must not
 * route around that — but to have them sign in the ordinary way <b>and come back
 * to where the launch was going</b>. One click, once, and the link is written by
 * a route nobody can forge.
 *
 * <b>It opens in a new tab.</b> Signing in inside the frame means a third-party
 * cookie, which is the arrangement that failed a moment ago; sending somebody
 * through it again would fail the same way and look like the tool ignoring them.
 */
export default function LaunchSignInPage() {
    const { t } = useTranslation();
    const [parameters] = useSearchParams();

    // Where the launch was going. Kept as given and never built from anything a
    // platform sent: it is a local path this Client produced.
    const returnTo = parameters.get("returnTo") ?? "/";
    const destination = returnTo.startsWith("/") ? returnTo : "/";

    return (
        <Stack gap="md" maw={560} mx="auto" my="xl">
            <Title order={3}>{t("One sign-in and you are in")}</Title>

            <Alert variant="light" icon={<IconInfoCircle size={18} />}>
                <Text size="sm">
                    {t("Your course opened AlgoJudge, but AlgoJudge does not yet know which account is yours. Signing in once connects the two, and your course will open straight away from then on.")}
                </Text>
            </Alert>

            <Button
                component="a"
                href={`/login?returnUrl=${encodeURIComponent(destination)}`}
                target="_blank"
                rel="noopener noreferrer"
                leftSection={<IconExternalLink size={18} />}
            >
                {t("Sign in to AlgoJudge")}
            </Button>

            <Text size="xs" c="dimmed">
                {t("It opens in a new tab, because signing in inside a course page does not work in every browser.")}
            </Text>
        </Stack>
    );
}
