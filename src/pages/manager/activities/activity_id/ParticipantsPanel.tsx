import { Alert, Badge, Button, Group, Modal, Pagination, Paper, Select, Stack, Switch, Table, Text, TextInput, Title } from "@mantine/core";
import { IconPlus, IconTrash, IconUsersPlus, IconX } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
    ActivityGroup, Grant, ManagedActivity, ManagedUserSummary, PermissionDefinition,
    PermissionTemplate,
} from "../../../../api/ManagerApi";
import LoadState from "../../../../components/LoadState";
import { isStaffGrant } from "../../../../api/permissions";
import PermissionSetEditor from "../../../../components/permissions/PermissionSetEditor";
import TemporaryAccountsModal from "../../../../components/users/TemporaryAccountsModal";
import ActivityTime from "../../../../components/time/ActivityTime";
import { useApiCall, useApiEffect } from "../../../../provider/apiContext";
import { usePermissions } from "../../../../provider/permissionsContext";

/**
 * Who is in the activity.
 *
 * There is no membership table beside this one: a grant in an activity **is**
 * the membership, so enrolling somebody and saying what they may do is a single
 * act. Bulk enrolment and join codes come later; one at a time is what the
 * permission model already supports.
 */

const PAGE_SIZE = 20;

interface Draft {
    userId: string;
    permissions: string[];
    createdFromTemplate?: string;
    /** What the manager asked for. Ignored where the permissions settle it. */
    isSystem: boolean;
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
    const [catalogue, setCatalogue] = useState<PermissionDefinition[]>([]);
    const [templates, setTemplates] = useState<PermissionTemplate[]>([]);
    const [users, setUsers] = useState<ManagedUserSummary[]>([]);
    const [grantable, setGrantable] = useState<string[]>([]);
    const [draft, setDraft] = useState<Draft | undefined>(undefined);
    const [bulk, setBulk] = useState(false);
    const [busy, setBusy] = useState(false);
    const [reload, setReload] = useState(0);
    const [groups, setGroups] = useState<ActivityGroup[]>([]);
    const [newGroup, setNewGroup] = useState("");

