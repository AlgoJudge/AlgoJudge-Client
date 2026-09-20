import { Alert, Badge, Button, Group, Modal, MultiSelect, Pagination, Paper, Select, Stack, Switch, Table, Text, TextInput, Title } from "@mantine/core";
import { IconPlus, IconTrash, IconUsersPlus, IconX } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
    ActivityGroup, Grant, ManagedActivity, PermissionDefinition,
    Role,
} from "../../../../api/ManagerApi";
import LoadState from "../../../../components/LoadState";
import { effectivePermissions, isStaffGrant } from "../../../../api/permissions";
import PermissionSetEditor from "../../../../components/permissions/PermissionSetEditor";
import TemporaryAccountsModal from "../../../../components/users/TemporaryAccountsModal";
import ActivityTime from "../../../../components/time/ActivityTime";
import { optional, useApiCall, useApiEffect } from "../../../../provider/apiContext";
import { usePermissions } from "../../../../provider/permissionsContext";
import { useUserSearch } from "../../../../components/users/useUserSearch";
import DataTable from "../../../../components/table/DataTable";

/**
 * Who is in the activity.
 *
 * There is no membership table beside this one: a grant in an activity **is**
 * the membership, so enrolling somebody and saying what they may do is a single
 * act. Bulk enrollment and join codes come later; one at a time is what the
 * permission model already supports.
 */

const PAGE_SIZE = 20;

interface Draft {
    userId: string;
    /** The grant's own entries — additions on top of the roles. */
    permissions: string[];
    /** The roles it links, which is what enrolling normally hands out. */
    roleIds: string[];
    /** What the manager asked for. Ignored where the permissions settle it. */
    staffByHand: boolean;
    existing: boolean;
}

export interface ParticipantsPanelProps {
    activity: ManagedActivity;
    onError: (message: string) => void;
}

