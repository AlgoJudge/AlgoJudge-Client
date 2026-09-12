import {
    Container, Group, Image, Loader, Paper, SimpleGrid, Stack, Text, Title,
} from "@mantine/core";
import { IconTool, IconWifiOff } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ServerAway } from "../../provider/maintenanceContext";
import illustration from "../../assets/hero.png";

/**
 * What the whole interface becomes while the Server is away.
 *
 * **No button.** Every action this page could offer needs the Server that is not
 * answering — reloading, signing in, going home — so a control that does nothing
 * would only invite somebody to press it twice. The screen waits instead, and
 * the wait is visible: the provider is polling, and the spinner is what says so.
 *
 * Three sentences, not one. A planned window, an unreachable Server and a
 * device with no network are different facts and want different things done
 * about them: the first is waited out, the second is somebody's to fix, and the
 * third is the reader's own. The Client tells the first apart by whether
 * anything answered at all, and the third by asking the browser.
 *
 * **The third is why this is not left at two.** Once the application is
 * installed it opens on a phone that is often offline, and the service worker
 * serves the shell from its cache so this page is what that phone sees. Telling
 * somebody in a tunnel that the installation cannot be reached names the wrong
 * thing as broken.
 *
 * The drawing beside them is the product's own, `alt=""` because it says
 * nothing the sentences do not. **It is not a control**, and this page still
 * has none: a picture cannot be pressed, and the check counts every `button`
 * and every `a` inside the panel.
 */
/** Whether the device believes it has a network, kept current. */
const useOnline = () => {
    const [online, setOnline] = useState(() => navigator.onLine);
    useEffect(() => {
        const update = () => setOnline(navigator.onLine);
        window.addEventListener("online", update);
        window.addEventListener("offline", update);
        return () => {
            window.removeEventListener("online", update);
            window.removeEventListener("offline", update);
        };
    }, []);
    return online;
};

export default function MaintenancePage({ away }: { away: ServerAway }) {
    const { t } = useTranslation();
    const online = useOnline();
    const planned = away.level !== undefined;
    // A level the Server stated outranks the browser's opinion of the network:
    // it can only have arrived by answering.
    const offline = !planned && !online;

    return (
        <Container size={940} my={80}>
            <Paper withBorder p="xl" radius="md" data-testid="maintenance">
                {/* The words first, so a reader on a telephone is told what is
                    happening before they are shown a robot. */}
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xl" style={{ alignItems: "center" }}>
                <Stack gap="sm">
                    <Group gap="xs">
                        {offline ? <IconWifiOff size={22} /> : <IconTool size={22} />}
                        <Title order={3}>
                            {planned
                                ? t("The Server is under maintenance")
                                : offline
                                    ? t("This device is offline")
                                    : t("The Server is not answering")}
                        </Title>
                    </Group>

                    <Text size="sm" c="dimmed">
                        {planned
                            ? t("Somebody is working on this installation. Nothing you sent has been lost, and this page returns on its own when the work is finished.")
                            : offline
                                ? t("This device has no network access. Nothing you sent has been lost, and this page returns on its own once the connection does.")
                                : t("This installation cannot be reached from here. It may be starting, or the connection may be down; this page returns on its own once it answers.")}
                    </Text>

                    {/* The operator's own words, shown as they were typed and
                        never translated: whoever wrote them chose them for
                        whoever is reading this. */}
                    {away.reason && (
                        <Text size="sm">{away.reason}</Text>
                    )}

                    <Group gap="xs" mt="xs">
                        <Loader size="xs" />
                        <Text size="xs" c="dimmed">{t("Waiting for the Server")}</Text>
                    </Group>
                </Stack>

                <Image src={illustration} alt="" />
                </SimpleGrid>
            </Paper>
        </Container>
    );
}
