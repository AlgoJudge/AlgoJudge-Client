import {
    ActionIcon, Alert, Badge, Button, Card, Group, Modal, Select, Stack, Switch, Table, Text,
    TextInput, Title, Tooltip,
} from "@mantine/core";
import {
    IconAlertTriangle, IconCopy, IconInfoCircle, IconPlus, IconShieldLock, IconTrash,
} from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
    DeletionRequest, IdentityProvider, IdentityProviderInput, MappingRule, PermissionTemplate,
} from "../../../api/ManagerApi";
import LoadState from "../../../components/LoadState";
import { CopyButton } from "../../../components/buttons";
import { useApiCall, useApiEffect } from "../../../provider/apiContext";

/**
 * Registering the identity providers this installation trusts, and the queue of
 * accounts asked to go.
 *
 * The two live on one screen because they are two halves of the same
 * relationship with a directory: what it may grant, and what it may take away.
 * The queue is a list here rather than an area of its own — almost everything in
 * it arrives over a provider's back channel, and the person who registered the
 * provider is the person who has to decide about it.
 *
 * **What this screen has to say out loud**, because none of it is visible in a
 * form that only shows fields:
 *
 * - a secret is **set and never read back**, so an empty box is not a loss;
 * - a mapping decides what an external directory's groups buy here, and two
 *   rules the Server enforces limit that;
 * - the callback path has to be pasted into the provider, and getting it wrong
 *   fails at the end of somebody's first sign-in with an error from them.
 */

interface Draft extends IdentityProviderInput {
    id?: string;
    hasClientSecret: boolean;
    hasDeletionSecret: boolean;
}

const draftFrom = (provider: IdentityProvider): Draft => ({
    id: provider.id,
    slug: provider.slug,
    displayName: provider.displayName,
    issuer: provider.issuer,
    clientId: provider.clientId,
    scopes: provider.scopes,
    enabled: provider.enabled,
    accountUrl: provider.accountUrl ?? "",
    claimPath: provider.claimPath,
    unmappedBehavior: provider.unmappedBehavior,
    defaultTemplateName: provider.defaultTemplateName,
    deletionChannelEnabled: provider.deletionChannelEnabled,
    mappingRules: [...provider.mappingRules],
    hasClientSecret: provider.hasClientSecret,
    hasDeletionSecret: provider.hasDeletionSecret,
});

const blank = (): Draft => ({
    slug: "",
    displayName: "",
    issuer: "",
    clientId: "",
    scopes: "openid profile email",
    enabled: true,
    accountUrl: "",
    claimPath: "groups",
    unmappedBehavior: "deny",
    deletionChannelEnabled: false,
    mappingRules: [],
    hasClientSecret: false,
    hasDeletionSecret: false,
});