    const loadError = useApiEffect(async (api) => {
        setCatalogue(await api.managerApi.getPermissionCatalogue());
        setTemplates(await api.managerApi.getPermissionTemplates());
        setUsers(await api.managerApi.searchUsers(""));
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

    const applyTemplate = (name: string | null) => {
        if (!draft) return;
        const template = templates.find(t => t.name === name);
        setDraft({
            ...draft,
            createdFromTemplate: template?.name,
            permissions: template ? [...template.permissions] : draft.permissions,
        });
    };

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
                isSystem: draft.isSystem,
                createdFromTemplate: draft.createdFromTemplate,
            }));
            setDraft(undefined);
        });
    };

    if (!grants) return <LoadState error={loadError} loading={!loadError} />;

    const enrolled = new Set(grants.map(g => g.userId));
    const participantTemplate = templates.find(t => t.isBuiltIn && t.permissions.length > 0);

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
                                        onClick={() => void (async () => {
                                            setBusy(true);
                                            try {
                                                await call(api =>
                                                    api.managerApi.deleteGroup(activity.id, group.id));
                                                setReload(r => r + 1);
                                            } finally {
                                                setBusy(false);
                                            }
                                        })()}
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
                        <Button
                            size="xs"
                            variant="default"
                            disabled={busy || newGroup.trim().length === 0}
                            onClick={() => void (async () => {
                                setBusy(true);
                                try {
                                    await call(api => api.managerApi.createGroup(
                                        activity.id, { name: newGroup.trim(), isSystem: false }));
                                    setNewGroup("");
                                    setReload(r => r + 1);
                                } finally {
                                    setBusy(false);
                                }
                            })()}
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
                        <Button
                            variant="light"
                            leftSection={<IconUsersPlus size={16} />}
                            disabled={activity.archivedAt !== undefined}
                            onClick={() => setBulk(true)}
                        >
                            {t("Temporary accounts")}
                        </Button>
                    )}
                    <Button
                        leftSection={<IconPlus size={16} />}
                        disabled={activity.archivedAt !== undefined}
                        onClick={() => setDraft({
                            userId: "",
                            permissions: participantTemplate ? [...participantTemplate.permissions] : [],
                            createdFromTemplate: participantTemplate?.name,
                            isSystem: false,
                            existing: false,
                        })}
                    >
                        {t("Enrol someone")}
                    </Button>
                </Group>
            </Group>

            <Table.ScrollContainer minWidth={720}>
                <Table striped highlightOnHover>
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th>{t("User")}</Table.Th>
                            <Table.Th>{t("Started from")}</Table.Th>
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
                                    <Text size="sm" c="dimmed">{grant.createdFromTemplate ?? "—"}</Text>
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
                                        disabled={busy || isStaffGrant(grant.permissions, catalogue)}
                                        onChange={value => void (async () => {
                                            setBusy(true);
                                            try {
                                                await call(api => api.managerApi.setParticipantGroup(
                                                    activity.id, grant.userId, value || undefined));
                                                setReload(r => r + 1);
                                            } finally {
                                                setBusy(false);
                                            }
                                        })()}
                                    />
                                </Table.Td>
                                <Table.Td><Badge variant="light">{grant.permissions.length}</Badge></Table.Td>
                                <Table.Td>
                                    <Badge variant="light" color={grant.state === "active" ? "teal" : "blue"}>
                                        {t(`grantState.${grant.state}`)}
                                    </Badge>
                                </Table.Td>
                                <Table.Td>
                                    <ActivityTime value={grant.createdAt} timeZone={activity.timeZone} format="date" hideZone />
                                </Table.Td>
                                <Table.Td>
                                    <Group gap="xs" justify="flex-end" wrap="nowrap">
                                        <Button
                                            variant="light"
                                            size="compact-sm"
                                            onClick={() => setDraft({
                                                userId: grant.userId,
                                                permissions: [...grant.permissions],
                                                createdFromTemplate: grant.createdFromTemplate,
                                                isSystem: grant.isSystem,
                                                existing: true,
                                            })}
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
                </Table>
            </Table.ScrollContainer>

            {grants.length === 0 && <Text c="dimmed">{t("Nobody is enrolled yet")}</Text>}

            <Group justify="center">
                <Pagination total={Math.ceil(total / PAGE_SIZE)} value={page} onChange={setPage} />
            </Group>

            <Modal
                opened={draft !== undefined}
                onClose={() => setDraft(undefined)}
                title={<Title order={4}>{draft?.existing ? t("Edit the grant") : t("Enrol someone")}</Title>}
                size="xl"
                centered
            >
                {draft && (
                    <Stack gap="sm">
                        <Select
                            label={t("User")}
                            data={users
                                .filter(u => draft.existing || !enrolled.has(u.id))
                                .map(u => ({ value: u.id, label: `${u.name} (${u.username})` }))}
                            value={draft.userId || null}
                            onChange={v => v && setDraft({ ...draft, userId: v })}
                            searchable
                            disabled={draft.existing}
                            required
                        />
                        <Select
                            label={t("Start from a template")}
                            description={t("A template fills the set in and is then forgotten")}
                            data={templates.map(template => ({ value: template.name, label: template.name }))}
                            value={draft.createdFromTemplate ?? null}
                            onChange={applyTemplate}
                            clearable
                        />
                        <PermissionSetEditor
                            catalogue={catalogue}
                            value={draft.permissions}
                            onChange={permissions => setDraft({ ...draft, permissions })}
                            grantable={grantable}
                            scope="activity"
                        />
                        {/* Forced on for staff: a jury member in the ranking
                            beside the students is a bug, not a preference. Free
                            for an ordinary membership, where a test account or
                            the one running the reference solution is exactly
                            what it is for. */}
                        <Switch
                            label={t("Systemic membership")}
                            description={isStaffGrant(draft.permissions, catalogue)
                                ? t("Whoever runs the activity does not compete in it, so this cannot be turned off.")
                                : t("Submits like anybody, counts as nobody: absent from the participant count and from the ranking.")}
                            checked={isStaffGrant(draft.permissions, catalogue) || draft.isSystem}
                            onChange={e => setDraft({ ...draft, isSystem: e.currentTarget.checked })}
                            disabled={isStaffGrant(draft.permissions, catalogue)}
                        />
                        <Alert color="blue">
                            {t("Nobody may grant a permission they do not hold themselves.")}
                        </Alert>
                        <Group justify="space-between">
                            <Button variant="default" onClick={() => setDraft(undefined)}>{t("Back")}</Button>
                            <Button loading={busy} onClick={save}>{t("Save")}</Button>
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
