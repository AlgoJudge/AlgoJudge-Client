import { Alert, Badge, Button, Card, Group, Stack, Table, Text, TextInput, Textarea, Title } from "@mantine/core";
import { IconInfoCircle, IconPlus, IconTrash } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useApiCall, useApiEffect } from "../../../provider/apiContext";
import { ImportOutcome, importOne, lookUp, numbersIn } from "./uvaImport";

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

    // **Through the wrapper, not a bare effect.** Written as `useEffect` plus
    // `useApiCall` this never resolved: the switch stayed neither on nor off,
    // so the import button was refused for ever and the screen explained
    // nothing. The wrapper also carries the abort and the refetch after a
    // connection comes back, which every screen wants and none should have to
    // remember.
    useApiEffect(async api => {
        const answer = await api.managerApi.getExternalContent();
        setEnabled(answer.enabled);
        setHosts(answer.hosts);
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

            <ImportCard enabled={enabled} />
        </Stack>
    );
}

/**
 * Importing problems by number.
 *
 * **The whole of the paste path.** A number carries neither a title nor an
 * address, so the catalogue is asked for the first and the second is built from
 * the number — and whether the statement still exists is settled by fetching
 * it, because a problem withdrawn from the archive has no document.
 *
 * Every number gets its own row in the answer. A batch that half worked is the
 * ordinary case, not an error: the ones that landed are problems now, and
 * reporting the batch as a single failure would hide them.
 */
function ImportCard({ enabled }: { enabled: boolean | undefined }) {
    const { t } = useTranslation();
    const call = useApiCall();

    const [text, setText] = useState("");
    const [busy, setBusy] = useState(false);
    const [outcomes, setOutcomes] = useState<ImportOutcome[]>([]);

    const numbers = numbersIn(text);

    const run = async () => {
        setBusy(true);
        setOutcomes([]);
        try {
            const done: ImportOutcome[] = [];
            for (const number of numbers) {
                // One at a time, and on purpose: this asks somebody else's
                // catalogue and this installation's Server for every entry, and
                // a burst of parallel requests to a public archive is rude in a
                // way nobody would notice here and everybody would notice there.
                const found = await lookUp(number).catch(() => undefined);
                done.push(found === undefined
                    ? { number, ok: false, reason: "unknown" }
                    : await call(scoped => importOne(scoped, found)));
                setOutcomes([...done]);
            }
        } finally {
            setBusy(false);
        }
    };

    const said = (outcome: ImportOutcome) => {
        if (outcome.ok) return t("Imported as {{slug}}", { slug: outcome.slug });
        switch (outcome.reason) {
            case "unknown": return t("The archive knows no problem with that number.");
            case "duplicate": return t("Already imported.");
            case "statement": return t("Its statement could not be fetched — the problem may have been withdrawn.");
            default: return outcome.detail ?? t("It could not be created.");
        }
    };

    return (
        <Card withBorder padding="md">
            <Stack gap="sm">
                <Text fw={500}>{t("Import problems from UVa Online Judge")}</Text>

                {enabled === false && (
                    <Alert color="orange" icon={<IconInfoCircle size={18} />}>
                        {t("Nothing can be imported while judging by services this installation does not run is switched off.")}
                    </Alert>
                )}

                <Text size="sm" c="dimmed">
                    {t("Problem numbers, separated by commas or spaces. Each becomes a problem of its own, named as the archive names it, visible to the whole installation.")}
                </Text>

                <Textarea
                    autosize
                    minRows={2}
                    placeholder="100, 101, 272"
                    value={text}
                    disabled={busy}
                    onChange={e => setText(e.currentTarget.value)}
                />

                <Group justify="space-between">
                    <Text size="sm" c="dimmed">
                        {t("{{count}} number(s) read", { count: numbers.length })}
                    </Text>
                    <Button
                        loading={busy}
                        disabled={enabled !== true || numbers.length === 0}
                        onClick={() => void run()}
                    >
                        {t("Import")}
                    </Button>
                </Group>

                {outcomes.length > 0 && (
                    <Table withTableBorder>
                        <Table.Tbody>
                            {outcomes.map(outcome => (
                                <Table.Tr key={outcome.number}>
                                    <Table.Td w={90}>{outcome.number}</Table.Td>
                                    <Table.Td>
                                        <Text size="sm" c={outcome.ok ? undefined : "red"}>
                                            {said(outcome)}
                                        </Text>
                                    </Table.Td>
                                </Table.Tr>
                            ))}
                        </Table.Tbody>
                    </Table>
                )}
            </Stack>
        </Card>
    );
}