export default function ParticipantsPanel({ activity, onError }: ParticipantsPanelProps) {
    const { t } = useTranslation();
    const call = useApiCall();
    const { has } = usePermissions();

    const [grants, setGrants] = useState<Grant[] | undefined>(undefined);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [catalog, setCatalog] = useState<PermissionDefinition[]>([]);
    const [templates, setTemplates] = useState<Role[]>([]);
    const { users, search: searchUsers, remember } = useUserSearch();
    const [grantable, setGrantable] = useState<string[]>([]);
    const [draft, setDraft] = useState<Draft | undefined>(undefined);
    const [bulk, setBulk] = useState(false);
    const [busy, setBusy] = useState(false);
    const [reload, setReload] = useState(0);
    const [groups, setGroups] = useState<ActivityGroup[]>([]);
    const [newGroup, setNewGroup] = useState("");

    const loadError = useApiEffect(async (api) => {
        setCatalog(await api.managerApi.getPermissionCatalog());
        // A picker in the grant editor, and not what this tab is for, so a
        // manager who may not read the roles gets it empty and the roster all
        // the same. The person picker is filled by typing — see `useUserSearch`.
        setTemplates(await optional(api.managerApi.getRoles(activity.id), []));
        // What may be handed out here is what the signed-in manager holds **in
        // this activity**, which is not the same set as their system rights.
        setGrantable(await api.managerApi.getMyPermissions(activity.id));
        setGroups(await api.managerApi.getGroups(activity.id));

        // The previous list stays on screen while the next one loads. Blanking it
        // would take the whole panel down to a spinner on every save — and with
        // it the modal holding freshly created passwords, which are the only
        // copy there will ever be.
        const result = await api.managerApi.getGrants({ page, pageSize: PAGE_SIZE, activityId: activity.id });
        setGrants(result.items);
        setTotal(result.total);
        api.managerApi.eventDispatcher.addEventListener("grantChanged", () => setReload(n => n + 1));
    }, [activity.id, page, reload]);

    const run = async (operation: () => Promise<unknown>) => {
        setBusy(true);
        try {
            await operation();
            setReload(n => n + 1);
        } catch (e) {
            onError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    };

    /**
     * Which roles this membership links.
     *
     * **Enrolling somebody hands them roles, not a copy of one.** A correction
     * to a role reaches them; what is edited below is what this one person gets
     * on top of them.
     *
     * Taking one away here is also what stops an LTI launch putting it back: the
     * Server keeps the removal, so a correction outlives the next launch.
     */
    const chooseRoles = (ids: string[]) => {
        if (!draft) return;
        setDraft({ ...draft, roleIds: ids });
    };

    const roleOf = (id: string) => templates.find(t => t.id === id);

    /**
     * What the draft would carry once saved: its role and its own entries.
     *
     * **The switch is derived from this, not from the entries alone.** A grant
     * pointing at the manager role holds no entries of its own, so reading only
     * those would have offered to put whoever runs the activity into its
     * ranking.
     */
    const drafted = (d: Draft) =>
        [...new Set([...d.roleIds.flatMap(id => roleOf(id)?.permissions ?? []), ...d.permissions])];

    const save = () => {
        if (!draft?.userId) {
            onError(t("Choose a user"));
            return;
        }
        run(async () => {
            await call(api => api.managerApi.setGrant({
                userId: draft.userId,
                activityId: activity.id,
                permissions: draft.permissions,
                staffByHand: draft.staffByHand,
                roleIds: draft.roleIds,
            }));
            setDraft(undefined);
        });
    };

    if (!grants) return <LoadState error={loadError} loading={!loadError} />;

    const enrolled = new Set(grants.map(g => g.userId));
    // **What this activity enrolls into**, which is the setting that makes a role
    // of its own reach anybody. Falls back to the shipped one, exactly as the
    // Server does when the activity has chosen nothing.
    const participantRoles = activity.participantRoleIds.length > 0
        ? templates.filter(t => activity.participantRoleIds.includes(t.id))
        : templates.filter(t => t.builtInKey === "participant");

    return (
        <Stack gap="md">
            {/* **Groups, above the roster that assigns to them.** A group is a
                contestant: it submits, it spends one allowance, and it holds one
                ranking row while its members hold none. One person in a group is
                legitimate — it is how somebody gets a name and a description in
                the ranking. */}
            <Paper withBorder p="md">
                <Stack gap="xs">
                    <Text size="sm" fw={500}>{t("Groups")}</Text>
                    <Text size="xs" c="dimmed">
                        {t("A group competes as one: one row in the ranking, one submission allowance, and the same grade for every member.")}
                    </Text>
                    <Group gap="xs" wrap="wrap">
                        {groups.map(group => (
                            <Badge
                                key={group.id}
                                variant={group.isSystem ? "outline" : "light"}
                                color={group.isSystem ? "gray" : undefined}
                                rightSection={
                                    <IconX
                                        size={12}
                                        style={{ cursor: "pointer" }}
                                        // Through `run`, like every other write
                                        // here: it catches, reports and reloads.
                                        // Three handlers duplicated it badly and
                                        // swallowed their errors, so a refusal
                                        // from the Server produced silence.
                                        onClick={() => void run(() => call(api =>
                                            api.managerApi.deleteGroup(activity.id, group.id)))}
                                    />
                                }
                            >
                                {group.name} · {group.memberCount}
                            </Badge>
                        ))}
                        {groups.length === 0 && (
                            <Text size="xs" c="dimmed">{t("No groups yet — everybody competes on their own.")}</Text>
                        )}
                    </Group>
                    <Group gap="xs">
                        <TextInput
                            size="xs"
                            placeholder={t("Group name")}
                            value={newGroup}
                            onChange={event => setNewGroup(event.currentTarget.value)}
                        />
                        <Button data-testid="add-group"
                            size="xs"
                            variant="default"
                            disabled={busy || newGroup.trim().length === 0}
                            onClick={() => void run(async () => {
                                await call(api => api.managerApi.createGroup(
                                    activity.id, { name: newGroup.trim(), isSystem: false }));
                                setNewGroup("");
                            })}
                        >
                            {t("Add group")}
                        </Button>
                    </Group>
                </Stack>
            </Paper>

            <Group justify="space-between" wrap="wrap">
                <Text size="sm" c="dimmed">
                    {t("A grant in this activity is the membership: holding one is being in it.")}
                </Text>
                <Group gap="xs">
                    {/* Accounts for a class that has none, enrolled here as they
                        are created. Offered only to somebody who may do both:
                        an entry that answers 403 is worse than none.
                        Enrolling is asked of **this** activity, because a grant
                        is per activity. Creating accounts is not: the permission
                        is held system-wide as readily as in one activity, so it
                        is asked of what the reader holds anywhere. */}
                    {has("user:create:temporary") && grantable.includes("activity:enroll") && (
                        <Button data-testid="temporary-accounts"
                            variant="light"
                            leftSection={<IconUsersPlus size={16} />}
                            disabled={activity.archivedAt !== undefined}
                            onClick={() => setBulk(true)}
                        >
                            {t("Temporary accounts")}
                        </Button>
                    )}
                    <Button data-testid="enroll-someone"
                        leftSection={<IconPlus size={16} />}
                        disabled={activity.archivedAt !== undefined}
                        onClick={() => setDraft({
                            userId: "",
                            permissions: [],
                            roleIds: participantRoles.map(role => role.id),
                            staffByHand: false,
                            existing: false,
                        })}
                    >
                        {t("Enroll someone")}
                    </Button>
                </Group>
            </Group>

            <DataTable minWidth={720} striped highlightOnHover>
                <Table.Thead>
                    <Table.Tr>
                        <Table.Th>{t("User")}</Table.Th>
                        <Table.Th>{t("Roles")}</Table.Th>
                        <Table.Th>{t("Group")}</Table.Th>
                        <Table.Th>{t("Permissions")}</Table.Th>
                        <Table.Th>{t("State")}</Table.Th>
                        <Table.Th>{t("Date")}</Table.Th>
                        <Table.Th />
                    </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                    {grants.map(grant => (
                        <Table.Tr key={grant.id}>
                            <Table.Td>
                                <Group gap="xs" wrap="nowrap">
                                    <Text fw={500}>{grant.userName}</Text>
                                    {/* Said in the row, because the count
                                        above it is a count of everybody
                                        else and the difference has to be
                                        visible somewhere. */}
                                    {grant.isSystem && (
                                        <Badge size="sm" variant="outline" color="gray">
                                            {t("systemic")}
                                        </Badge>
                                    )}
                                </Group>
                            </Table.Td>
                            <Table.Td>
                                {/* Every role it links, and where each came
                                    from: a launch's word looks different from a
                                    manager's when deciding whether to remove
                                    one. A set held entirely by hand shows none. */}
                                {grant.roles.length > 0
                                    ? (
                                        <Group gap={4} wrap="wrap">
                                            {grant.roles.map(role => (
                                                <Badge
                                                    key={role.roleId}
                                                    variant={role.sourceProviderId ? "outline" : "light"}
                                                    size="sm"
                                                    title={role.sourceProviderName
                                                        ? t("Asserted by {{provider}}", { provider: role.sourceProviderName })
                                                        : undefined}
                                                >
                                                    {role.name}
                                                </Badge>
                                            ))}
                                        </Group>
                                    )
                                    : <Text size="sm" c="dimmed">—</Text>}
                            </Table.Td>
                            <Table.Td>
                                {/* **Compulsory once set, so this is where it
                                    is chosen and nowhere else.** Moving
                                    somebody is allowed at any time and moves
                                    nothing already sent: each submission
                                    stamped its group when it was made. */}
                                <Select
                                    size="xs"
                                    w={160}
                                    data={[
                                        { value: "", label: t("On their own") },
                                        ...groups.map(g => ({ value: g.id, label: g.name })),
                                    ]}
                                    value={grant.groupId ?? ""}
                                    // Staff do not compete, so they are not
                                    // grouped either — the same reason the
                                    // ranking leaves them out.
                                    disabled={busy || isStaffGrant(effectivePermissions(grant), catalog)}
                                    onChange={value => void run(() => call(api =>
                                        api.managerApi.setParticipantGroup(
                                            activity.id, grant.userId, value || undefined)))}
                                />
                            </Table.Td>
                            <Table.Td><Badge variant="light">{effectivePermissions(grant).length}</Badge></Table.Td>
                            <Table.Td>
                                <Badge variant="light" color={grant.state === "active" ? "teal" : "blue"}>
                                    {t(`grantState.${grant.state}`)}
                                </Badge>
                            </Table.Td>
                            <Table.Td>
                                <ActivityTime value={grant.createdAt} timeZone={activity.timeZone} format="date" />
                            </Table.Td>
                            <Table.Td>
                                <Group gap="xs" justify="flex-end" wrap="nowrap">
                                    <Button
                                        variant="light"
                                        size="compact-sm"
                                        onClick={() => {
                                            // The picker is fed by searching, so
                                            // the person being edited has to be
                                            // put into it or the field shows an
                                            // id. The row already carries both
                                            // halves of the label.
                                            remember({
                                                id: grant.userId,
                                                name: grant.userName,
                                                username: grant.userLogin,
                                            });
                                            setDraft({
                                                userId: grant.userId,
                                                permissions: [...grant.permissions],
                                                roleIds: grant.roles.map(role => role.roleId),
                                                staffByHand: grant.staffByHand,
                                                existing: true,
                                            });
                                        }}
                                    >
                                        {t("Edit")}
                                    </Button>
                                    <Button
                                        variant="subtle"
                                        color="red"
                                        size="compact-sm"
                                        loading={busy}
                                        onClick={() => run(() => call(api => api.managerApi.revokeGrant(grant.id)))}
                                    >
                                        <IconTrash size={14} />
                                    </Button>
                                </Group>
                            </Table.Td>
                        </Table.Tr>
                    ))}
                </Table.Tbody>
            </DataTable>

            {grants.length === 0 && <Text c="dimmed">{t("Nobody is enrolled yet")}</Text>}

            <Group justify="center">
                <Pagination total={Math.ceil(total / PAGE_SIZE)} value={page} onChange={setPage} />
            </Group>

            <Modal
                opened={draft !== undefined}
                onClose={() => setDraft(undefined)}
                title={<Title order={4}>{draft?.existing ? t("Edit the grant") : t("Enroll someone")}</Title>}
                size="xl"
                centered
            >
                {draft && (
                    <Stack gap="sm">
                        <Select
                            label={t("User")}
                            placeholder={t("Search by name, username or email")}
                            data={users
                                .filter(u => draft.existing || !enrolled.has(u.id))
                                .map(u => ({ value: u.id, label: `${u.name} (${u.username})` }))}
                            value={draft.userId || null}
                            onChange={v => v && setDraft({ ...draft, userId: v })}
                            searchable
                            onSearchChange={searchUsers}
                            // Nothing matches until something is typed, and the
                            // field says so rather than looking broken.
                            nothingFoundMessage={t("Type a name to look somebody up")}
                            disabled={draft.existing}
                            required
                        />
                        <MultiSelect
                            label={t("Roles")}
                            description={t("Links, not copies: editing a role changes what this person may do.")}
                            placeholder={t("No roles — a set held by hand")}
                            data={templates.map(role => ({ value: role.id, label: role.name }))}
                            value={draft.roleIds}
                            onChange={chooseRoles}
                            clearable
                        />
                        {/* **Taking one away is a decision that lasts.** An LTI
                            launch adds the roles a platform asserts and never
                            removes one, so a role removed here is remembered as
                            removed — otherwise the correction would come back
                            undone at that person's next launch. */}
                        {draft.existing && draft.roleIds.length === 0 && (
                            <Alert color="yellow" variant="light">
                                {t("With no role left, this membership holds only what is set below.")}
                            </Alert>
                        )}
                        <PermissionSetEditor
                            catalog={catalog}
                            value={draft.permissions}
                            onChange={permissions => setDraft({ ...draft, permissions })}
                            grantable={grantable}
                            scope="activity"
                            inherited={draft.roleIds.flatMap(id => roleOf(id)?.permissions ?? [])}
                            inheritedFrom={draft.roleIds
                                .map(id => roleOf(id)?.name)
                                .filter((name): name is string => name !== undefined)
                                .join(", ") || undefined}
                        />
                        {/* Forced on for staff: a jury member in the ranking
                            beside the students is a bug, not a preference. Free
                            for an ordinary membership, where a test account or
                            the one running the reference solution is exactly
                            what it is for. */}
                        <Switch
                            label={t("Systemic membership")}
                            description={isStaffGrant(drafted(draft), catalog)
                                ? t("Whoever runs the activity does not compete in it, so this cannot be turned off.")
                                : t("Submits like anybody, counts as nobody: absent from the participant count and from the ranking.")}
                            checked={isStaffGrant(drafted(draft), catalog) || draft.staffByHand}
                            onChange={e => setDraft({ ...draft, staffByHand: e.currentTarget.checked })}
                            disabled={isStaffGrant(drafted(draft), catalog)}
                        />
                        <Alert color="blue">
                            {t("Nobody may grant a permission they do not hold themselves.")}
                        </Alert>
                        <Group justify="space-between">
                            <Button data-testid="back" variant="default" onClick={() => setDraft(undefined)}>{t("Back")}</Button>
                            <Button data-testid="save" loading={busy} onClick={save}>{t("Save")}</Button>
                        </Group>
                    </Stack>
                )}
            </Modal>

            {/* The activity is fixed: this was opened from inside it, so it is
                not a field somebody could get wrong. */}
            <TemporaryAccountsModal
                opened={bulk}
                onClose={() => setBulk(false)}
                activityId={activity.id}
                templates={templates}
                run={run}
                busy={busy}
                onCreated={() => setReload(n => n + 1)}
                // Made for this activity, so the slip points at this activity
                // rather than at the front page somebody would have to search
                // from.
                handout={{
                    url: `${window.location.origin}/activities/${activity.slug}`,
                    title: activity.name,
                }}
            />
        </Stack>
    );
}
