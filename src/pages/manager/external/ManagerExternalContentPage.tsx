import { Alert, Badge, Button, Card, Group, Stack, Text, TextInput, Title } from "@mantine/core";
import { IconInfoCircle, IconPlus, IconTrash } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useApiCall } from "../../../provider/apiContext";

/**
 * Where this installation may fetch documents from.
 *
 * **The list, and nothing about any particular service.** Importing a problem
 * needs its statement, and a host that sends no `Access-Control-Allow-Origin`
 * cannot be read by this page however willing the manager — so the Server
 * fetches it, and only from hosts named here.
 *
 * The switch that decides whether any of this happens lives with the rest of
 * the instance settings, because that is what it is. It is shown here because a
 * list of destinations reads as permission when the door is in fact shut.
 */
export default function ManagerExternalContentPage() {
    const { t } = useTranslation();
    const call = useApiCall();

    const [enabled, setEnabled] = useState<boolean | undefined>(undefined);
    const [hosts, setHosts] = useState<string[]>([]);
    const [adding, setAdding] = useState("");
    const [busy, setBusy] = useState(false);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        void (async () => {
            const answer = await call(api => api.managerApi.getExternalContent());
            setEnabled(answer.enabled);
            setHosts(answer.hosts);
        })();
        // Read once, on arrival. Nothing else on this screen changes it.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const save = async (next: string[]) => {
        setBusy(true);
        setSaved(false);
        try {
            const answer = await call(api => api.managerApi.setExternalContentHosts(next));
            setHosts(answer.hosts);
            setSaved(true);
        } finally {
            setBusy(false);
        }
    };

    const add = () => {
        const host = adding.trim();
        if (host.length === 0) return;
        setAdding("");
        void save([...hosts, host]);
    };

    return (
        <Stack gap="md">
            <Title order={2}>{t("External content")}</Title>
            <Text c="dimmed">
                {t("Where this installation may fetch documents from, and whether it may at all.")}
            </Text>

            {/* Said before the list, not after it: a list of destinations reads
                as permission, and the door may well be shut. */}
            {enabled === false && (
                <Alert color="orange" icon={<IconInfoCircle size={18} />}>
                    {t("Judging by services this installation does not run is switched off, so nothing here is fetched and no such problem is handed out. The switch is on the instance settings screen.")}
                </Alert>
            )}

            <Card withBorder padding="md">
                <Stack gap="sm">
                    <Group justify="space-between">
                        <Text fw={500}>{t("Hosts documents may be fetched from")}</Text>
                        {enabled === true && <Badge color="green" variant="light">{t("In force")}</Badge>}
                    </Group>

                    <Text size="sm" c="dimmed">
                        {t("Compared on the whole host, so a name that merely ends with one of these does not match. Only HTTPS, and only the default port. Removing everything means this installation fetches nothing.")}
                    </Text>

                    {hosts.length === 0 && (
                        <Text size="sm" c="dimmed">{t("No host is named, so nothing may be fetched.")}</Text>
                    )}

                    {hosts.map(host => (
                        <Group key={host} justify="space-between">
                            <Text ff="monospace">{host}</Text>
                            <Button
                                variant="subtle"
                                color="red"
                                size="compact-sm"
                                disabled={busy}
                                leftSection={<IconTrash size={16} />}
                                onClick={() => void save(hosts.filter(one => one !== host))}
                            >
                                {t("Remove")}
                            </Button>
                        </Group>
                    ))}

                    <Group align="flex-end" gap="sm">
                        <TextInput
                            style={{ flex: 1 }}
                            label={t("Add a host")}
                            placeholder="onlinejudge.org"
                            value={adding}
                            disabled={busy}
                            onChange={e => setAdding(e.currentTarget.value)}
                            onKeyDown={e => {
                                if (e.key === "Enter") add();
                            }}
                        />
                        <Button
                            disabled={busy || adding.trim().length === 0}
                            leftSection={<IconPlus size={16} />}
                            onClick={add}
                        >
                            {t("Add")}
                        </Button>
                    </Group>

                    {saved && <Text size="sm" c="dimmed">{t("Saved.")}</Text>}
                </Stack>
            </Card>
        </Stack>
    );
}
