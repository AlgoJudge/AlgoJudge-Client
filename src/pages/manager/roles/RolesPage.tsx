import { Alert, Badge, Button, Card, Group, Modal, SegmentedControl, Stack, Text, TextInput, Textarea, Title } from "@mantine/core";
import { IconCopy, IconLock, IconPlus, IconTrash } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PermissionDefinition, Role } from "../../../api/ManagerApi";
import LoadState from "../../../components/LoadState";
import PermissionSetEditor from "../../../components/permissions/PermissionSetEditor";
import { useApiCall, useApiEffect } from "../../../provider/apiContext";

interface Draft {
    id?: string;
    name: string;
    description: string;
    permissions: string[];
    isBuiltIn: boolean;
    /** How many grants an edit would reach. Nothing for a role being made. */
    grants?: number;
}

const draftFrom = (role: Role): Draft => ({
    id: role.id,
    name: role.name,
    description: role.description ?? "",
    permissions: [...role.permissions],
    isBuiltIn: role.isBuiltIn,
    grants: role.grants,
});

export default function RolesPage() {
    const { t } = useTranslation();
    const call = useApiCall();

    const [templates, setTemplates] = useState<Role[] | undefined>(undefined);
    const [catalogue, setCatalogue] = useState<PermissionDefinition[]>([]);
    const [grantable, setGrantable] = useState<string[]>([]);
    const [draft, setDraft] = useState<Draft | undefined>(undefined);
    const [scope, setScope] = useState<"global" | "activity">("activity");
    const [error, setError] = useState<string | undefined>(undefined);
    const [saving, setSaving] = useState(false);
    const [reload, setReload] = useState(0);

    const loadError = useApiEffect(async (api) => {
        setCatalogue(await api.managerApi.getPermissionCatalogue());
        setGrantable(await api.managerApi.getMyPermissions());
        setTemplates(await api.managerApi.getRoles(undefined));

        api.managerApi.eventDispatcher.addEventListener("roleChanged", () => setReload(n => n + 1));
    }, [reload]);

    const save = async () => {
        if (!draft) return;
        if (draft.name.trim().length === 0) {
            setError(t("Give the role a name"));
            return;
        }
        setSaving(true);
        setError(undefined);
        try {
            const input = {
                name: draft.name.trim(),
                description: draft.description.trim() || undefined,
                permissions: draft.permissions,
            };
            await call(api => draft.id
                ? api.managerApi.updateRole(draft.id, input)
                : api.managerApi.createRole(input));
            setDraft(undefined);
            setReload(n => n + 1);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setSaving(false);
        }
    };

    const remove = async (template: Role) => {
        try {
            await call(api => api.managerApi.deleteRole(template.id));
            setReload(n => n + 1);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
    };

    if (!templates) return <LoadState error={loadError} loading={!loadError} />;

    return (
        <Stack gap="md">
            <Group justify="space-between" wrap="wrap">
                <Stack gap={2}>
                    <Title>{t("Roles")}</Title>
                    {/* The opposite of what this said until roles arrived, and
                        the sentence has to be got right: an edit here reaches
                        everybody holding the role, at once. */}
                    <Text size="sm" c="dimmed">
                        {t("A grant points at a role. Editing one changes what everybody holding it may do.")}
                    </Text>
                </Stack>
                <Button
                    leftSection={<IconPlus size={16} />}
                    onClick={() => setDraft({ name: "", description: "", permissions: [], isBuiltIn: false })}
                >
                    {t("New role")}
                </Button>
            </Group>

            {error && !draft && <Alert color="red" onClose={() => setError(undefined)} withCloseButton>{error}</Alert>}

            {templates.map(template => (
                <Card key={template.id} withBorder radius="sm">
                    <Group justify="space-between" wrap="wrap">
                        <Stack gap={2}>
                            <Group gap="xs">
                                {/* The name opens the editor, as the name does on
                                    the problem, activity and Runner lists. */}
                                <Text
                                    fw={600}
                                    style={{ cursor: "pointer" }}
                                    onClick={() => setDraft(draftFrom(template))}
                                >
                                    {template.name}
                                </Text>
                                {template.isBuiltIn && (
                                    <Badge variant="light" size="sm" leftSection={<IconLock size={11} />}>
                                        {t("Built-in")}
                                    </Badge>
                                )}
                                <Badge variant="outline" size="sm">
                                    {template.permissions.length} {t("permissions")}
                                </Badge>
                                {/* **How far an edit reaches**, on the row rather
                                    than only in the editor: it is the one guard
                                    against a live role that a person can see
                                    before they click anything. */}
                                <Badge
                                    variant="light"
                                    size="sm"
                                    color={template.grants > 0 ? "blue" : "gray"}
                                    data-testid={`role-reach-${template.name}`}
                                >
                                    {t("held by {{count}}", { count: template.grants })}
                                </Badge>
                                {template.activityName && (
                                    <Badge variant="light" size="sm" color="grape">
                                        {template.activityName}
                                    </Badge>
                                )}
                            </Group>
                            {template.description && <Text size="sm" c="dimmed">{template.description}</Text>}
                        </Stack>
                        <Group gap="xs">
                            <Button variant="light" size="compact-sm" onClick={() => setDraft(draftFrom(template))}>
                                {t("Edit")}
                            </Button>
                            <Button
                                variant="light"
                                size="compact-sm"
                                leftSection={<IconCopy size={14} />}
                                onClick={() => setDraft({
                                    ...draftFrom(template),
                                    id: undefined,
                                    name: `${template.name}-copy`,
                                    isBuiltIn: false,
                                })}
                            >
                                {t("Duplicate")}
                            </Button>
                            <Button
                                variant="light"
                                color="red"
                                size="compact-sm"
                                leftSection={<IconTrash size={14} />}
                                // The three shipped roles are what a fresh
                                // installation grants from; removing one leaves
                                // nothing to start from. One anybody still holds
                                // is refused by the Server, with the count.
                                disabled={template.isBuiltIn}
                                onClick={() => remove(template)}
                            >
                                {t("Delete")}
                            </Button>
                        </Group>
                    </Group>
                </Card>
            ))}

            <Modal
                opened={!!draft}
                onClose={() => { setDraft(undefined); setError(undefined); }}
                title={<Title order={4}>{draft?.id ? t("Edit role") : t("New role")}</Title>}
                size="xl"
                centered
            >
                {draft && (
                    <Stack gap="sm">
                        <TextInput
                            label={t("Name")}
                            value={draft.name}
                            onChange={e => setDraft({ ...draft, name: e.currentTarget.value })}
                            required
                        />
                        <Textarea
                            label={t("Description")}
                            value={draft.description}
                            onChange={e => setDraft({ ...draft, description: e.currentTarget.value })}
                            autosize
                            minRows={2}
                        />

                        {/* A permission is meaningful at one scope or both, so the
                            editor has to be told which one it is filling in. */}
                        <SegmentedControl
                            value={scope}
                            onChange={v => setScope(v as "global" | "activity")}
                            data={[
                                { value: "activity", label: t("Activity scope") },
                                { value: "global", label: t("System scope") },
                            ]}
                        />

                        {/* **Said at the moment of the act.** A role that
                            nobody holds is an ordinary edit; one that a hundred
                            grants point at changes a hundred people's access the
                            instant this is saved, and the only honest place to
                            say so is here. */}
                        {(draft.grants ?? 0) > 0 && (
                            <Alert color="yellow" data-testid="role-reach">
                                {t("Saving changes what {{count}} grant(s) carry, at once.",
                                    { count: draft.grants })}
                            </Alert>
                        )}

                        <PermissionSetEditor
                            catalogue={catalogue}
                            value={draft.permissions}
                            onChange={permissions => setDraft({ ...draft, permissions })}
                            grantable={grantable}
                            scope={scope}
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
