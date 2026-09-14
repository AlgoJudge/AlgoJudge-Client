import {
    Alert, Badge, Button, Card, Group, Modal, SegmentedControl, Select, Stack, Text, TextInput, Textarea,
    Title, Tooltip,
} from "@mantine/core";
import { IconCopy, IconLock, IconPlus, IconTrash } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ManagedActivitySummary, PermissionDefinition, Role } from "../../../api/ManagerApi";
import LoadState from "../../../components/LoadState";
import PermissionSetEditor from "../../../components/permissions/PermissionSetEditor";
import { optional, useApiCall, useApiEffect } from "../../../provider/apiContext";

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
    /**
     * Which roles this screen is about: the installation's, or one activity's.
     *
     * **`role:manage` is scoped, and this page had no scope.** It listed the
     * installation's roles, asked what the caller holds at system scope, and
     * wrote with no activity id — so for a manager whose rights live in an
     * activity every control on it refused, and the activity's own roles, which
     * the key exists to let them run, were not on the screen at all.
     */
    const [activities, setActivities] = useState<ManagedActivitySummary[]>([]);
    const [activityScope, setActivityScope] = useState<string | undefined>(undefined);
    const [chosen, setChosen] = useState(false);
    const [error, setError] = useState<string | undefined>(undefined);
    const [saving, setSaving] = useState(false);
    const [reload, setReload] = useState(0);

    const loadError = useApiEffect(async (api) => {
        setCatalogue(await api.managerApi.getPermissionCatalogue());

        const managed = await optional(api.managerApi.getManagedActivities(), []);
        setActivities(managed);

        // **Opened where this person can write.** Asked once: somebody who may
        // write the installation's roles came for those, and somebody who may
        // not lands on an activity they run rather than on a scope where every
        // control is dead. The first of them, not the only one — a manager of
        // three courses may write all three, and the picker beside this moves
        // between them.
        let asked = activityScope;
        if (!chosen) {
            const system = await api.managerApi.getMyPermissions();
            asked = system.includes("role:manage") || managed.length === 0
                ? undefined
                : managed[0].id;
            setActivityScope(asked);
            setChosen(true);
        }

        setGrantable(await api.managerApi.getMyPermissions(asked));
        setTemplates(await api.managerApi.getRoles(asked));

        api.managerApi.eventDispatcher.addEventListener("roleChanged", () => setReload(n => n + 1));
    }, [reload, activityScope, chosen]);

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
                // A new role belongs to whatever this screen is scoped to. Left
                // out, every role ever written here was the installation's — and
                // refused to anybody who may only write an activity's.
                activityId: activityScope,
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

    /** What the caller holds **at the scope on screen** — the only honest test. */
    const mayWrite = grantable.includes("role:manage");
    /** A role is edited where it lives, so a global one is read-only here. */
    const writable = (role: Role) => mayWrite && (role.activityId ?? undefined) === activityScope;

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
                <Group gap="sm" wrap="wrap">
                    <Select
                        data={[
                            { value: "", label: t("The installation") },
                            ...activities.map(a => ({ value: a.id, label: a.name })),
                        ]}
                        value={activityScope ?? ""}
                        onChange={(v: string | null) => { setActivityScope(v || undefined); setDraft(undefined); }}
                        allowDeselect={false}
                        searchable
                        w={260}
                        aria-label={t("Whose roles")}
                    />
                    <Tooltip
                        label={t("Editing roles here is not yours to do.")}
                        disabled={mayWrite}
                    >
                        <Button
                            leftSection={<IconPlus size={16} />}
                            disabled={!mayWrite}
                            onClick={() => setDraft({ name: "", description: "", permissions: [], isBuiltIn: false })}
                        >
                            {t("New role")}
                        </Button>
                    </Tooltip>
                </Group>
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
                            {/* A role of a scope this screen is not on is read
                                here and written where it lives. */}
                            <Button
                                variant="light"
                                size="compact-sm"
                                disabled={!writable(template)}
                                onClick={() => setDraft(draftFrom(template))}
                            >
                                {t("Edit")}
                            </Button>
                            <Button
                                variant="light"
                                size="compact-sm"
                                leftSection={<IconCopy size={14} />}
                                disabled={!mayWrite}
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
                                disabled={template.isBuiltIn || !writable(template)}
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
