import { Button, Group, Modal, NumberInput, Select, Stack, TextInput, Title } from "@mantine/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CreatedCredential, ManagedActivitySummary, Role } from "../../api/ManagerApi";
import { useApiCall } from "../../provider/apiContext";
import ZonedDateTimeInput from "../time/ZonedDateTimeInput";
import CredentialsModal from "./CredentialsModal";
import { Handout } from "./handout";
import { viewerZone } from "../time/format";

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
    templates: Role[];
    /** Runs the call and surfaces whatever it failed with. Owned by the screen. */
    run: (operation: () => Promise<unknown>) => Promise<void>;
    busy: boolean;
    /** So the screen behind can refresh what it lists. */
    onCreated?: () => void;
    /** Where the accounts are used, for the printed slips. */
    handout: Handout;
}

export default function TemporaryAccountsModal({
    opened, onClose, activities, activityId, templates, run, busy, onCreated, handout,
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
        // By id: a role picked by name follows a rename to whatever role is
        // called that afterwards, which is not the one somebody chose.
        const chosen = templates.find(x => x.id === template);
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
                        // **The reader's zone, not an activity's.** An account's
                        // expiry belongs to no contest, so there is no clock to
                        // mean but the one the person typing is reading. It was
                        // a hard-coded Europe/Warsaw, which gave anybody
                        // elsewhere an hour they did not ask for.
                        timeZone={viewerZone()}
                        onChange={setExpiresAt}
                    />
                    {activities && (
                        <Select
                            label={t("Enroll into")}
                            description={t("Accounts with nowhere to submit are of no use")}
                            data={activities.map(a => ({ value: a.id, label: a.name }))}
                            value={chosenActivity || null}
                            onChange={v => setChosenActivity(v ?? "")}
                            clearable
                            searchable
                        />
                    )}
                    {/* **Empty is the ordinary answer**, and it is the one that
                        links: the accounts get the roles the activity enrolls
                        participants into, and every later correction to them.
                        Naming a role here copies that set in instead, which is
                        what somebody wants who is making twenty accounts that
                        are not participants. */}
                    <Select
                        label={t("Instead of the activity's role, exactly this set")}
                        description={t("Leave empty to hand out the roles this activity enrolls into.")}
                        data={templates.map(x => ({ value: x.id, label: x.name }))}
                        value={template || null}
                        onChange={v => setTemplate(v ?? "")}
                        disabled={intoActivity === undefined}
                        clearable
                    />
                    <Group justify="space-between">
                        <Button data-testid="back" variant="default" onClick={onClose}>{t("Back")}</Button>
                        <Button data-testid="create" loading={busy} disabled={!prefix.trim()} onClick={create}>
                            {t("Create")}
                        </Button>
                    </Group>
                </Stack>
            </Modal>

            <CredentialsModal
                credentials={credentials}
                onClose={() => setCredentials(undefined)}
                handout={handout}
            />
        </>
    );
}
