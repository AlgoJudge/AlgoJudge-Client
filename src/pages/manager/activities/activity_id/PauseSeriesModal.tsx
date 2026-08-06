import { Alert, Button, Checkbox, Group, Modal, Stack, Text, Title } from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ManagedSeries } from "../../../../api/ManagerApi";

/**
 * Stopping a round, and starting it again.
 *
 * Two different questions, so two different screens behind one modal. Neither
 * has a product-wide answer: whether a pause takes the statements away, and
 * whether the interruption is given back, are the manager's to decide in the
 * minute it happens. Both carry the answer a contest usually wants.
 */
export interface PauseIntent {
    series: ManagedSeries;
    resuming: boolean;
}

export interface PauseSeriesModalProps {
    intent?: PauseIntent;
    busy?: boolean;
    onClose: () => void;
    onPause: (seriesId: string, hideProblems: boolean) => void;
    onResume: (seriesId: string, extendEnd: boolean) => void;
}

/** How long the pause has lasted, in whole minutes, rounded up. */
const pausedMinutes = (pausedAt: string): number =>
    Math.max(1, Math.ceil((Date.now() - Date.parse(pausedAt)) / 60_000));

export default function PauseSeriesModal({
    intent, busy, onClose, onPause, onResume,
}: PauseSeriesModalProps) {
    const { t } = useTranslation();
    // Off by default: taking a problem off the screen of somebody in the middle
    // of it is violent, and they have read it already.
    const [hideProblems, setHideProblems] = useState(false);
    // On by default: an outage taking ten minutes off a contest is the thing
    // pausing exists to prevent.
    const [extendEnd, setExtendEnd] = useState(true);

    // Reset between openings, so an answer given about one round is not still
    // ticked when the next one is stopped.
    useEffect(() => {
        if (intent) {
            setHideProblems(false);
            setExtendEnd(true);
        }
    }, [intent]);

    if (!intent) return null;
    const { series, resuming } = intent;
    const minutes = series.pausedAt ? pausedMinutes(series.pausedAt) : 0;

    return (
        <Modal
            opened
            onClose={onClose}
            title={<Title order={4}>{resuming ? t("Resume the series") : t("Pause the series")}</Title>}
            centered
        >
            <Stack gap="sm">
                <Text size="sm">{series.name}</Text>

                {resuming ? (
                    <>
                        <Text size="sm" c="dimmed">
                            {t("The pause has lasted")} {minutes} {t("minutes.")}
                        </Text>
                        <Checkbox
                            checked={extendEnd}
                            onChange={e => setExtendEnd(e.currentTarget.checked)}
                            label={t("Give the time back: move the end by the length of the pause")}
                            description={t("Unticked, every date is left exactly as it is.")}
                        />
                        <Group justify="space-between">
                            <Button variant="default" onClick={onClose}>{t("Back")}</Button>
                            <Button
                                color="teal"
                                loading={busy}
                                onClick={() => onResume(series.id, extendEnd)}
                            >
                                {t("Resume")}
                            </Button>
                        </Group>
                    </>
                ) : (
                    <>
                        <Alert color="orange" icon={<IconAlertTriangle size={18} />}>
                            {t("Nothing is accepted for this series while it is paused, and its countdown stands still.")}
                        </Alert>
                        <Checkbox
                            checked={hideProblems}
                            onChange={e => setHideProblems(e.currentTarget.checked)}
                            label={t("Take the statements away as well")}
                            description={t("For a leak or a mistake in a statement. Otherwise they stay on screen.")}
                        />
                        <Group justify="space-between">
                            <Button variant="default" onClick={onClose}>{t("Back")}</Button>
                            <Button
                                color="orange"
                                loading={busy}
                                onClick={() => onPause(series.id, hideProblems)}
                            >
                                {t("Pause")}
                            </Button>
                        </Group>
                    </>
                )}
            </Stack>
        </Modal>
    );
}
