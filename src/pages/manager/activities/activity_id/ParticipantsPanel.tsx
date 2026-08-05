import { Alert, Badge, Button, Group, Modal, Pagination, Select, Stack, Table, Text, Title } from "@mantine/core";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
    Grant, ManagedActivity, ManagedUserSummary, PermissionDefinition, PermissionTemplate,
} from "../../../../api/ManagerApi";
import LoadState from "../../../../components/LoadState";
import PermissionSetEditor from "../../../../components/permissions/PermissionSetEditor";
import ActivityTime from "../../../../components/time/ActivityTime";
import { useApiCall, useApiEffect } from "../../../../provider/apiContext";

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
    existing: boolean;
}

export interface ParticipantsPanelProps {
    activity: ManagedActivity;
    onError: (message: string) => void;
}

export default function ParticipantsPanel({ activity, onError }: ParticipantsPanelProps) {
    const { t } = useTranslation();
    const call = useApiCall();

    const [grants, setGrants] = useState<Grant[] | undefined>(undefined);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [catalogue, setCatalogue] = useState<PermissionDefinition[]>([]);
    const [templates, setTemplates] = useState<PermissionTemplate[]>([]);
    const [users, setUsers] = useState<ManagedUserSummary[]>([]);
    const [grantable, setGrantable] = useState<string[]>([]);
    const [draft, setDraft] = useState<Draft | undefined>(undefined);
    const [busy, setBusy] = useState(false);
    const [reload, setReload] = useState(0);

    const loadError = useApiEffect(async (api) => {
        setCatalogue(await api.managerApi.getPermissionCatalogue());
        setTemplates(await api.managerApi.getPermissionTemplates());
        setUsers(await api.managerApi.searchUsers(""));
        // What may be handed out here is what the signed-in manager holds **in
        // this activity**, which is not the same set as their system rights.
        setGrantable(await api.managerApi.getMyPermissions(activity.id));

        setGrants(undefined);
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
            <Group justify="space-between" wrap="wrap">
                <Text size="sm" c="dimmed">
                    {t("A grant in this activity is the membership: holding one is being in it.")}
                </Text>
                <Button
                    leftSection={<IconPlus size={16} />}
                    disabled={activity.archivedAt !== undefined}
                    onClick={() => setDraft({
                        userId: "",
                        permissions: participantTemplate ? [...participantTemplate.permissions] : [],
                        createdFromTemplate: participantTemplate?.name,
                        existing: false,
                    })}
                >
                    {t("Enrol someone")}
                </Button>
            </Group>

            <Table.ScrollContainer minWidth={720}>
                <Table striped highlightOnHover>
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th>{t("User")}</Table.Th>
                            <Table.Th>{t("Started from")}</Table.Th>
                            <Table.Th>{t("Permissions")}</Table.Th>
                            <Table.Th>{t("State")}</Table.Th>
                            <Table.Th>{t("Date")}</Table.Th>
                            <Table.Th />
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {grants.map(grant => (
                            <Table.Tr key={grant.id}>
                                <Table.Td><Text fw={500}>{grant.userName}</Text></Table.Td>
                                <Table.Td>
                                    <Text size="sm" c="dimmed">{grant.createdFromTemplate ?? "—"}</Text>
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
        </Stack>
    );
}