export default function ProvidersPage() {
    const { t } = useTranslation();
    const call = useApiCall();

    const [providers, setProviders] = useState<IdentityProvider[] | undefined>(undefined);
    const [templates, setTemplates] = useState<PermissionTemplate[]>([]);
    const [queue, setQueue] = useState<DeletionRequest[]>([]);
    const [draft, setDraft] = useState<Draft | undefined>(undefined);
    const [error, setError] = useState<string | undefined>(undefined);
    const [busy, setBusy] = useState(false);
    const [reload, setReload] = useState(0);

    const loadError = useApiEffect(async (api) => {
        setProviders(await api.managerApi.getIdentityProviders());
        setTemplates(await api.managerApi.getPermissionTemplates());
        setQueue((await api.managerApi.getDeletionRequests({ state: "open", pageSize: 50 })).items);
    }, [reload]);

    const run = async (operation: () => Promise<unknown>) => {
        setBusy(true);
        setError(undefined);
        try {
            await operation();
            setReload(n => n + 1);
            return true;
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
            return false;
        } finally {
            setBusy(false);
        }
    };

    const save = async () => {
        if (!draft) return;
        const input: IdentityProviderInput = {
            slug: draft.slug.trim(),
            displayName: draft.displayName.trim(),
            issuer: draft.issuer.trim(),
            clientId: draft.clientId.trim(),
            // Sent only when somebody typed one. Absent means "leave the stored
            // one alone", which is the only thing it can mean: the screen was
            // never given the value it would otherwise be sending back.
            clientSecret: draft.clientSecret?.trim() || undefined,
            deletionSecret: draft.deletionSecret?.trim() || undefined,
            scopes: draft.scopes?.trim() || undefined,
            enabled: draft.enabled,
            accountUrl: draft.accountUrl?.trim() || undefined,
            claimPath: draft.claimPath?.trim() || undefined,
            unmappedBehavior: draft.unmappedBehavior,
            defaultTemplateName: draft.defaultTemplateName,
            deletionChannelEnabled: draft.deletionChannelEnabled,
            mappingRules: draft.mappingRules,
        };

        const saved = await run(() => call(api => draft.id
            ? api.managerApi.updateIdentityProvider(draft.id, input)
            : api.managerApi.createIdentityProvider(input)));

        if (saved) setDraft(undefined);
    };

    const setRule = (index: number, rule: Partial<MappingRule>) => {
        if (!draft) return;
        const rules = [...(draft.mappingRules ?? [])];
        rules[index] = { ...rules[index], ...rule };
        setDraft({ ...draft, mappingRules: rules });
    };

    return (
        <Stack gap="md">
            <Group justify="space-between" align="flex-start">
                <Stack gap={2}>
                    <Title order={2}>{t("External logins")}</Title>
                    <Text size="sm" c="dimmed">
                        {t("Which identity providers this installation trusts, and what a token from one is worth here.")}
                    </Text>
                </Stack>
                <Button leftSection={<IconPlus size={16} />} onClick={() => setDraft(blank())}>
                    {t("Register a provider")}
                </Button>
            </Group>

            <Alert color="orange" icon={<IconShieldLock size={18} />}>
                {t("A mapping decides what an external directory's groups are worth here. Two rules are enforced and cannot be turned off: system:administrator can never be granted by a claim, and nobody may map onto a permission they do not themselves hold.")}
            </Alert>

            {error && <Alert color="red" withCloseButton onClose={() => setError(undefined)}>{error}</Alert>}

            <LoadState error={loadError} loading={providers === undefined}>
                <Stack gap="sm">
                    {providers?.length === 0 && (
                        <Card withBorder padding="lg">
                            <Text c="dimmed">
                                {t("No providers are registered. Everybody signs in with a password held here.")}
                            </Text>
                        </Card>
                    )}

                    {providers?.map(provider => (
                        <Card key={provider.id} withBorder padding="md">
                            <Group justify="space-between" align="flex-start" wrap="nowrap">
                                <Stack gap={4}>
                                    <Group gap="xs">
                                        <Text fw={600}>{provider.displayName}</Text>
                                        <Text size="sm" c="dimmed" ff="monospace">{provider.slug}</Text>
                                        {!provider.enabled && (
                                            <Badge color="gray" variant="light">{t("Disabled")}</Badge>
                                        )}
                                        {provider.deletionChannelEnabled && (
                                            <Badge color="grape" variant="light">{t("Reports deletions")}</Badge>
                                        )}
                                    </Group>
                                    <Text size="sm" c="dimmed" ff="monospace">{provider.issuer}</Text>
                                    <Group gap="xs">
                                        <Text size="sm" c="dimmed">
                                            {t("Claim")}: <Text span ff="monospace">{provider.claimPath}</Text>
                                        </Text>
                                        <Text size="sm" c="dimmed">
                                            {t("{{count}} account(s) sign in through it", { count: provider.linkedAccounts })}
                                        </Text>
                                    </Group>
                                    <Group gap={6} mt={4}>
                                        {provider.mappingRules.length === 0
                                            ? (
                                                <Text size="sm" c="dimmed">
                                                    {provider.unmappedBehavior === "deny"
                                                        ? t("Nothing is mapped, and unmatched tokens are refused: nobody can sign in through it.")
                                                        : t("Nothing is mapped; everybody it vouches for gets the default set.")}
                                                </Text>
                                            )
                                            : provider.mappingRules.map(rule => (
                                                <Badge key={rule.claimValue} variant="light">
                                                    {rule.claimValue} → {rule.templateName}
                                                </Badge>
                                            ))}
                                    </Group>
                                </Stack>

                                <Group gap="xs" wrap="nowrap">
                                    <Button variant="light" size="xs" onClick={() => setDraft(draftFrom(provider))}>
                                        {t("Edit")}
                                    </Button>
                                    <Tooltip
                                        label={provider.linkedAccounts > 0
                                            ? t("Accounts sign in through it. Disable it instead.")
                                            : t("Remove")}
                                    >
                                        <ActionIcon
                                            variant="subtle"
                                            color="red"
                                            disabled={provider.linkedAccounts > 0}
                                            onClick={() => void run(() =>
                                                call(api => api.managerApi.deleteIdentityProvider(provider.id)))}
                                        >
                                            <IconTrash size={16} />
                                        </ActionIcon>
                                    </Tooltip>
                                </Group>
                            </Group>

                            <Group gap="xs" mt="sm" align="center">
                                <Text size="xs" c="dimmed">{t("Redirect URI to register at the provider")}:</Text>
                                <Text size="xs" ff="monospace">{provider.callbackPath}</Text>
                                <CopyButton value={provider.callbackPath} size="compact-xs" variant="subtle">
                                    {() => (
                                        <Group gap={4} wrap="nowrap">
                                            <IconCopy size={13} />
                                            {t("Copy")}
                                        </Group>
                                    )}
                                </CopyButton>
                            </Group>
                        </Card>
                    ))}
                </Stack>
            </LoadState>

            <DeletionQueue
                requests={queue}
                busy={busy}
                onHalt={id => void run(() => call(api => api.managerApi.haltDeletionRequest(id)))}
            />

            <Modal
                opened={draft !== undefined}
                onClose={() => setDraft(undefined)}
                title={draft?.id ? t("Edit the provider") : t("Register a provider")}
                size="lg"
            >
                {draft && (
                    <Stack gap="sm">
                        <Group grow>
                            <TextInput
                                label={t("Name")}
                                description={t("What the sign-in button says.")}
                                value={draft.displayName}
                                onChange={e => setDraft({ ...draft, displayName: e.currentTarget.value })}
                            />
                            <TextInput
                                label={t("Slug")}
                                description={t("Appears in the sign-in address. Changing it breaks the redirect URI.")}
                                value={draft.slug}
                                onChange={e => setDraft({ ...draft, slug: e.currentTarget.value })}
                            />
                        </Group>

                        <TextInput
                            label={t("Issuer")}
                            description={t("Discovery finds the endpoints and the keys from here. HTTPS, except on loopback.")}
                            value={draft.issuer}
                            onChange={e => setDraft({ ...draft, issuer: e.currentTarget.value })}
                        />

                        <Group grow>
                            <TextInput
                                label={t("Client id")}
                                value={draft.clientId}
                                onChange={e => setDraft({ ...draft, clientId: e.currentTarget.value })}
                            />
                            <TextInput
                                label={t("Client secret")}
                                description={draft.hasClientSecret
                                    ? t("One is stored and cannot be read back. Leave this empty to keep it.")
                                    : t("Required. It is stored and never shown again.")}
                                placeholder={draft.hasClientSecret ? "••••••••" : ""}
                                value={draft.clientSecret ?? ""}
                                onChange={e => setDraft({ ...draft, clientSecret: e.currentTarget.value })}
                            />
                        </Group>

                        <Group grow>
                            <TextInput
                                label={t("Claim path")}
                                description={t("Dotted names, for example groups or realm_access.roles. Not an expression.")}
                                value={draft.claimPath ?? ""}
                                onChange={e => setDraft({ ...draft, claimPath: e.currentTarget.value })}
                            />
                            <Select
                                label={t("When nothing matches")}
                                description={t("Applies to a first sign-in and to somebody who left the group.")}
                                data={[
                                    { value: "deny", label: t("Refuse the sign-in") },
                                    { value: "defaultTemplate", label: t("Grant a default set") },
                                ]}
                                value={draft.unmappedBehavior ?? "deny"}
                                onChange={value => setDraft({
                                    ...draft,
                                    unmappedBehavior: value === "defaultTemplate" ? "defaultTemplate" : "deny",
                                })}
                            />
                        </Group>

                        {draft.unmappedBehavior === "defaultTemplate" && (
                            <Select
                                label={t("Default set")}
                                data={templates.map(template => ({ value: template.name, label: template.name }))}
                                value={draft.defaultTemplateName ?? null}
                                onChange={value => setDraft({ ...draft, defaultTemplateName: value ?? undefined })}
                            />
                        )}

                        <Stack gap={4}>
                            <Text fw={500} size="sm">{t("Mapping")}</Text>
                            <Text size="xs" c="dimmed">
                                {t("A value at the claim path above, and the permission set it grants. Rewritten at every sign-in: editing the template reaches these people the next time they sign in.")}
                            </Text>
                            {(draft.mappingRules ?? []).map((rule, index) => (
                                <Group key={index} gap="xs" wrap="nowrap">
                                    <TextInput
                                        placeholder={t("Claim value")}
                                        value={rule.claimValue}
                                        onChange={e => setRule(index, { claimValue: e.currentTarget.value })}
                                        style={{ flex: 1 }}
                                    />
                                    <Select
                                        placeholder={t("Permission set")}
                                        data={templates.map(template => ({
                                            value: template.name,
                                            label: template.name,
                                        }))}
                                        value={rule.templateName || null}
                                        onChange={value => setRule(index, { templateName: value ?? "" })}
                                        style={{ flex: 1 }}
                                    />
                                    <ActionIcon
                                        variant="subtle"
                                        color="red"
                                        onClick={() => setDraft({
                                            ...draft,
                                            mappingRules: (draft.mappingRules ?? []).filter((_, i) => i !== index),
                                        })}
                                    >
                                        <IconTrash size={16} />
                                    </ActionIcon>
                                </Group>
                            ))}
                            <Button
                                variant="light"
                                size="xs"
                                leftSection={<IconPlus size={14} />}
                                onClick={() => setDraft({
                                    ...draft,
                                    mappingRules: [...(draft.mappingRules ?? []), { claimValue: "", templateName: "" }],
                                })}
                            >
                                {t("Add a rule")}
                            </Button>
                        </Stack>

                        <Switch
                            label={t("Offer it on the sign-in screen")}
                            checked={draft.enabled}
                            onChange={e => setDraft({ ...draft, enabled: e.currentTarget.checked })}
                        />

                        <Switch
                            label={t("Let it report deleted accounts")}
                            description={t("A back channel this provider posts to when it removes somebody. An administrator has a day to stop each one.")}
                            checked={draft.deletionChannelEnabled}
                            onChange={e => setDraft({ ...draft, deletionChannelEnabled: e.currentTarget.checked })}
                        />

                        {draft.deletionChannelEnabled && (
                            <TextInput
                                label={t("Back-channel secret")}
                                description={draft.hasDeletionSecret
                                    ? t("One is stored and cannot be read back. Leave this empty to keep it.")
                                    : t("Required before the channel can be opened.")}
                                placeholder={draft.hasDeletionSecret ? "••••••••" : ""}
                                value={draft.deletionSecret ?? ""}
                                onChange={e => setDraft({ ...draft, deletionSecret: e.currentTarget.value })}
                            />
                        )}

                        <TextInput
                            label={t("Where people manage their details")}
                            description={t("An account owned by a provider cannot be edited here, so the screen sends them there.")}
                            value={draft.accountUrl ?? ""}
                            onChange={e => setDraft({ ...draft, accountUrl: e.currentTarget.value })}
                        />

                        <Group justify="flex-end">
                            <Button variant="subtle" onClick={() => setDraft(undefined)}>{t("Cancel")}</Button>
                            <Button loading={busy} onClick={() => void save()}>{t("Save")}</Button>
                        </Group>
                    </Stack>
                )}
            </Modal>
        </Stack>
    );
}

