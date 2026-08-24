import {
    Alert, Badge, Button, Group, List, Loader, Modal, Select, Stack, Text,
} from "@mantine/core";
import { IconAlertTriangle, IconArrowRight } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ManagedUser, MergePreview } from "../../api/ManagerApi";
import { useApiCall } from "../../provider/apiContext";
import { displayName } from "../../api/displayName";

/**
 * Carrying one account's work onto another.
 *
 * **This screen is the guard, which is why it is a screen at all.** A merge is a
 * manager asserting that two accounts are one person, and nothing but their own
 * care stands behind that assertion — the Server cannot check it. So nothing
 * moves until the preview has said whose work, how much of it, and onto whom,
 * and the manager has read it back.
 *
 * The counts come from the Server rather than being worked out here: they are
 * what a merge would actually move, and a number this screen computed would be
 * a second opinion about that.
 */
export default function MergeAccountModal({ source, candidates, onClose, onMerged }: {
    /** The account being emptied. Undefined closes the dialog. */
    source?: ManagedUser;
    /** Everyone it could be merged into — the same list the screen already holds. */
    candidates: ManagedUser[];
    onClose: () => void;
    onMerged: () => void;
}) {
    const { t } = useTranslation();
    const call = useApiCall();

    const [targetId, setTargetId] = useState<string | null>(null);
    const [preview, setPreview] = useState<MergePreview | undefined>(undefined);
    const [loading, setLoading] = useState(false);
    const [busy, setBusy] = useState(false);
    const [failed, setFailed] = useState<string | undefined>(undefined);

    // A new source is a new question; nothing about the last one should survive
    // into it, least of all a target somebody chose for a different account.
    useEffect(() => {
        setTargetId(null);
        setPreview(undefined);
        setFailed(undefined);
    }, [source?.id]);

    useEffect(() => {
        if (!source || !targetId) {
            setPreview(undefined);
            return;
        }
        let current = true;
        setLoading(true);
        setFailed(undefined);
        call(api => api.managerApi.previewMerge(source.id, targetId))
            .then(answer => { if (current) setPreview(answer); })
            .catch(e => { if (current) setFailed(e instanceof Error ? e.message : String(e)); })
            .finally(() => { if (current) setLoading(false); });
        return () => { current = false; };
    }, [source, targetId, call]);

    const merge = async () => {
        if (!source || !targetId) return;
        setBusy(true);
        setFailed(undefined);
        try {
            await call(api => api.managerApi.mergeAccount(source.id, targetId));
            onMerged();
            onClose();
        } catch (e) {
            setFailed(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    };

    const blocked = (preview?.blockers.length ?? 0) > 0;

    return (
        <Modal
            opened={source !== undefined}
            onClose={onClose}
            title={t("Move this account's work to another")}
            size="lg"
        >
            {source && (
                <Stack gap="md">
                    <Text size="sm" c="dimmed">
                        {t("The submissions, points and questions move. The account this leaves stays blocked for a day, so a mistake can be undone, and is emptied after that.")}
                    </Text>

                    <Select
                        label={t("Move to")}
                        description={t("The account that keeps everything.")}
                        placeholder={t("Choose an account")}
                        searchable
                        data={candidates
                            .filter(candidate => candidate.id !== source.id)
                            .map(candidate => ({
                                value: candidate.id,
                                label: `${displayName(candidate)} (${candidate.username})`,
                            }))}
                        value={targetId}
                        onChange={setTargetId}
                    />

                    {loading && <Group gap="xs"><Loader size="sm" /><Text size="sm">{t("Loading")}</Text></Group>}

                    {preview && (
                        <>
                            {/* **Both names, side by side.** A manager handing one
                                person's work to another has to see whose, and a
                                login alone is what somebody misreads. */}
                            <Group gap="sm" wrap="nowrap" align="center">
                                <Stack gap={0}>
                                    <Text fw={600}>{preview.sourceName}</Text>
                                    <Text size="sm" c="dimmed">{preview.sourceLogin}</Text>
                                </Stack>
                                <IconArrowRight size={20} />
                                <Stack gap={0}>
                                    <Text fw={600}>{preview.targetName}</Text>
                                    <Text size="sm" c="dimmed">{preview.targetLogin}</Text>
                                </Stack>
                                {preview.sourceIsTemporary && (
                                    <Badge color="grape" variant="light">{t("Temporary")}</Badge>
                                )}
                            </Group>

                            <Stack gap={4}>
                                <Text size="sm">
                                    {t("Submissions")}: <b>{preview.submissions}</b>
                                </Text>
                                <Text size="sm">
                                    {t("Questions")}: <b>{preview.questions}</b>
                                </Text>
                                <Text size="sm">
                                    {t("Activities")}: <b>{preview.activities}</b>
                                </Text>
                                {preview.activityNames.length > 0 && (
                                    <List size="sm" withPadding>
                                        {preview.activityNames.map(name => (
                                            <List.Item key={name}>{name}</List.Item>
                                        ))}
                                    </List>
                                )}
                            </Stack>

                            {blocked && (
                                <Alert
                                    color="red"
                                    icon={<IconAlertTriangle size={18} />}
                                    title={t("This account cannot be merged")}
                                >
                                    <Text size="sm">
                                        {t("It holds permissions over the whole installation. Those are not work and do not move, so the merge is refused rather than handing them over.")}
                                    </Text>
                                </Alert>
                            )}
                        </>
                    )}

                    {failed && <Alert color="red">{failed}</Alert>}

                    <Group justify="flex-end">
                        <Button variant="default" onClick={onClose}>{t("Cancel")}</Button>
                        <Button
                            color="red"
                            loading={busy}
                            disabled={!preview || blocked}
                            onClick={merge}
                        >
                            {t("Move the work")}
                        </Button>
                    </Group>
                </Stack>
            )}
        </Modal>
    );
}
