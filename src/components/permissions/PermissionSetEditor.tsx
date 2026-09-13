import { Alert, Badge, Card, Checkbox, Group, Stack, Text, Tooltip } from "@mantine/core";
import { IconLock } from "@tabler/icons-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { PermissionDefinition } from "../../api/ManagerApi";

/**
 * Picks a set of permissions from the catalogue the Server publishes.
 *
 * Two rules are visible here rather than only enforced on the way in:
 *
 * - **An entry the editor cannot grant is shown and disabled**, not hidden.
 *   Hiding it reads as a missing feature; showing it disabled says "you do not
 *   have this yourself", which is the actual reason.
 * - **`system:administrator` swallows the rest.** It bypasses every check, so
 *   ticking anything beside it is theatre; the editor says so and stops
 *   pretending the other boxes mean something.
 * - **What a role contributes is shown ticked and locked.** A grant carries its
 *   role's permissions and its own; drawing only the second half would say
 *   somebody holds nothing when they hold everything a manager does, and
 *   drawing them alike would invite unticking one and wondering why it came
 *   back.
 */
export interface PermissionSetEditorProps {
    catalogue: PermissionDefinition[];
    value: string[];
    onChange: (value: string[]) => void;
    /** What the signed-in user holds. Anything outside it cannot be granted on. */
    grantable: string[];
    /**
     * What the linked role contributes. Drawn ticked and locked, and not part of
     * `value` — editing here writes the grant's own entries only.
     */
    inherited?: string[];
    /** Names the role in the lock's tooltip, so a row says where it came from. */
    inheritedFrom?: string;
    /** Which scope is being edited; entries meaningless there are hidden. */
    scope: "global" | "activity";
    readOnly?: boolean;
}

const ADMINISTRATOR = "system:administrator";

export default function PermissionSetEditor({
    catalogue, value, onChange, grantable, scope, readOnly, inherited, inheritedFrom,
}: PermissionSetEditorProps) {
    const { t } = useTranslation();

    const fromRole = useMemo(() => new Set(inherited ?? []), [inherited]);
    const isAdministrator = value.includes(ADMINISTRATOR) || fromRole.has(ADMINISTRATOR);
    const grantsEverything = grantable.includes(ADMINISTRATOR);

    const groups = useMemo(() => {
        const applicable = catalogue.filter(d => d.scope === "both" || d.scope === scope);
        const byGroup = new Map<string, PermissionDefinition[]>();
        for (const definition of applicable) {
            const list = byGroup.get(definition.group) ?? [];
            list.push(definition);
            byGroup.set(definition.group, list);
        }
        return [...byGroup.entries()];
    }, [catalogue, scope]);

    const toggle = (key: string, checked: boolean) => {
        onChange(checked ? [...value, key] : value.filter(p => p !== key));
    };

    return (
        <Stack gap="sm">
            {isAdministrator && (
                <Alert color="orange" icon={<IconLock size={18} />} title={t("Administrator")}>
                    {t("This set bypasses every check. The other entries have no effect while it is present.")}
                </Alert>
            )}

            {groups.map(([group, definitions]) => (
                <Card key={group} withBorder radius="sm" p="sm">
                    <Group justify="space-between" mb="xs">
                        <Text fw={600}>{t(`permissionGroup.${group}`)}</Text>
                        <Badge variant="light" size="sm">
                            {definitions.filter(d => value.includes(d.key) || fromRole.has(d.key)).length}
                            {" / "}
                            {definitions.length}
                        </Badge>
                    </Group>
                    <Stack gap={6}>
                        {definitions.map(definition => {
                            const canGrant = grantsEverything || grantable.includes(definition.key);
                            const held = fromRole.has(definition.key);
                            const checked = held || value.includes(definition.key);
                            const disabled = readOnly || held || !canGrant
                                || (isAdministrator && definition.key !== ADMINISTRATOR);
                            const checkbox = (
                                <Checkbox
                                    checked={checked}
                                    disabled={disabled}
                                    onChange={e => toggle(definition.key, e.currentTarget.checked)}
                                    label={
                                        <Group gap="xs" wrap="nowrap">
                                            <Text size="sm">{t(`permission.${definition.key}`)}</Text>
                                            <Text size="xs" c="dimmed" ff="monospace">{definition.key}</Text>
                                            {held && (
                                                <Badge variant="light" size="xs" color="gray">
                                                    {inheritedFrom ?? t("From the role")}
                                                </Badge>
                                            )}
                                        </Group>
                                    }
                                />
                            );
                            // A disabled box says nothing about why. The tooltip is
                            // the only place the reason can live.
                            if (held) {
                                return (
                                    <Tooltip key={definition.key} label={t("This comes from the role. Change the role to change it.")}>
                                        <div>{checkbox}</div>
                                    </Tooltip>
                                );
                            }
                            return canGrant || readOnly
                                ? <div key={definition.key}>{checkbox}</div>
                                : (
                                    <Tooltip key={definition.key} label={t("You cannot grant a permission you do not hold")}>
                                        <div>{checkbox}</div>
                                    </Tooltip>
                                );
                        })}
                    </Stack>
                </Card>
            ))}
        </Stack>
    );
}
