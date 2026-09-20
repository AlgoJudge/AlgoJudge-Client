import {
    Alert, Badge, Button, Group, Modal, MultiSelect, Pagination, Select, Stack, Switch, Table,
    Text, Title,
} from "@mantine/core";
import { IconAlertTriangle, IconPlus, IconTrash, IconWorld } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
    Grant,
    ManagedActivitySummary,
    ManagedUserSummary,
    PermissionDefinition,
    Role,
} from "../../../api/ManagerApi";
import { effectivePermissions } from "../../../api/permissions";
import LoadState from "../../../components/LoadState";
import PermissionSetEditor from "../../../components/permissions/PermissionSetEditor";
import ActivityTime from "../../../components/time/ActivityTime";
import { optional, useApiCall, useApiEffect } from "../../../provider/apiContext";
import { useUserSearch } from "../../../components/users/useUserSearch";
import DataTable from "../../../components/table/DataTable";

const PAGE_SIZE = 20;

interface Draft {
    userId: string;
    activityId?: string;
    /** The grant's own entries — additions on top of the roles, or the whole set. */
    permissions: string[];
    /** The roles it links, or none for a set held by hand. */
    roleIds: string[];
    /** Marks this membership staff whatever the permissions imply. */
    staffByHand: boolean;
    /** An existing grant is being edited; the pair cannot be changed. */
    existing: boolean;
    /**
     * Make this activity grant authoritative inside its activity.
     *
     * **Setting it on somebody who holds system permissions demotes them
     * there.** The modal says so at the moment of the act, because the first
     * sign of it otherwise is a manager who has quietly lost a screen.
     */
    overrideSystem: boolean;
    /** Whether the person already holds anything at system scope, for that warning. */
    holdsSystem: boolean;
}

