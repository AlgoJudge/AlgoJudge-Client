import { Alert, Badge, Button, Group, Modal, Pagination, Select, Stack, Table, Text, Title } from "@mantine/core";
import { IconPlus, IconTrash, IconWorld } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
    Grant,
    ManagedActivitySummary,
    ManagedUserSummary,
    PermissionDefinition,
    PermissionTemplate,
} from "../../../api/ManagerApi";
import LoadState from "../../../components/LoadState";
import PermissionSetEditor from "../../../components/permissions/PermissionSetEditor";
import ActivityTime from "../../../components/time/ActivityTime";
import { useApiCall, useApiEffect } from "../../../provider/apiContext";

const PAGE_SIZE = 20;

interface Draft {
    userId: string;
    activityId?: string;
    permissions: string[];
    createdFromTemplate?: string;
    /** An existing grant is being edited; the pair cannot be changed. */
    existing: boolean;
}

export default function GrantsPage() {
    const { t } = useTranslation();
    const call = useApiCall();

    const [grants, setGrants] = useState<Grant[] | undefined>(undefined);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [scope, setScope] = useState<string | null>(null);
    const [activityFilter, setActivityFilter] = useState<string | null>(null);

    const [catalogue, setCatalogue] = useState<PermissionDefinition[]>([]);
    const [templates, setTemplates] = useState<PermissionTemplate[]>([]);
    const [users, setUsers] = useState<ManagedUserSummary[]>([]);
    const [activities, setActivities] = useState<ManagedActivitySummary[]>([]);
    const [grantable, setGrantable] = useState<string[]>([]);

    const [draft, setDraft] = useState<Draft | undefined>(undefined);
    const [error, setError] = useState<string | undefined>(undefined);
    const [saving, setSaving] = useState(false);
    const [reload, setReload] = useState(0);

    const loadError = useApiEffect(async (api) => {
        setCatalogue(await api.managerApi.getPermissionCatalogue());
        setTemplates(await api.managerApi.getPermissionTemplates());
        setUsers(await api.managerApi.searchUsers(""));
        setActivities(await api.managerApi.getManagedActivities());

        setGrants(undefined);
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

    const open = async (draft: Draft) => {
        setError(undefined);
        setDraft(draft);
        await loadGrantable(draft.activityId);
    };

    const applyTemplate = (name: string | null) => {
        if (!draft) return;
        const template = templates.find(t => t.name === name);
        // A template fills the set in and is then forgotten; the name is kept as
        // a label so the screen can say where a set started, not what it is.
        setDraft({
            ...draft,
            createdFromTemplate: template?.name,
            permissions: template ? [...template.permissions] : draft.permissions,
        });
    };

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
                createdFromTemplate: draft.createdFromTemplate,
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
                    onClick={() => open({ userId: "", permissions: [], existing: false })}
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

            <Table.ScrollContainer minWidth={760}>
                <Table striped highlightOnHover>
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th>{t("User")}</Table.Th>
                            <Table.Th>{t("Scope")}</Table.Th>
                            <Table.Th>{t("Permissions")}</Table.Th>
                            <Table.Th>{t("Started from")}</Table.Th>
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
                                                createdFromTemplate: grant.createdFromTemplate,
                                                existing: true,
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
                                    {grant.permissions.includes("system:administrator")
                                        ? <Badge color="orange" variant="light">{t("Administrator")}</Badge>
                                        : <Badge variant="outline">{grant.permissions.length}</Badge>}
                                </Table.Td>
                                <Table.Td>
                                    <Text size="sm" c="dimmed">{grant.createdFromTemplate ?? "—"}</Text>
                                </Table.Td>
                                <Table.Td>
                                    <Badge variant="light" color={grant.state === "active" ? "teal" : "blue"}>
                                        {t(grant.state)}
                                    </Badge>
                                </Table.Td>
                                <Table.Td>
                                    <ActivityTime value={grant.createdAt} timeZone="Europe/Warsaw" format="date" hideZone />
                                </Table.Td>
                                <Table.Td>
                                    <Group gap="xs" justify="flex-end" wrap="nowrap">
                                        <Button
                                            variant="light"
                                            size="compact-sm"
                                            onClick={() => open({
                                                userId: grant.userId,
                                                activityId: grant.activityId,
                                                permissions: [...grant.permissions],
                                                createdFromTemplate: grant.createdFromTemplate,
                                                existing: true,
                                            })}
                                        >
                                            {t("Edit")}
                                        </Button>
                                        <Button
                                            variant="light"
                                            color="red"
                                            size="compact-sm"
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
                </Table>
            </Table.ScrollContainer>

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
                                data={users.map(u => ({ value: u.id, label: `${u.name} (${u.username})` }))}
                                value={draft.userId || null}
                                onChange={v => setDraft({ ...draft, userId: v ?? "" })}
                                searchable
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

                        <Select
                            label={t("Start from a template")}
                            description={t("Copies its permissions in. Nothing links back to it afterwards.")}
                            placeholder={t("Choose a template")}
                            data={templates.map(tpl => ({ value: tpl.name, label: tpl.name }))}
                            value={draft.createdFromTemplate ?? null}
                            onChange={applyTemplate}
                            clearable
                        />

                        <PermissionSetEditor
                            catalogue={catalogue}
                            value={draft.permissions}
                            onChange={permissions => setDraft({ ...draft, permissions })}
                            grantable={grantable}
                            scope={editorScope}
                        />

                        {error && <Alert color="red">{error}</Alert>}

                        <Group justify="space-between">
                            <Button variant="default" onClick={() => { setDraft(undefined); setError(undefined); }}>
                                {t("Back")}
                            </Button>
                            <Button loading={saving} onClick={save}>{t("Save")}</Button>
                        </Group>
                    </Stack>
                )}
            </Modal>
        </Stack>
    );
}
