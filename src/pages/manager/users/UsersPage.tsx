import {
    Alert, Badge, Button, Card, Code, Group, Modal, NumberInput, Pagination, Select, Stack, Switch,
    Table, Tabs, TagsInput, Text, Textarea, TextInput, Title, Tooltip,
} from "@mantine/core";
import { IconDownload, IconKey, IconLock, IconLockOpen, IconPlus, IconSearch, IconUsersPlus } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
    CreatedCredential, Grant, ManagedActivitySummary, ManagedUser, PermissionTemplate,
} from "../../../api/ManagerApi";
import LoadState from "../../../components/LoadState";
import ActivityTime from "../../../components/time/ActivityTime";
import ZonedDateTimeInput from "../../../components/time/ZonedDateTimeInput";
import { useApiCall, useApiEffect } from "../../../provider/ApiProvider";

const PAGE_SIZE = 20;

/**
 * Blocked, expired, pending and active are four different things.
 *
 * Blocked is a decision somebody made, expired happened by itself, and pending
 * is an account that arrived and has not been let in — the state an installation
 * that approves by hand rather than by email spends most of its time in.
 */
const stateOf = (user: ManagedUser): "blocked" | "expired" | "pending" | "active" => {
    if (user.blockedAt) return "blocked";
    if (user.expiresAt && Date.parse(user.expiresAt) < Date.now()) return "expired";
    if (!user.approvedAt) return "pending";
    return "active";
};

const STATE_COLOUR = { blocked: "red", expired: "gray", pending: "orange", active: "teal" } as const;

