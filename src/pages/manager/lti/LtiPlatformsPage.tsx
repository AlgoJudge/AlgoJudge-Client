import {
    ActionIcon, Alert, Badge, Button, Card, Code, Group, Modal, Stack, Switch, Table, Text,
    TextInput, Title, Tooltip,
} from "@mantine/core";
import { IconAlertTriangle, IconCopy, IconPlus, IconShieldLock, IconTrash } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Platform, PlatformInput, ToolRegistration } from "../../../api/LtiApi";
import LoadState from "../../../components/LoadState";
import { CopyButton } from "../../../components/buttons";
import { useApiCall, useApiEffect } from "../../../provider/apiContext";

/**
 * The platforms this installation accepts launches from.
 *
 * <b>Manual, by decision.</b> Dynamic Registration arrives later and does not
 * confer the one setting on this screen that matters — whether a platform may
 * say who somebody is. That stays a person's decision, made here.
 *
 * What this screen has to say out loud, because a form showing fields says none
 * of it:
 *
 * - <b>identity authority is the dangerous one.</b> A platform trusted with it
 *   can claim any account in the directory it names, so a compromised Moodle
 *   becomes a way into those accounts. It is off unless somebody turns it on.
 * - the issuer, client id and deployment id <b>cannot be changed afterwards</b>:
 *   they are the key every launch and every identity link hangs off.
 * - there is <b>no secret</b> anywhere in this, and its absence is not a gap —
 *   LTI authenticates a tool by a signature, and the tool's private key never
 *   leaves the Server.
 */