export default function GrantsPage() {
    const { t } = useTranslation();
    const call = useApiCall();

    const [grants, setGrants] = useState<Grant[] | undefined>(undefined);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [scope, setScope] = useState<string | null>(null);
    const [activityFilter, setActivityFilter] = useState<string | null>(null);

    const [catalog, setCatalog] = useState<PermissionDefinition[]>([]);
    const [templates, setTemplates] = useState<Role[]>([]);
    const { users, search: searchUsers, remember } = useUserSearch();
    const [activities, setActivities] = useState<ManagedActivitySummary[]>([]);
    const [grantable, setGrantable] = useState<string[]>([]);

    const [draft, setDraft] = useState<Draft | undefined>(undefined);
    const [error, setError] = useState<string | undefined>(undefined);
    const [saving, setSaving] = useState(false);
    const [reload, setReload] = useState(0);

    const loadError = useApiEffect(async (api) => {
        setCatalog(await api.managerApi.getPermissionCatalog());
        // Pickers, not the page. See `optional`.
        setTemplates(await optional(api.managerApi.getRoles(activityFilter ?? undefined), []));
        setActivities(await api.managerApi.getManagedActivities());

        // **The list stays on screen while the next one loads.** This reset ran
        // on every effect run, not only the first, so the guard below fired on
        // every refetch and took the whole screen down to a spinner — with the
        // filter row in it. A manager typed one letter, the field was unmounted
        // under their hands, and the next letter went nowhere.
        //
        // Deleting the reset is the whole fix: `items` is undefined only before
        // the first load has ever finished, which turns that guard into what it
        // was written to be. The precedent, and the argument, are in
        // `ParticipantsPanel` and in `MANAGER_PANEL.md`.
        const result = await api.managerApi.getGrants({
            page, pageSize: PAGE_SIZE,
            scope: (scope as "global" | "activity") ?? undefined,
            activityId: activityFilter ?? undefined,
        });
        setGrants(result.items);
        setTotal(result.total);

        api.managerApi.eventDispatcher.addEventListener("grantChanged", () => setReload(n => n + 1));
    }, [page, scope, activityFilter, reload]);

    // What the editor may offer depends on the scope being edited, because a
    // system grant and an activity grant are checked against different sets.
    const loadGrantable = async (activityId?: string) => {
        const mine = await call(api => api.managerApi.getMyPermissions(activityId));
        setGrantable(mine);
    };

    /**
     * Opens the editor on a grant.
     *
     * `person` puts whoever it is about into the picker, which is fed by typing
     * rather than primed with everybody — without it the field on an existing
     * grant would draw a user id.
     */
    const open = async (draft: Draft, person?: ManagedUserSummary) => {
        setError(undefined);
        if (person) remember(person);
        setDraft(draft);
        await loadGrantable(draft.activityId);
    };

    /**
     * Points the grant at a role, or takes the link away.
     *
     * **It no longer copies anything.** What the role holds stays the role's, so
     * a correction to it reaches this person; the set edited below is what this
     * grant adds on top. Clearing the link leaves those additions alone — they
     * are somebody's decision about this person, and the role was not.
     */
    const chooseRoles = (ids: string[]) => {
        if (!draft) return;
        setDraft({ ...draft, roleIds: ids });
    };

    const roleOf = (id: string) => templates.find(t => t.id === id);

    /** What the roles a draft links carry together. */
    const inheritedBy = (ids: readonly string[]) =>
        [...new Set(ids.flatMap(id => roleOf(id)?.permissions ?? []))];

    /**
     * Whether this person already holds something across the installation.
     *
     * Read off the grants this screen has loaded, which is enough for the one
     * thing it is used for: warning that the override flag would demote
     * somebody. A separate request per row would be a request per row.
     */
    const holdsSystemPermissions = (userId: string): boolean =>
        (grants ?? []).some(g =>
            g.userId === userId && g.activityId === undefined
            && effectivePermissions(g).length > 0);

    const save = async () => {
        if (!draft) return;
        if (!draft.userId) {
            setError(t("Choose a user"));
            return;
        }
        setSaving(true);
        setError(undefined);
        try {
            await call(api => api.managerApi.setGrant({
                userId: draft.userId,
                activityId: draft.activityId,
                permissions: draft.permissions,
                roleIds: draft.roleIds,
                staffByHand: draft.staffByHand,
                overrideSystem: draft.overrideSystem,
            }));
            setDraft(undefined);
            setReload(n => n + 1);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setSaving(false);
        }
    };

    const revoke = async (grant: Grant) => {
        try {
            await call(api => api.managerApi.revokeGrant(grant.id));
            setReload(n => n + 1);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
    };

    if (!grants) return <LoadState error={loadError} loading={!loadError} />;

    const editorScope: "global" | "activity" = draft?.activityId ? "activity" : "global";

    return (
        <Stack gap="md">
            {/* **A refetch that fails has to say so.** The guard above only
                catches a first load, now that the list is no longer blanked, so
                without this a filter change that lost the connection would leave
                the previous rows on screen looking current. */}
            {loadError !== undefined && <LoadState error={loadError} loading={false} />}
            <Group justify="space-between" wrap="wrap">
                <Stack gap={2}>
                    <Title>{t("Grants")}</Title>
                    {/* A grant is the membership: there is no separate list of who
                        is in an activity that could disagree with this one. */}
                    <Text size="sm" c="dimmed">
                        {t("A grant is also the membership: holding one in an activity is being in it.")}
                    </Text>
                </Stack>
                <Button
                    leftSection={<IconPlus size={16} />}
                    onClick={() => open({
                        userId: "",
                        roleIds: [],
                        staffByHand: false,
                        // **Opened where this person can actually write.** With no
                        // scope the editor asks what the caller holds at system
                        // scope, which for anybody whose rights live in an
                        // activity is nothing — every permission grayed out and a
                        // refusal on save. A reader who manages exactly one
                        // activity means that one; anybody with a wider reach
                        // gets the choice they had.
                        activityId: activities.length === 1 ? activities[0].id : undefined,
                        permissions: [],
                        existing: false,
                        overrideSystem: false,
                        holdsSystem: false,
                    })}
                >
                    {t("New grant")}
                </Button>
            </Group>

            {error && !draft && <Alert color="red" withCloseButton onClose={() => setError(undefined)}>{error}</Alert>}

            <Group gap="sm" wrap="wrap">
                <Select
                    placeholder={t("Any scope")}
                    data={[
                        { value: "global", label: t("System scope") },
                        { value: "activity", label: t("Activity scope") },
                    ]}
                    value={scope}
                    onChange={v => { setScope(v); setPage(1); }}
                    clearable
                    w={200}
                />
                <Select
                    placeholder={t("All activities")}
                    data={activities.map(a => ({ value: a.id, label: a.name }))}
                    value={activityFilter}
                    onChange={v => { setActivityFilter(v); setPage(1); }}
                    clearable
                    searchable
                    w={300}
                />
            </Group>

            <DataTable minWidth={760} striped highlightOnHover>
                <Table.Thead>
                    <Table.Tr>
                        <Table.Th>{t("User")}</Table.Th>
                        <Table.Th>{t("Scope")}</Table.Th>
                        <Table.Th>{t("Permissions")}</Table.Th>
                        <Table.Th>{t("Roles")}</Table.Th>
                        <Table.Th>{t("Status")}</Table.Th>
                        <Table.Th>{t("Date")}</Table.Th>
                        <Table.Th />
                    </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                    {grants.map(grant => (
                        <Table.Tr key={grant.id}>
                            <Table.Td>
                                {/* The name opens the grant, as it opens the
                                    row on the problem, activity and Runner
                                    lists. The login is under it because a
                                    department has two people called Jan
                                    Kowalski and a name alone cannot be
                                    checked against anything. */}
                                <Stack gap={0}>
                                    <Text
                                        fw={500}
                                        style={{ cursor: "pointer" }}
                                        onClick={() => open({
                                            userId: grant.userId,
                                            activityId: grant.activityId,
                                            permissions: [...grant.permissions],
                                            roleIds: grant.roles.map(role => role.roleId),
                                            staffByHand: grant.staffByHand,
                                            existing: true,
                                            overrideSystem: grant.overrideSystem,
                                            holdsSystem: holdsSystemPermissions(grant.userId),
                                        }, {
                                            id: grant.userId,
                                            name: grant.userName,
                                            username: grant.userLogin,
                                        })}
                                    >
                                        {grant.userName}
                                    </Text>
                                    <Text size="xs" c="dimmed" ff="monospace">{grant.userLogin}</Text>
                                </Stack>
                            </Table.Td>
                            <Table.Td>
                                {grant.activityId
                                    ? <Text size="sm">{grant.activityName}</Text>
                                    : (
                                        <Badge variant="light" color="grape" leftSection={<IconWorld size={12} />}>
                                            {t("System scope")}
                                        </Badge>
                                    )}
                            </Table.Td>
                            <Table.Td>
                                {/* What they hold, which is the role and the
                                    grant's own entries together. */}
                                {effectivePermissions(grant).includes("system:administrator")
                                    ? <Badge color="orange" variant="light">{t("Administrator")}</Badge>
                                    : <Badge variant="outline">{effectivePermissions(grant).length}</Badge>}
                            </Table.Td>
                            <Table.Td>
                                <Stack gap={2}>
                                    {/* Every role it links. Outlined where a
                                        provider or a platform asserted it, so a
                                        row says which of the two decided — the
                                        question anybody removing one asks. */}
                                    {grant.roles.length > 0
                                        ? (
                                            <Group gap={4} wrap="wrap">
                                                {grant.roles.map(role => (
                                                    <Badge
                                                        key={role.roleId}
                                                        variant={role.sourceProviderId ? "outline" : "light"}
                                                        size="sm"
                                                    >
                                                        {role.name}
                                                    </Badge>
                                                ))}
                                            </Group>
                                        )
                                        : <Text size="sm" c="dimmed">—</Text>}
                                    {/* Taken away by hand, and therefore not put
                                        back by the next launch. Shown because a
                                        role that is absent for a reason reads
                                        differently from one nobody ever gave. */}
                                    {grant.dismissedRoles.length > 0 && (
                                        <Text size="xs" c="dimmed">
                                            {t("Removed: {{roles}}", {
                                                roles: grant.dismissedRoles.map(role => role.name).join(", "),
                                            })}
                                        </Text>
                                    )}
                                    {/* At system scope a person's permissions are
                                        the union of several rows — one assigned by
                                        hand, one per linked provider — so a list
                                        that did not say which row this is cannot
                                        be acted on. */}
                                    {grant.managed && (
                                        <Badge size="xs" variant="light" color="grape">
                                            {grant.sourceProviderName ?? t("From a provider")}
                                        </Badge>
                                    )}
                                    {grant.overrideSystem && (
                                        <Badge size="xs" variant="light" color="orange">
                                            {t("Overrides the system set")}
                                        </Badge>
                                    )}
                                </Stack>
                            </Table.Td>
                            <Table.Td>
                                <Badge variant="light" color={grant.state === "active" ? "teal" : "blue"}>
                                    {t(grant.state)}
                                </Badge>
                            </Table.Td>
                            <Table.Td>
                                <ActivityTime value={grant.createdAt} format="date" />
                            </Table.Td>
                            <Table.Td>
                                <Group gap="xs" justify="flex-end" wrap="nowrap">
                                    {/* A managed contribution belongs to its
                                        provider's mapping and is rewritten at every
                                        sign-in, so an edit here would last until
                                        that person next signed in. The Server
                                        refuses it; the screen does not offer it. */}
                                    {grant.managed && (
                                        <Text size="xs" c="dimmed" maw={220} ta="right">
                                            {t("Rewritten at every sign-in. Change the provider's mapping instead.")}
                                        </Text>
                                    )}
                                    <Button
                                        variant="light"
                                        size="compact-sm"
                                        disabled={grant.managed}
                                        onClick={() => open({
                                            userId: grant.userId,
                                            activityId: grant.activityId,
                                            permissions: [...grant.permissions],
                                            roleIds: grant.roles.map(role => role.roleId),
                                            staffByHand: grant.staffByHand,
                                            existing: true,
                                            overrideSystem: grant.overrideSystem,
                                            holdsSystem: holdsSystemPermissions(grant.userId),
                                        }, {
                                            id: grant.userId,
                                            name: grant.userName,
                                            username: grant.userLogin,
                                        })}
                                    >
                                        {t("Edit")}
                                    </Button>
                                    <Button
                                        variant="light"
                                        color="red"
                                        size="compact-sm"
                                        disabled={grant.managed}
                                        leftSection={<IconTrash size={14} />}
                                        onClick={() => revoke(grant)}
                                    >
                                        {t("Revoke")}
                                    </Button>
                                </Group>
                            </Table.Td>
                        </Table.Tr>
                    ))}
                </Table.Tbody>
            </DataTable>

            <Group justify="center">
                <Pagination total={Math.ceil(total / PAGE_SIZE)} value={page} onChange={setPage} />
            </Group>

            <Modal
                opened={!!draft}
                onClose={() => { setDraft(undefined); setError(undefined); }}
                title={<Title order={4}>{draft?.existing ? t("Edit grant") : t("New grant")}</Title>}
                size="xl"
                centered
            >
                {draft && (
                    <Stack gap="sm">
                        <Group grow align="flex-start">
                            <Select
                                label={t("User")}
                                placeholder={t("Search by name, username or email")}
                                data={users.map(u => ({ value: u.id, label: `${u.name} (${u.username})` }))}
                                value={draft.userId || null}
                                onChange={v => setDraft({ ...draft, userId: v ?? "" })}
                                searchable
                                onSearchChange={searchUsers}
                                nothingFoundMessage={t("Type a name to look somebody up")}
                                // The pair identifies the grant, so changing it on
                                // an existing one would silently move somebody
                                // else's permissions.
                                disabled={draft.existing}
                                required
                            />
                            <Select
                                label={t("Scope")}
                                description={t("Empty means the whole system")}
                                placeholder={t("System scope")}
                                data={activities.map(a => ({ value: a.id, label: a.name }))}
                                value={draft.activityId ?? null}
                                onChange={async v => {
                                    setDraft({ ...draft, activityId: v ?? undefined });
                                    await loadGrantable(v ?? undefined);
                                }}
                                searchable
                                clearable
                                disabled={draft.existing}
                            />
                        </Group>

                        {draft.activityId !== undefined && (
                            <Stack gap={4}>
                                <Switch
                                    label={t("This grant is the whole answer inside the activity")}
                                    description={t("System-wide permissions do not reach into it — not even an administrator's.")}
                                    checked={draft.overrideSystem}
                                    onChange={e => setDraft({ ...draft, overrideSystem: e.currentTarget.checked })}
                                />
                                {draft.overrideSystem && draft.holdsSystem && (
                                    <Alert color="orange" icon={<IconAlertTriangle size={16} />}>
                                        {t("This person holds permissions across the installation. Switching this on takes them away inside this activity — they will be whatever this grant says, and clearing it again needs somebody else.")}
                                    </Alert>
                                )}
                            </Stack>
                        )}

                        <MultiSelect
                            label={t("Roles")}
                            description={t("Links, not copies: editing a role changes what this person may do.")}
                            placeholder={t("No roles — a set held by hand")}
                            data={templates.map(role => ({ value: role.id, label: role.name }))}
                            value={draft.roleIds}
                            onChange={chooseRoles}
                            clearable
                        />

                        <PermissionSetEditor
                            catalog={catalog}
                            value={draft.permissions}
                            onChange={permissions => setDraft({ ...draft, permissions })}
                            grantable={grantable}
                            scope={editorScope}
                            inherited={inheritedBy(draft.roleIds)}
                            inheritedFrom={draft.roleIds
                                .map(id => roleOf(id)?.name)
                                .filter((name): name is string => name !== undefined)
                                .join(", ") || undefined}
                        />

                        {error && <Alert color="red">{error}</Alert>}

                        <Group justify="space-between">
                            <Button data-testid="back" variant="default" onClick={() => { setDraft(undefined); setError(undefined); }}>
                                {t("Back")}
                            </Button>
                            <Button data-testid="save" loading={saving} onClick={save}>{t("Save")}</Button>
                        </Group>
                    </Stack>
                )}
            </Modal>
        </Stack>
    );
}
