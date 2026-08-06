import { Button, Group, Modal, NumberInput, Select, Stack, TextInput, Title } from "@mantine/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CreatedCredential, ManagedActivitySummary, PermissionTemplate } from "../../api/ManagerApi";
import { useApiCall } from "../../provider/apiContext";
import ZonedDateTimeInput from "../time/ZonedDateTimeInput";
import CredentialsModal from "./CredentialsModal";

/**
 * Accounts for one event, made from a prefix and a count, and enrolled as they
 * are created.
 *
 * Two screens open it: the user list, where the activity is one of the fields,
 * and an activity's own participants panel, where it is already known. The
 * passwords come back **once** — the Server keeps a hash and there is nowhere to
 * read them from afterwards — so handing them over is part of the same screen
 * rather than something to go and find.
 */

export interface TemporaryAccountsModalProps {
    opened: boolean;
    onClose: () => void;
    /** Offered as a field where the activity is a choice; absent where it is fixed. */
    activities?: ManagedActivitySummary[];
    /** Fixed where the modal was opened from inside one activity. */
    activityId?: string;
    templates: PermissionTemplate[];
    /** Runs the call and surfaces whatever it failed with. Owned by the screen. */
    run: (operation: () => Promise<unknown>) => Promise<void>;
    busy: boolean;
    /** So the screen behind can refresh what it lists. */
    onCreated?: () => void;
}

export default function TemporaryAccountsModal({
    opened, onClose, activities, activityId, templates, run, busy, onCreated,
}: TemporaryAccountsModalProps) {
    const { t } = useTranslation();
    const call = useApiCall();

    const [prefix, setPrefix] = useState("");
    const [count, setCount] = useState(20);
    const [expiresAt, setExpiresAt] = useState<string | undefined>(undefined);
    const [chosenActivity, setChosenActivity] = useState("");
    const [template, setTemplate] = useState("");
    const [credentials, setCredentials] = useState<CreatedCredential[] | undefined>(undefined);

    // Fixed from the outside where the screen already knows it, chosen in the
    // field where it does not.
    const intoActivity = activityId ?? (chosenActivity || undefined);

    const create = () => void run(async () => {
        const chosen = templates.find(x => x.name === template);
        const created = await call(api => api.managerApi.createTemporaryUsers({
            prefix: prefix.trim(),
            count,
            expiresAt,
            activityId: intoActivity,
            permissions: chosen?.permissions,
        }));
        setPrefix("");
        onClose();
        setCredentials(created);
        onCreated?.();
    });

    return (
        <>
            <Modal
                opened={opened}
                onClose={onClose}
                title={<Title order={4}>{t("Temporary accounts")}</Title>}
                centered
            >
                <Stack gap="sm">
                    <Group grow>
                        <TextInput
                            label={t("Prefix")}
                            description={t("contest gives contest-001, contest-002, …")}
                            value={prefix}
                            onChange={e => setPrefix(e.currentTarget.value)}
                            required
                        />
                        <NumberInput
                            label={t("How many")}
                            min={1}
                            max={500}
                            value={count}
                            onChange={v => setCount(typeof v === "number" ? v : 1)}
                        />
                    </Group>
                    <ZonedDateTimeInput
                        label={t("Expires")}
                        description={t("After this they stop signing in. Empty means never.")}
                        value={expiresAt}
                        timeZone="Europe/Warsaw"
                        onChange={setExpiresAt}
                    />
                    {activities && (
                        <Select
                            label={t("Enrol into")}
                            description={t("Accounts with nowhere to submit are of no use")}
                            data={activities.map(a => ({ value: a.id, label: a.name }))}
                            value={chosenActivity || null}
                            onChange={v => setChosenActivity(v ?? "")}
                            clearable
                            searchable
                        />
                    )}
                    <Select
                        label={t("With the permissions of")}
                        data={templates.map(x => ({ value: x.name, label: x.name }))}
                        value={template || null}
                        onChange={v => setTemplate(v ?? "")}
                        disabled={intoActivity === undefined}
                        clearable
                    />
                    <Group justify="space-between">
                        <Button variant="default" onClick={onClose}>{t("Back")}</Button>
                        <Button loading={busy} disabled={!prefix.trim()} onClick={create}>
                            {t("Create")}
                        </Button>
                    </Group>
                </Stack>
            </Modal>

            <CredentialsModal credentials={credentials} onClose={() => setCredentials(undefined)} />
        </>
    );
}