export default function LtiPlatformsPage() {
    const { t } = useTranslation();

    const call = useApiCall();

    const [platforms, setPlatforms] = useState<Platform[] | undefined>(undefined);
    const [registration, setRegistration] = useState<ToolRegistration | undefined>(undefined);
    const [draft, setDraft] = useState<Draft | undefined>(undefined);
    const [removing, setRemoving] = useState<Platform | undefined>(undefined);
    const [saveError, setSaveError] = useState<string | undefined>(undefined);
    const [busy, setBusy] = useState(false);
    const [reload, setReload] = useState(0);

    const error = useApiEffect(async (api) => {
        setPlatforms(await api.ltiApi.listPlatforms());
    }, [reload]);

    /** The same shape the providers screen uses: one place that catches and shows. */
    const run = async (operation: () => Promise<unknown>) => {
        setBusy(true);
        setSaveError(undefined);
        try {
            await operation();
            setReload(n => n + 1);
            return true;
        } catch (e) {
            setSaveError(e instanceof Error ? e.message : String(e));
            return false;
        } finally {
            setBusy(false);
        }
    };

    const save = async () => {
        if (!draft) return;
        const input = toInput(draft);
        const done = await run(() => call(api => draft.id
            ? api.ltiApi.updatePlatform(draft.id!, input)
            : api.ltiApi.registerPlatform(input)));
        if (done) setDraft(undefined);
    };

    const remove = async () => {
        if (!removing) return;
        const done = await run(() => call(api => api.ltiApi.deletePlatform(removing.id)));
        if (done) setRemoving(undefined);
    };

    const showRegistration = (id: string) =>
        void run(async () => setRegistration(await call(api => api.ltiApi.getRegistration(id))));

    return (
        <Stack gap="lg">
            <Group justify="space-between" align="flex-end">
                <div>
                    <Title order={2}>{t("LTI platforms")}</Title>
                    <Text c="dimmed" size="sm">
                        {t("Course platforms that may open AlgoJudge activities for their students.")}
                    </Text>
                </div>
                <Button leftSection={<IconPlus size={18} />} onClick={() => setDraft(empty())}>
                    {t("Register a platform")}
                </Button>
            </Group>

            <Alert variant="light" icon={<IconShieldLock size={18} />}>
                <Text size="sm">
                    {t("AlgoJudge implements the LTI 1.3 specification. It is not certified by 1EdTech.")}
                </Text>
            </Alert>

            <LoadState loading={platforms === undefined} error={error}>
                {platforms?.length === 0
                    ? <Text c="dimmed">{t("No platform is registered. Nothing can launch into this installation yet.")}</Text>
                    : (
                        <Table highlightOnHover>
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th>{t("Platform")}</Table.Th>
                                    <Table.Th>{t("Issuer")}</Table.Th>
                                    <Table.Th>{t("Identity")}</Table.Th>
                                    <Table.Th />
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {platforms?.map(platform => (
                                    <Table.Tr key={platform.id}>
                                        <Table.Td>
                                            <Group gap="xs">
                                                <Text fw={500}>{platform.displayName}</Text>
                                                {!platform.enabled && (
                                                    <Badge color="gray" variant="light">{t("Disabled")}</Badge>
                                                )}
                                            </Group>
                                            <Text size="xs" c="dimmed">
                                                {t("Deployment")} {platform.deploymentId}
                                            </Text>
                                        </Table.Td>
                                        <Table.Td>
                                            <Text size="sm">{platform.issuer}</Text>
                                            <Text size="xs" c="dimmed">{platform.clientId}</Text>
                                        </Table.Td>
                                        <Table.Td>
                                            {platform.isIdentityAuthority
                                                ? (
                                                    // Said in colour because it is the setting that
                                                    // decides whether a compromised platform can take
                                                    // an account.
                                                    <Badge color="orange" variant="light">
                                                        {t("May assert identity in")} {platform.identityNamespace}
                                                    </Badge>
                                                )
                                                : <Text size="sm" c="dimmed">{t("Cannot assert identity")}</Text>}
                                        </Table.Td>
                                        <Table.Td>
                                            <Group gap="xs" justify="flex-end" wrap="nowrap">
                                                <Button
                                                    size="xs"
                                                    variant="default"
                                                    onClick={() => showRegistration(platform.id)}
                                                >
                                                    {t("What to type into it")}
                                                </Button>
                                                <Button
                                                    size="xs"
                                                    variant="subtle"
                                                    onClick={() => setDraft(draftFrom(platform))}
                                                >
                                                    {t("Edit")}
                                                </Button>
                                                <Tooltip label={t("Remove")}>
                                                    <ActionIcon
                                                        variant="subtle"
                                                        color="red"
                                                        onClick={() => setRemoving(platform)}
                                                    >
                                                        <IconTrash size={16} />
                                                    </ActionIcon>
                                                </Tooltip>
                                            </Group>
                                        </Table.Td>
                                    </Table.Tr>
                                ))}
                            </Table.Tbody>
                        </Table>
                    )}
            </LoadState>

            <Modal
                opened={registration !== undefined}
                onClose={() => setRegistration(undefined)}
                title={t("What to type into the platform")}
                size="lg"
            >
                <Stack gap="sm">
                    <Text size="sm" c="dimmed">
                        {t("The same for every platform. Paste them into the external tool's configuration.")}
                    </Text>
                    {registration && ([
                        [t("Tool URL"), registration.toolUrl],
                        [t("Login URL"), registration.loginUrl],
                        [t("Redirect URI"), registration.redirectUri],
                        [t("Public key set URL"), registration.keySetUrl],
                    ] as const).map(([label, value]) => (
                        <Group key={label} justify="space-between" wrap="nowrap" gap="xs">
                            <div style={{ minWidth: 0 }}>
                                <Text size="xs" c="dimmed">{label}</Text>
                                <Code>{value}</Code>
                            </div>
                            <CopyButton value={value} size="compact-xs" variant="subtle">
                                {() => (
                                    <Group gap={4} wrap="nowrap">
                                        <IconCopy size={13} />
                                        {t("Copy")}
                                    </Group>
                                )}
                            </CopyButton>
                        </Group>
                    ))}

                    <Alert variant="light" color="yellow" icon={<IconAlertTriangle size={18} />}>
                        <Text size="sm" mb="xs">
                            {t("Without these custom parameters a launch cannot tell who arrived, and lands on a sign-in page instead of the activity.")}
                        </Text>
                        {registration?.customParameters.map(parameter => (
                            <Code key={parameter} block>{parameter}</Code>
                        ))}
                        <Text size="xs" c="dimmed" mt="xs">
                            {t("And on each placement, one more naming the activity: activity=<its slug>.")}
                        </Text>
                    </Alert>
                </Stack>
            </Modal>

            <Modal
                opened={draft !== undefined}
                onClose={() => setDraft(undefined)}
                title={draft?.id ? t("Edit the platform") : t("Register a platform")}
                size="lg"
            >
                {draft && (
                    <Stack gap="sm">
                        <TextInput
                            label={t("Name")}
                            value={draft.displayName}
                            onChange={e => setDraft({ ...draft, displayName: e.currentTarget.value })}
                        />
                        <TextInput
                            label={t("Issuer")}
                            description={draft.id ? t("Cannot be changed: every launch and every identity link hangs off it.") : undefined}
                            disabled={Boolean(draft.id)}
                            value={draft.issuer}
                            onChange={e => setDraft({ ...draft, issuer: e.currentTarget.value })}
                        />
                        <Group grow>
                            <TextInput
                                label={t("Client id")}
                                disabled={Boolean(draft.id)}
                                value={draft.clientId}
                                onChange={e => setDraft({ ...draft, clientId: e.currentTarget.value })}
                            />
                            <TextInput
                                label={t("Deployment id")}
                                disabled={Boolean(draft.id)}
                                value={draft.deploymentId}
                                onChange={e => setDraft({ ...draft, deploymentId: e.currentTarget.value })}
                            />
                        </Group>
                        <TextInput
                            label={t("Public key set URL")}
                            value={draft.keySetUrl}
                            onChange={e => setDraft({ ...draft, keySetUrl: e.currentTarget.value })}
                        />
                        <TextInput
                            label={t("Access token URL")}
                            value={draft.authTokenUrl}
                            onChange={e => setDraft({ ...draft, authTokenUrl: e.currentTarget.value })}
                        />
                        <TextInput
                            label={t("Authorization URL")}
                            value={draft.authLoginUrl}
                            onChange={e => setDraft({ ...draft, authLoginUrl: e.currentTarget.value })}
                        />

                        <Card withBorder padding="sm" bg="var(--mantine-color-orange-light)">
                            <Switch
                                label={t("This platform may say who somebody is")}
                                checked={draft.isIdentityAuthority}
                                onChange={e => setDraft({
                                    ...draft, isIdentityAuthority: e.currentTarget.checked,
                                })}
                            />
                            <Text size="xs" mt="xs">
                                {t("With this on, a launch connects itself to the AlgoJudge account whose username the platform sends. A platform that is compromised can then reach those accounts. Leave it off unless the same people administer both.")}
                            </Text>
                            {draft.isIdentityAuthority && (
                                <TextInput
                                    mt="sm"
                                    label={t("Only for accounts from this identity provider")}
                                    description={t("Its slug. Accounts that did not come through it — local ones, and administrators — cannot be claimed.")}
                                    value={draft.identityNamespace}
                                    onChange={e => setDraft({
                                        ...draft, identityNamespace: e.currentTarget.value,
                                    })}
                                />
                            )}
                        </Card>

                        <Switch
                            label={t("Accept launches")}
                            checked={draft.enabled}
                            onChange={e => setDraft({ ...draft, enabled: e.currentTarget.checked })}
                        />

                        {saveError !== undefined && (
                            <Alert color="red" variant="light" icon={<IconAlertTriangle size={18} />}>
                                {saveError}
                            </Alert>
                        )}

                        <Group justify="flex-end">
                            <Button variant="default" onClick={() => setDraft(undefined)}>
                                {t("Cancel")}
                            </Button>
                            <Button loading={busy} onClick={() => void save()}>
                                {draft.id ? t("Save") : t("Register")}
                            </Button>
                        </Group>
                    </Stack>
                )}
            </Modal>

            <Modal
                opened={removing !== undefined}
                onClose={() => setRemoving(undefined)}
                title={t("Remove this platform?")}
            >
                <Stack gap="sm">
                    <Text size="sm">
                        {t("Refused while any course still has an activity from it. Switching it off is the reversible act.")}
                    </Text>
                    <Group justify="flex-end">
                        <Button variant="default" onClick={() => setRemoving(undefined)}>
                            {t("Cancel")}
                        </Button>
                        <Button color="red" loading={busy} onClick={() => void remove()}>
                            {t("Remove")}
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </Stack>
    );
}

