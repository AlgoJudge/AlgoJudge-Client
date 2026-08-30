import { Alert, Badge, Button, Card, Group, Modal, SegmentedControl, Stack, Text, TextInput, Textarea, Title } from "@mantine/core";
import { IconCopy, IconLock, IconPlus, IconTrash } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PermissionDefinition, PermissionTemplate } from "../../../api/ManagerApi";
import LoadState from "../../../components/LoadState";
import PermissionSetEditor from "../../../components/permissions/PermissionSetEditor";
import { useApiCall, useApiEffect } from "../../../provider/apiContext";

interface Draft {
    id?: string;
    name: string;
    description: string;
    permissions: string[];
    isBuiltIn: boolean;
}

const draftFrom = (template: PermissionTemplate): Draft => ({
    id: template.id,
    name: template.name,
    description: template.description ?? "",
    permissions: [...template.permissions],
    isBuiltIn: template.isBuiltIn,
});

export default function PermissionTemplatesPage() {
    const { t } = useTranslation();
    const call = useApiCall();

    const [templates, setTemplates] = useState<PermissionTemplate[] | undefined>(undefined);
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
        setTemplates(await api.managerApi.getPermissionTemplates());

        api.managerApi.eventDispatcher.addEventListener("permissionTemplateChanged", () => setReload(n => n + 1));
    }, [reload]);

    const save = async () => {
        if (!draft) return;
        if (draft.name.trim().length === 0) {
            setError(t("Give the template a name"));
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
                ? api.managerApi.updatePermissionTemplate(draft.id, input)
                : api.managerApi.createPermissionTemplate(input));
            setDraft(undefined);
            setReload(n => n + 1);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setSaving(false);
        }
    };

    const remove = async (template: PermissionTemplate) => {
        try {
            await call(api => api.managerApi.deletePermissionTemplate(template.id));
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
                    <Title>{t("Permission templates")}</Title>
                    {/* A template fills a grant in and is then forgotten. Saying so
                        here prevents the reasonable but wrong assumption that
                        editing one reaches the people who already used it. */}
                    <Text size="sm" c="dimmed">
                        {t("A template fills in a new grant. Editing it later does not change anyone who already used it.")}
                    </Text>
                </Stack>
                <Button
                    leftSection={<IconPlus size={16} />}
                    onClick={() => setDraft({ name: "", description: "", permissions: [], isBuiltIn: false })}
                >
                    {t("New template")}
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
                                // The three shipped templates are what a fresh
                                // installation grants from; removing one leaves
                                // nothing to start from.
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
                title={<Title order={4}>{draft?.id ? t("Edit template") : t("New template")}</Title>}
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