/** What to call somebody: their name if they gave one, otherwise their login. */
const displayName = (user: ManagedUser): string =>
    [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username;

/** The handout a manager prints or pastes into a spreadsheet. */
const credentialsCsv = (credentials: CreatedCredential[]) =>
    ["username,password", ...credentials.map(c => `${c.username},${c.password}`)].join("\n");

export default function UsersPage() {
    const { t } = useTranslation();
    const call = useApiCall();

    const [items, setItems] = useState<ManagedUser[] | undefined>(undefined);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState("");
    const [includeBlocked, setIncludeBlocked] = useState(false);
    const [temporaryOnly, setTemporaryOnly] = useState(false);

    const [activities, setActivities] = useState<ManagedActivitySummary[]>([]);
    const [templates, setTemplates] = useState<PermissionTemplate[]>([]);

    const [selected, setSelected] = useState<ManagedUser | undefined>(undefined);
    const [grants, setGrants] = useState<Grant[]>([]);
    const [edited, setEdited] = useState({ firstName: "", lastName: "", email: "", note: "" });
    const [tags, setTags] = useState<string[]>([]);

    const [creating, setCreating] = useState(false);
    const [draft, setDraft] = useState({ username: "", firstName: "", lastName: "", email: "" });
    const [bulk, setBulk] = useState<{
        open: boolean; prefix: string; count: number; expiresAt?: string; activityId: string; template: string;
    }>({ open: false, prefix: "", count: 20, activityId: "", template: "" });
    const [credentials, setCredentials] = useState<CreatedCredential[] | undefined>(undefined);

    const [error, setError] = useState<string | undefined>(undefined);
    const [busy, setBusy] = useState(false);
    const [reload, setReload] = useState(0);

    const loadError = useApiEffect(async (api) => {
        setActivities(await api.managerApi.getManagedActivities());
        setTemplates(await api.managerApi.getPermissionTemplates());

        setItems(undefined);
        const result = await api.managerApi.getUsers({
            page, pageSize: PAGE_SIZE,
            search: search || undefined,
            includeBlocked: includeBlocked || undefined,
            temporaryOnly: temporaryOnly || undefined,
        });
        setItems(result.items);
        setTotal(result.total);

        api.managerApi.eventDispatcher.addEventListener("userChanged", evt => {
            setItems(current => current?.map(u => u.id === evt.data.user.id ? evt.data.user : u));
        });
    }, [page, search, includeBlocked, temporaryOnly, reload]);

    const run = async (operation: () => Promise<unknown>) => {
        setError(undefined);
        setBusy(true);
        try {
            await operation();
            setReload(n => n + 1);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    };

    // Grants are loaded when an account is opened rather than for every row: a
    // page of twenty would otherwise be twenty-one requests to show a number.
    const open = async (user: ManagedUser) => {
        setSelected(user);
        setTags(user.tags);
        setEdited({
            firstName: user.firstName ?? "",
            lastName: user.lastName ?? "",
            email: user.email ?? "",
            note: user.note ?? "",
        });
        setGrants((await call(api => api.managerApi.getGrants({ userId: user.id, pageSize: 50 }))).items);
    };

    const download = (created: CreatedCredential[]) => {
        const blob = new Blob([credentialsCsv(created)], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = "accounts.csv";
        anchor.click();
        URL.revokeObjectURL(url);
    };

    if (!items) return <LoadState error={loadError} loading={!loadError} />;

    return (
        <Stack gap="md">
            <Group justify="space-between" wrap="wrap">
                <Stack gap={2}>
                    <Title>{t("Users")}</Title>
                    <Text size="sm" c="dimmed">
                        {t("Blocking stops somebody signing in. What they may do inside an activity is a grant.")}
                    </Text>
                </Stack>
                <Group gap="xs">
                    <Button
                        variant="light"
                        leftSection={<IconUsersPlus size={16} />}
                        onClick={() => setBulk({ ...bulk, open: true })}
                    >
                        {t("Temporary accounts")}
                    </Button>
                    <Button leftSection={<IconPlus size={16} />} onClick={() => setCreating(true)}>
                        {t("New account")}
                    </Button>
                </Group>
            </Group>

            {error && <Alert color="red" withCloseButton onClose={() => setError(undefined)}>{error}</Alert>}

            <Group gap="md" wrap="wrap">
                <TextInput
                    placeholder={t("Search by name, username, email or tag")}
                    leftSection={<IconSearch size={16} />}
                    value={search}
                    onChange={e => { setSearch(e.currentTarget.value); setPage(1); }}
                    w={320}
                />
                <Switch
                    label={t("Include blocked")}
                    checked={includeBlocked}
                    onChange={e => { setIncludeBlocked(e.currentTarget.checked); setPage(1); }}
                />
                <Switch
                    label={t("Temporary only")}
                    checked={temporaryOnly}
                    onChange={e => { setTemporaryOnly(e.currentTarget.checked); setPage(1); }}
                />
            </Group>

            <Table.ScrollContainer minWidth={900}>
                <Table striped highlightOnHover>
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th>{t("User")}</Table.Th>
                            <Table.Th>{t("Email")}</Table.Th>
                            <Table.Th>{t("Tags")}</Table.Th>
                            <Table.Th>{t("State")}</Table.Th>
                            <Table.Th>{t("Grants")}</Table.Th>
                            <Table.Th>{t("Last seen")}</Table.Th>
                            <Table.Th />
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {items.map(user => (
                            <Table.Tr key={user.id} opacity={stateOf(user) === "active" ? 1 : 0.6}>
                                <Table.Td>
                                    <Stack gap={0}>
                                        <Group gap="xs">
                                            <Text fw={500}>{displayName(user)}</Text>
                                            {user.isTemporary && (
                                                <Badge size="sm" variant="outline" color="gray">{t("temporary")}</Badge>
                                            )}
                                        </Group>
                                        <Text size="xs" c="dimmed" ff="monospace">{user.username}</Text>
                                    </Stack>
                                </Table.Td>
                                <Table.Td>
                                    <Group gap={4} wrap="nowrap">
                                        <Text size="sm">{user.email ?? "—"}</Text>
                                        {/* An unconfirmed address is one nobody
                                            has proved reaches this person. */}
                                        {user.email && !user.emailConfirmed && (
                                            <Tooltip label={t("Address not confirmed")}>
                                                <Badge size="xs" variant="light" color="orange">?</Badge>
                                            </Tooltip>
                                        )}
                                    </Group>
                                </Table.Td>
                                <Table.Td>
                                    <Group gap={4}>
                                        {user.tags.map(tag => (
                                            <Badge key={tag} size="sm" variant="light">{tag}</Badge>
                                        ))}
                                    </Group>
                                </Table.Td>
                                <Table.Td>
                                    <Tooltip label={user.blockedReason ?? ""} disabled={!user.blockedReason}>
                                        <Badge variant="light" color={STATE_COLOUR[stateOf(user)]}>
                                            {t(`userState.${stateOf(user)}`)}
                                        </Badge>
                                    </Tooltip>
                                </Table.Td>
                                <Table.Td><Text size="sm">{user.grantCount}</Text></Table.Td>
                                <Table.Td>
                                    {user.lastSeenAt
                                        ? <ActivityTime value={user.lastSeenAt} timeZone="Europe/Warsaw" format="date" hideZone />
                                        : <Text size="sm" c="dimmed">{t("never")}</Text>}
                                </Table.Td>
                                <Table.Td>
                                    <Group gap="xs" justify="flex-end" wrap="nowrap">
                                        {stateOf(user) === "pending" && (
                                            <Button
                                                variant="light"
                                                size="compact-sm"
                                                loading={busy}
                                                onClick={() => run(() => call(api => api.managerApi.approveUser(user.id)))}
                                            >
                                                {t("Approve")}
                                            </Button>
                                        )}
                                        <Button variant="light" size="compact-sm" onClick={() => open(user)}>
                                            {t("Open")}
                                        </Button>
                                        <Tooltip label={user.blockedAt ? t("Unblock") : t("Block")}>
                                            <Button
                                                variant="subtle"
                                                size="compact-sm"
                                                color={user.blockedAt ? "teal" : "red"}
                                                loading={busy}
                                                onClick={() => run(() => call(api =>
                                                    api.managerApi.setUserBlocked(user.id, !user.blockedAt, undefined)))}
                                            >
                                                {user.blockedAt ? <IconLockOpen size={14} /> : <IconLock size={14} />}
                                            </Button>
                                        </Tooltip>
                                    </Group>
                                </Table.Td>
                            </Table.Tr>
                        ))}
                    </Table.Tbody>
                </Table>
            </Table.ScrollContainer>

            {items.length === 0 && <Text c="dimmed">{t("Nothing matches the filters")}</Text>}

            <Group justify="center">
                <Pagination total={Math.ceil(total / PAGE_SIZE)} value={page} onChange={setPage} />
            </Group>

            <Modal
                opened={selected !== undefined}
                onClose={() => setSelected(undefined)}
                title={<Title order={4}>{selected && displayName(selected)}</Title>}
                size="lg"
                centered
            >
                {selected && (
                    <Tabs defaultValue="general">
                        <Tabs.List>
                            <Tabs.Tab value="general">{t("General")}</Tabs.Tab>
                            {/* PAM-style login on competitor workstations, and a
                                session list, are later directions. Both stay
                                visible and dead rather than opening an empty
                                screen. */}
                            <Tabs.Tab value="unix" disabled>
                                Unix <Text component="span" size="xs" fs="italic" c="dimmed">{t("soon")}</Text>
                            </Tabs.Tab>
                            <Tabs.Tab value="sessions" disabled>
                                {t("Sessions")} <Text component="span" size="xs" fs="italic" c="dimmed">{t("soon")}</Text>
                            </Tabs.Tab>
                        </Tabs.List>

                        <Tabs.Panel value="general" pt="md">
                            <Stack gap="sm">
                                <Group gap="xs">
                                    <Text size="sm" ff="monospace">{selected.username}</Text>
                                    <Badge variant="light" color={STATE_COLOUR[stateOf(selected)]}>
                                        {t(`userState.${stateOf(selected)}`)}
                                    </Badge>
                                    {selected.isTemporary && (
                                        <Badge variant="outline" color="gray" size="sm">{t("temporary")}</Badge>
                                    )}
                                </Group>
                                {selected.note && (
                                    <Alert color="gray" p="xs">
                                        <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>{selected.note}</Text>
                                    </Alert>
                                )}
                                {selected.expiresAt && (
                                    <Text size="sm" c="dimmed">
                                        {t("Expires")}: <ActivityTime value={selected.expiresAt} timeZone="Europe/Warsaw" />
                                    </Text>
                                )}

                                <Group grow>
                                    <TextInput
                                        label={t("First name")}
                                        description={t("Optional")}
                                        value={edited.firstName}
                                        onChange={e => setEdited({ ...edited, firstName: e.currentTarget.value })}
                                    />
                                    <TextInput
                                        label={t("Last name")}
                                        description={t("Optional")}
                                        value={edited.lastName}
                                        onChange={e => setEdited({ ...edited, lastName: e.currentTarget.value })}
                                    />
                                </Group>
                                <TextInput
                                    label={t("Email")}
                                    description={t("Changing it makes the address unconfirmed again")}
                                    value={edited.email}
                                    onChange={e => setEdited({ ...edited, email: e.currentTarget.value })}
                                />
                                <Textarea
                                    label={t("Note")}
                                    description={t("A sentence for other staff. The person does not see it.")}
                                    autosize
                                    minRows={2}
                                    value={edited.note}
                                    onChange={e => setEdited({ ...edited, note: e.currentTarget.value })}
                                />
                                <TagsInput
                                    label={t("Tags")}
                                    description={t("Display labels only. The Server stores them and never queries them.")}
                                    value={tags}
                                    onChange={setTags}
                                />
                                <Group justify="flex-end">
                                    <Button
                                        size="compact-sm"
                                        variant="light"
                                        loading={busy}
                                        onClick={() => run(() => call(api => api.managerApi.updateUser(selected.id, {
                                            ...edited,
                                            tags,
                                        })))}
                                    >
                                        {t("Save")}
                                    </Button>
                                </Group>

                                <Card withBorder radius="sm">
                                    <Title order={6} mb="xs">{t("Grants")}</Title>
                                    {grants.length === 0
                                        ? <Text size="sm" c="dimmed">{t("No grants — this account is in nothing")}</Text>
                                        : (
                                            <Stack gap={4}>
                                                {grants.map(grant => (
                                                    <Group key={grant.id} justify="space-between">
                                                        <Text size="sm">
                                                            {grant.activityName ?? t("System")}
                                                            {grant.createdFromTemplate && (
                                                                <Text component="span" size="xs" c="dimmed"> · {grant.createdFromTemplate}</Text>
                                                            )}
                                                        </Text>
                                                        <Badge variant="light" size="sm">{grant.permissions.length}</Badge>
                                                    </Group>
                                                ))}
                                            </Stack>
                                        )}
                                </Card>

                                <Group justify="space-between">
                                    <Button
                                        variant="light"
                                        leftSection={<IconKey size={16} />}
                                        loading={busy}
                                        onClick={() => run(async () => {
                                            const created = await call(api => api.managerApi.resetUserPassword(selected.id));
                                            setCredentials([created]);
                                        })}
                                    >
                                        {t("Reset the password")}
                                    </Button>
                                    <Button variant="default" onClick={() => setSelected(undefined)}>{t("Back")}</Button>
                                </Group>
                            </Stack>
                        </Tabs.Panel>
                    </Tabs>
                )}
            </Modal>

            <Modal opened={creating} onClose={() => setCreating(false)} title={<Title order={4}>{t("New account")}</Title>} centered>
                <Stack gap="sm">
                    <TextInput
                        label={t("Username")}
                        description={t("The only required field: it is what they sign in as")}
                        value={draft.username}
                        onChange={e => setDraft({ ...draft, username: e.currentTarget.value })}
                        required
                    />
                    <Group grow>
                        <TextInput
                            label={t("First name")}
                            description={t("Optional")}
                            value={draft.firstName}
                            onChange={e => setDraft({ ...draft, firstName: e.currentTarget.value })}
                        />
                        <TextInput
                            label={t("Last name")}
                            description={t("Optional")}
                            value={draft.lastName}
                            onChange={e => setDraft({ ...draft, lastName: e.currentTarget.value })}
                        />
                    </Group>
                    <TextInput
                        label={t("Email")}
                        value={draft.email}
                        onChange={e => setDraft({ ...draft, email: e.currentTarget.value })}
                    />
                    <Alert color="blue">
                        {t("A local account keeps its password here. Everyone else signs in through the identity provider.")}
                    </Alert>
                    <Group justify="space-between">
                        <Button variant="default" onClick={() => setCreating(false)}>{t("Back")}</Button>
                        <Button
                            loading={busy}
                            disabled={!draft.username.trim()}
                            onClick={() => run(async () => {
                                const created = await call(api => api.managerApi.createUser({
                                    username: draft.username.trim(),
                                    firstName: draft.firstName.trim() || undefined,
                                    lastName: draft.lastName.trim() || undefined,
                                    email: draft.email.trim() || undefined,
                                }));
                                setCreating(false);
                                setDraft({ username: "", firstName: "", lastName: "", email: "" });
                                setCredentials([created]);
                            })}
                        >
                            {t("Save")}
                        </Button>
                    </Group>
                </Stack>
            </Modal>

            <Modal
                opened={bulk.open}
                onClose={() => setBulk({ ...bulk, open: false })}
                title={<Title order={4}>{t("Temporary accounts")}</Title>}
                centered
            >
                <Stack gap="sm">
                    <Group grow>
                        <TextInput
                            label={t("Prefix")}
                            description={t("contest gives contest-001, contest-002, …")}
                            value={bulk.prefix}
                            onChange={e => setBulk({ ...bulk, prefix: e.currentTarget.value })}
                            required
                        />
                        <NumberInput
                            label={t("How many")}
                            min={1}
                            max={500}
                            value={bulk.count}
                            onChange={v => setBulk({ ...bulk, count: typeof v === "number" ? v : 1 })}
                        />
                    </Group>
                    <ZonedDateTimeInput
                        label={t("Expires")}
                        description={t("After this they stop signing in. Empty means never.")}
                        value={bulk.expiresAt}
                        timeZone="Europe/Warsaw"
                        onChange={expiresAt => setBulk({ ...bulk, expiresAt })}
                    />
                    <Select
                        label={t("Enrol into")}
                        description={t("Accounts with nowhere to submit are of no use")}
                        data={activities.map(a => ({ value: a.id, label: a.name }))}
                        value={bulk.activityId || null}
                        onChange={v => setBulk({ ...bulk, activityId: v ?? "" })}
                        clearable
                        searchable
                    />
                    <Select
                        label={t("With the permissions of")}
                        data={templates.map(template => ({ value: template.name, label: template.name }))}
                        value={bulk.template || null}
                        onChange={v => setBulk({ ...bulk, template: v ?? "" })}
                        disabled={!bulk.activityId}
                        clearable
                    />
                    <Group justify="space-between">
                        <Button variant="default" onClick={() => setBulk({ ...bulk, open: false })}>{t("Back")}</Button>
                        <Button
                            loading={busy}
                            disabled={!bulk.prefix.trim()}
                            onClick={() => run(async () => {
                                const template = templates.find(x => x.name === bulk.template);
                                const created = await call(api => api.managerApi.createTemporaryUsers({
                                    prefix: bulk.prefix.trim(),
                                    count: bulk.count,
                                    expiresAt: bulk.expiresAt,
                                    activityId: bulk.activityId || undefined,
                                    permissions: template?.permissions,
                                }));
                                setBulk({ ...bulk, open: false, prefix: "" });
                                setCredentials(created);
                            })}
                        >
                            {t("Create")}
                        </Button>
                    </Group>
                </Stack>
            </Modal>

            {/* Shown once. There is nowhere to read these back from, which is the
                point — the Server keeps a hash. */}
            <Modal
                opened={credentials !== undefined}
                onClose={() => setCredentials(undefined)}
                title={<Title order={4}>{t("Credentials")}</Title>}
                size="lg"
                centered
            >
                {credentials && (
                    <Stack gap="sm">
                        <Alert color="orange">
                            {t("This is the only time these passwords can be read. Save or print them now.")}
                        </Alert>
                        <Code block style={{ maxHeight: 320, overflow: "auto" }}>
                            {credentialsCsv(credentials)}
                        </Code>
                        <Group justify="space-between">
                            <Button
                                variant="light"
                                leftSection={<IconDownload size={16} />}
                                onClick={() => download(credentials)}
                            >
                                {t("Download CSV")}
                            </Button>
                            <Group gap="xs">
                                <Button variant="default" onClick={() => window.print()}>{t("Print")}</Button>
                                <Button onClick={() => setCredentials(undefined)}>{t("Done")}</Button>
                            </Group>
                        </Group>
                    </Stack>
                )}
            </Modal>
        </Stack>
    );
}
