import { Alert, Button, Group } from "@mantine/core";
import { IconCurrentLocation, IconSnowflake } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import ActivityTime from "../../components/time/ActivityTime";

/** Pieces every ranking shares, whatever shape its table takes. */

/**
 * Says that the board is frozen, and until when.
 *
 * Withholding the rows is the Server's job — the ranking is assembled in the
 * Client, so anything sent has already been disclosed. This only explains why
 * the numbers stopped moving, which is the difference between a frozen board and
 * one a participant reads as live.
 */
export const FreezeBanner = ({ frozen, revealAt, timeZone }: { frozen: boolean; revealAt?: string; timeZone: string }) => {
    const { t } = useTranslation();
    if (!frozen) return null;
    return (
        <Alert color="blue" icon={<IconSnowflake size={18} />} title={t("Ranking is frozen")}>
            {revealAt
                ? <>{t("Results are hidden until")} <ActivityTime value={revealAt} timeZone={timeZone} /></>
                : t("Results are hidden until the organisers unfreeze the ranking")}
        </Alert>
    );
};

export const FindMeButton = ({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) => {
    const { t } = useTranslation();
    return (
        <Group justify="flex-end">
            <Button
                variant="light"
                leftSection={<IconCurrentLocation size={16} />}
                onClick={onClick}
                disabled={disabled}
            >
                {t("Find me")}
            </Button>
        </Group>
    );
};
