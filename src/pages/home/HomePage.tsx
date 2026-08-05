import { Alert, Badge, Button, Card, Center, Container, Grid, Group, Loader, Paper, Stack, Text, Title } from "@mantine/core";
import { IconAlertTriangle, IconArrowRight, IconListDetails, IconLogin, IconSettings } from "@tabler/icons-react";
import { lazy, Suspense, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { InstanceDocument } from "../../api/CoreApi";
import { Activity, Attachment } from "../../api/ParticipantApi";
import ActivityTime from "../../components/time/ActivityTime";
import { pickTranslation } from "../../components/content/languageName";
import { MANAGER_PERMISSIONS } from "../manager/managerAreas";
import { useApiEffect } from "../../provider/ApiProvider";
import { useAuth } from "../../provider/AuthProvider";
import { useInstance } from "../../provider/instanceContext";
import { usePermissions } from "../../provider/permissionsContext";

const ContentView = lazy(() => import("../../content/ContentView"));

/**
 * The front page, in its two forms.
 *
 * Both are text the operator owns, in the `content.md` format the Client already
 * renders: a visitor who is not signed in reads what this installation is and
 * how accounts are issued here, and somebody signed in reads a greeting with
 * their activities under it. One screen rather than two, because the only
 * difference is which document is asked for and what is drawn below it.
 *
 * The document may show the instance's mark as `logo.svg` — the operator's file,
 * or the placeholder that ships with the software. It is supplied as an
 * attachment, so an operator writes the same syntax a problem statement uses and
 * the page cannot reach outside the instance.
 */

const LOGO_ATTACHMENT = "logo.svg";

export default function HomePage() {
    const { t, i18n } = useTranslation();
    const { status, session } = useAuth();
    const { logoUrl } = useInstance();
    const { hasAny } = usePermissions();

    const [document, setDocument] = useState<InstanceDocument | undefined | null>(undefined);
    const [activities, setActivities] = useState<Activity[]>([]);

    const signedIn = status === "authenticated";

    useApiEffect(async (api) => {
        if (status === "loading") return;
        // Null rather than undefined for "asked, and there is none".
        setDocument(await api.authApi.getInstanceDocument(signedIn ? "home" : "welcome") ?? null);
        if (!signedIn) {
            setActivities([]);
            return;
        }
        // What the reader is here for. The list screen filters and pages; the
        // front page shows the first few and points at it.
        const page = await api.participantApi.getActivities({ page: 1, pageSize: 6 });
        setActivities(page.items);
    }, [status, signedIn]);

    // The operator's text in the reader's language, or the default where they
    // wrote none. The switch for that language is in the header and the footer,
    // so the page needs no control of its own.
    const shown = (document && pickTranslation(document.translations, i18n.language)?.content)
        ?? document?.content;

    // The mark, as the document's only attachment. Absent when the operator
    // turned it off — a reference then reports a missing attachment, which is
    // true, and is theirs to remove from their own text.
    const attachments: Attachment[] = logoUrl
        ? [{ name: LOGO_ATTACHMENT, mimeType: "image/svg+xml", sizeBytes: 0, url: logoUrl, sha256: "" }]
        : [];

    return (
        <Container size={900} my={40}>
            <Stack gap="lg">
                {document === undefined ? (
                    <Center my="xl"><Loader /></Center>
                ) : document === null ? (
                    <Alert color="yellow" icon={<IconAlertTriangle size={18} />}>
                        {t("This instance publishes no front page yet.")}
                    </Alert>
                ) : (
                    <>
                        {/* Said where an operator will see it, and only to
                            somebody who could act on it. A greeting nobody
                            replaced misleads no one; a policy would. */}
                        {document.isTemplate && signedIn && hasAny(MANAGER_PERMISSIONS) && (
                            <Alert color="orange" icon={<IconAlertTriangle size={18} />}>
                                {t("This is the front page that ships with the software. Replace it in the instance settings.")}
                            </Alert>
                        )}
                        <Paper withBorder p="xl" radius="md">
                            <Suspense fallback={<Center my="xl"><Loader /></Center>}>
                                <ContentView content={shown} attachments={attachments} />
                            </Suspense>
                        </Paper>
                    </>
                )}

                {!signedIn && status !== "loading" && (
                    <Group>
                        <Button component={Link} to="/login" leftSection={<IconLogin size={16} />} size="md">
                            {t("Sign in")}
                        </Button>
                    </Group>
                )}

                {signedIn && (
                    <Stack gap="sm">
                        <Group justify="space-between" wrap="wrap">
                            <Title order={3}>{t("Your activities")}</Title>
                            <Group gap="xs">
                                <Button
                                    component={Link}
                                    to="/activities"
                                    variant="light"
                                    rightSection={<IconArrowRight size={16} />}
                                >
                                    {t("All activities")}
                                </Button>
                                {/* Offered only to somebody who may open it: an
                                    entry that answers 403 is worse than none. */}
                                {hasAny(MANAGER_PERMISSIONS) && (
                                    <Button
                                        component={Link}
                                        to="/manager"
                                        variant="light"
                                        leftSection={<IconSettings size={16} />}
                                    >
                                        {t("Manager")}
                                    </Button>
                                )}
                            </Group>
                        </Group>

                        {activities.length === 0 ? (
                            <Text size="sm" c="dimmed">
                                {t("You are not enrolled in anything yet. An organiser adds you to an activity.")}
                            </Text>
                        ) : (
                            <Grid>
                                {activities.map(activity => (
                                    <Grid.Col key={activity.id} span={{ base: 12, sm: 6, md: 4 }}>
                                        <Card
                                            withBorder
                                            radius="md"
                                            component={Link}
                                            to={`/activities/${activity.slug}/problems`}
                                            h="100%"
                                        >
                                            <Stack gap={6}>
                                                <Group gap="xs" wrap="nowrap">
                                                    <IconListDetails size={16} />
                                                    <Text fw={500} lineClamp={2}>{activity.name}</Text>
                                                </Group>
                                                <Text size="xs" c="dimmed" ff="monospace">{activity.slug}</Text>
                                                {activity.startDate && (
                                                    <Text size="xs" c="dimmed">
                                                        <ActivityTime
                                                            value={activity.startDate}
                                                            timeZone={activity.timeZone}
                                                            format="datetime"
                                                        />
                                                    </Text>
                                                )}
                                                <Group gap={6}>
                                                    <Badge size="sm" variant="light">{activity.type}</Badge>
                                                </Group>
                                            </Stack>
                                        </Card>
                                    </Grid.Col>
                                ))}
                            </Grid>
                        )}
                        <Text size="sm" c="dimmed">
                            {t("Signed in as")} {session?.username}
                        </Text>
                    </Stack>
                )}
            </Stack>
        </Container>
    );
}