interface Draft extends PlatformInput {
    id?: string;
    identityNamespace: string;
}

const empty = (): Draft => ({
    displayName: "",
    issuer: "",
    clientId: "",
    deploymentId: "",
    keySetUrl: "",
    authTokenUrl: "",
    authLoginUrl: "",
    isIdentityAuthority: false,
    identityNamespace: "",
    enabled: true,
});

const draftFrom = (platform: Platform): Draft => ({
    id: platform.id,
    displayName: platform.displayName,
    issuer: platform.issuer,
    clientId: platform.clientId,
    deploymentId: platform.deploymentId,
    keySetUrl: platform.keySetUrl,
    authTokenUrl: platform.authTokenUrl,
    authLoginUrl: platform.authLoginUrl,
    isIdentityAuthority: platform.isIdentityAuthority,
    identityNamespace: platform.identityNamespace ?? "",
    usernameClaim: platform.usernameClaim,
    enabled: platform.enabled,
});

const toInput = (draft: Draft): PlatformInput => ({
    displayName: draft.displayName,
    issuer: draft.issuer,
    clientId: draft.clientId,
    deploymentId: draft.deploymentId,
    keySetUrl: draft.keySetUrl,
    authTokenUrl: draft.authTokenUrl,
    authLoginUrl: draft.authLoginUrl,
    isIdentityAuthority: draft.isIdentityAuthority,
    // Empty is absent, never an empty string: the Server reads "no namespace"
    // from its absence and refuses the dangerous combination on it.
    identityNamespace: draft.identityNamespace.trim() || undefined,
    usernameClaim: draft.usernameClaim,
    enabled: draft.enabled,
});