/**
 * The accounts a provider has asked to remove, and the ones that stopped short.
 *
 * `pending` is inside its twenty-four hours and can be stopped. `attention` is
 * the one somebody has to read: the link was removed and the account was **not**
 * emptied, because it holds system-scope permissions — a webhook that could
 * silence an administrator is an attack vector, not a feature.
 */
function DeletionQueue({ requests, busy, onHalt }: {
    requests: DeletionRequest[];
    busy: boolean;
    onHalt: (id: string) => void;
}) {
    const { t } = useTranslation();

    if (requests.length === 0) {
        return (
            <Card withBorder padding="md">
                <Group gap="xs">
                    <IconInfoCircle size={16} />
                    <Text size="sm" c="dimmed">{t("No account removals are waiting.")}</Text>
                </Group>
            </Card>
        );
    }

    return (
        <Card withBorder padding="md">
            <Stack gap="xs">
                <Title order={4}>{t("Account removals")}</Title>
                <Table>
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th>{t("Account")}</Table.Th>
                            <Table.Th>{t("Asked by")}</Table.Th>
                            <Table.Th>{t("State")}</Table.Th>
                            <Table.Th />
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {requests.map(request => (
                            <Table.Tr key={request.id}>
                                <Table.Td>
                                    <Text ff="monospace" size="sm">{request.userLogin ?? "—"}</Text>
                                </Table.Td>
                                <Table.Td>
                                    <Text size="sm">
                                        {request.channel === "provider"
                                            ? request.providerName ?? t("A provider")
                                            : t("The person themselves")}
                                    </Text>
                                </Table.Td>
                                <Table.Td>
                                    {request.state === "attention"
                                        ? (
                                            <Group gap={6}>
                                                <IconAlertTriangle size={14} color="var(--mantine-color-orange-6)" />
                                                <Text size="sm">{t("Holds system permissions — your decision")}</Text>
                                            </Group>
                                        )
                                        : <Text size="sm">{t("Waiting")}</Text>}
                                    {request.detail && (
                                        <Text size="xs" c="dimmed">{request.detail}</Text>
                                    )}
                                </Table.Td>
                                <Table.Td>
                                    {request.state === "pending" && (
                                        <Button
                                            size="xs"
                                            variant="light"
                                            loading={busy}
                                            onClick={() => onHalt(request.id)}
                                        >
                                            {t("Stop it")}
                                        </Button>
                                    )}
                                </Table.Td>
                            </Table.Tr>
                        ))}
                    </Table.Tbody>
                </Table>
            </Stack>
        </Card>
    );
}
