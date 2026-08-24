import { Alert, Badge, Button, Card, Center, Group, Loader, Modal, Pagination, Stack, Switch, Table, Tabs, TagsInput, Text, Textarea, TextInput, Title, Tooltip } from "@mantine/core";
import { IconArrowMerge, IconKey, IconLock, IconLockOpen, IconPlus, IconSearch, IconUsersPlus } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
    CreatedCredential, Grant, ManagedActivitySummary, ManagedUser, PermissionTemplate, UserSession,
} from "../../../api/ManagerApi";
import { displayName } from "../../../api/displayName";
import LoadState from "../../../components/LoadState";
import ActivityTime from "../../../components/time/ActivityTime";
import CredentialsModal from "../../../components/users/CredentialsModal";
import TemporaryAccountsModal from "../../../components/users/TemporaryAccountsModal";
import MergeAccountModal from "../../../components/users/MergeAccountModal";
import { useApiCall, useApiEffect } from "../../../provider/apiContext";
import { useInstance } from "../../../provider/instanceContext";

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

export default function UsersPage() {
    const { t } = useTranslation();
    const call = useApiCall();
    const { instance } = useInstance();

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
    const [sessions, setSessions] = useState<UserSession[] | undefined>(undefined);
    /** When the session list was read. It is a snapshot, so it carries its time. */
    const [takenAt, setTakenAt] = useState<string | undefined>(undefined);
    const [sessionsError, setSessionsError] = useState<string | undefined>(undefined);
    const [edited, setEdited] = useState({ firstName: "", lastName: "", email: "", note: "" });
    const [tags, setTags] = useState<string[]>([]);

    /** The account whose work is being moved. Undefined closes the dialog. */
    const [merging, setMerging] = useState<ManagedUser | undefined>(undefined);
    const [creating, setCreating] = useState(false);
    const [draft, setDraft] = useState({ username: "", firstName: "", lastName: "", email: "" });
    const [bulk, setBulk] = useState({ open: false });
    /** Handed over once, by creating an account or resetting a password. */
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
        // Somebody else's sessions, from the account opened before this one.
        setSessions(undefined);
        setTakenAt(undefined);
        setGrants((await call(api => api.managerApi.getGrants({ userId: user.id, pageSize: 50 }))).items);
    };

    /**
     * Asked for when the tab is opened, and again on demand.
     *
     * Not loaded with the account: how many sockets are open is true for as long
     * as it takes to read it, so fetching it early only means showing something
     * staler. The answer is stamped with the moment it arrived, and the screen
     * says so rather than implying it keeps itself up to date.
     */
    const loadSessions = async (user: ManagedUser) => {
        setSessions(undefined);
        setSessionsError(undefined);
        try {
            setSessions(await call(api => api.managerApi.getUserSessions(user.id)));
            setTakenAt(new Date().toISOString());
        } catch (e) {
            // Reported here rather than through `LoadState`, whose remedy is to
            // reload the page: that would close the account somebody has open
            // over one failed read of one tab. The Refresh button above is the
            // proportionate answer.
            setSessionsError(e instanceof Error ? e.message : String(e));
        }
    };


    // Accounts made here are not tied to one activity, so the slip points at the
    // installation's front page and names the installation.
    const handout = {
        url: window.location.origin + "/",
        title: instance.name ?? "AlgoJudge",
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
                        onClick={() => setBulk({ open: true })}
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
                                            {/* The name opens the account, as the
                                                name does on the problem, activity
                                                and Runner lists. The button stays:
                                                it is what says the row can be
                                                opened at all. */}
                                            <Text
                                                fw={500}
                                                style={{ cursor: "pointer" }}
                                                onClick={() => void open(user)}
                                            >
                                                {displayName(user)}
                                            </Text>
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
                                        {/* Offered on a blocked account too: an
                                            account merged away is blocked, and
                                            the manager may be here to merge a
                                            second one onto the same target. */}
                                        <Tooltip label={t("Move this account's work to another")}>
                                            <Button
                                                variant="subtle"
                                                size="compact-sm"
                                                onClick={() => setMerging(user)}
                                            >
                                                <IconArrowMerge size={14} />
                                            </Button>
                                        </Tooltip>
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
                // Wide enough for the session table, which is four columns and
                // the widest thing this account view holds.
                size="xl"
                centered
            >
                {selected && (
                    <Tabs
                        defaultValue="general"
                        onChange={value => { if (value === "sessions") void loadSessions(selected); }}
                    >
                        <Tabs.List>
                            <Tabs.Tab value="general">{t("General")}</Tabs.Tab>
                            {/* PAM-style login on competitor workstations is a
                                later direction. It stays visible and dead rather
                                than opening an empty screen. */}
                            <Tabs.Tab value="unix" disabled>
                                Unix <Text component="span" size="xs" fs="italic" c="dimmed">{t("soon")}</Text>
                            </Tabs.Tab>
                            <Tabs.Tab value="sessions">{t("Sessions")}</Tabs.Tab>
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

                        <Tabs.Panel value="sessions" pt="md">
                            <Stack gap="sm">
                                <Group justify="space-between" align="center">
                                    <Text size="sm" c="dimmed">
                                        {/* What the badge means, said once. "Active"
                                            on its own reads as "not blocked", which
                                            is a different fact about a different
                                            thing. */}
                                        {t("A session is active while the browser holds a connection to the Server. Signing out is not the same as closing the tab.")}
                                    </Text>
                                    <Button
                                        variant="default"
                                        size="xs"
                                        onClick={() => void loadSessions(selected)}
                                    >
                                        {t("Refresh")}
                                    </Button>
                                </Group>

                                {sessionsError !== undefined && (
                                    <Alert color="red" title={t("Could not read the sessions")}>{sessionsError}</Alert>
                                )}
                                {sessions === undefined && sessionsError === undefined && (
                                    <Center my="md"><Loader /></Center>
                                )}
                                <>
                                    {sessions?.length === 0 && (
                                        <Alert color="gray">
                                            {selected.blockedAt
                                                ? t("A blocked account has no sessions: blocking ends them and stops new ones.")
                                                : t("No sessions. Nobody is signed in as this account.")}
                                        </Alert>
                                    )}
                                    {sessions !== undefined && sessions.length > 0 && (
                                        <>
                                            <Table striped highlightOnHover tabularNums>
                                                <Table.Thead>
                                                    {/* Widths given rather than left to the
                                                        content: a Mantine badge clips its own
                                                        text, so a narrow first column turns
                                                        "Bez połączenia" into "BEZ PO…" — the
                                                        one word on the row that has to be
                                                        readable. */}
                                                    <Table.Tr>
                                                        <Table.Th w={150}>{t("State")}</Table.Th>
                                                        <Table.Th w={180}>{t("Last request")}</Table.Th>
                                                        <Table.Th w={150}>{t("Signed in")}</Table.Th>
                                                        <Table.Th>{t("From")}</Table.Th>
                                                    </Table.Tr>
                                                </Table.Thead>
                                                <Table.Tbody>
                                                    {sessions.map(session => (
                                                        <Table.Tr key={session.id}>
                                                            <Table.Td>
                                                                <Group gap={6}>
                                                                    <Badge
                                                                        variant="light"
                                                                        color={session.connections > 0 ? "teal" : "gray"}
                                                                    >
                                                                        {session.connections > 0
                                                                            ? t("sessionState.connected")
                                                                            : t("sessionState.disconnected")}
                                                                    </Badge>
                                                                    {/* Two tabs is a fact the flag cannot carry. */}
                                                                    {session.connections > 1 && (
                                                                        <Tooltip label={t("Open connections")}>
                                                                            <Badge variant="outline" color="teal" size="sm">
                                                                                ×{session.connections}
                                                                            </Badge>
                                                                        </Tooltip>
                                                                    )}
                                                                    {session.isCurrent && (
                                                                        <Badge variant="outline" color="blue" size="sm">
                                                                            {t("this one")}
                                                                        </Badge>
                                                                    )}
                                                                </Group>
                                                            </Table.Td>
                                                            <Table.Td>
                                                                {session.lastRequestAt
                                                                    ? <ActivityTime value={session.lastRequestAt} timeZone="Europe/Warsaw" hideZone />
                                                                    : <Text size="sm" c="dimmed">—</Text>}
                                                                {session.lastRequestPath && (
                                                                    <Text size="xs" c="dimmed" ff="monospace">
                                                                        {session.lastRequestPath}
                                                                    </Text>
                                                                )}
                                                            </Table.Td>
                                                            <Table.Td>
                                                                <ActivityTime value={session.startedAt} timeZone="Europe/Warsaw" hideZone />
                                                                {session.expiresAt && (
                                                                    <Text size="xs" c="dimmed">
                                                                        {t("Expires")}: <ActivityTime value={session.expiresAt} timeZone="Europe/Warsaw" format="date" hideZone />
                                                                    </Text>
                                                                )}
                                                            </Table.Td>
                                                            <Table.Td>
                                                                <Text size="sm" ff="monospace">{session.ipAddress ?? "—"}</Text>
                                                                {session.userAgent && (
                                                                    <Text size="xs" c="dimmed" lineClamp={1}>{session.userAgent}</Text>
                                                                )}
                                                            </Table.Td>
                                                        </Table.Tr>
                                                    ))}
                                                </Table.Tbody>
                                            </Table>

                                            {/* A snapshot says when it was taken.
                                                Without this the reader has no way
                                                to tell a live list from one read
                                                ten minutes ago. */}
                                            {takenAt && (
                                                <Text size="xs" c="dimmed">
                                                    {t("Read at")}{" "}
                                                    <ActivityTime value={takenAt} timeZone="Europe/Warsaw" hideZone />
                                                </Text>
                                            )}
                                        </>
                                    )}
                                </>
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

            <MergeAccountModal
                source={merging}
                candidates={items}
                onClose={() => setMerging(undefined)}
                onMerged={() => setReload(n => n + 1)}
            />

            <CredentialsModal
                credentials={credentials}
                onClose={() => setCredentials(undefined)}
                handout={handout}
            />

            <TemporaryAccountsModal
                opened={bulk.open}
                onClose={() => setBulk({ open: false })}
                activities={activities}
                templates={templates}
                run={run}
                busy={busy}
                onCreated={() => setReload(n => n + 1)}
                handout={handout}
            />
        </Stack>
    );
}
