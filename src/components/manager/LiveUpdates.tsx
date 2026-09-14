import { Badge, Button, Group, Stack, Tooltip } from "@mantine/core";
import { IconPlayerPause, IconPlayerPlay, IconRefresh } from "@tabler/icons-react";
import { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ManagerEventType } from "../../api/ManagerApi";
import { formatInZone, viewerZone } from "../time/format";
import { useLiveUpdates } from "../../provider/refreshContext";

/**
 * What each withheld kind is called, so the tooltip can say what is waiting.
 *
 * A `switch` over the closed union rather than a lookup table: it is exhaustive,
 * so adding an event type without naming it here fails to build, and every
 * string is a literal argument to `t` — which is what `check:i18n` reads. A
 * table of keys handed to `t(variable)` would type-check, translate at run time,
 * and be invisible to the check that keeps the two language files honest.
 */
const nameOf = (kind: ManagerEventType, t: (key: string) => string): string => {
    switch (kind) {
        case "roleChanged": return t("roles");
        case "grantChanged": return t("people");
        case "problemChanged": return t("problems");
        case "activityChanged": return t("activities");
        case "managerSeriesChanged": return t("rounds");
        case "submissionChanged": return t("submissions");
        case "printoutChanged": return t("printouts");
        case "questionChanged": return t("questions");
        case "userChanged": return t("accounts");
        case "runnerChanged": return t("runners");
        case "instanceChanged": return t("the installation");
    }
};

/**
 * The panel's own live-update control, above every manager screen.
 *
 * **Never "Pause" and "Resume".** Those words already belong to a series, four
 * clicks away on the same screen, and that action stops a contest: it shuts a
 * round to submissions and stands its clock still. Two controls a screen apart
 * sharing one verb is a mistake somebody makes once, at the worst moment.
 *
 * It does not live in the application header either. That row is `wrap="nowrap"`
 * and carries a measured prohibition on growing — the account button fell to a
 * second row at 449px on a 360px screen — so the bar is drawn by the manager
 * routes instead, which is one wrapper in `App.tsx` rather than eighteen files.
 */
export default function LiveUpdates({ children }: { children: ReactNode }) {
    const { t } = useTranslation();
    const { live, pending, since, kinds, setLive, refreshNow } = useLiveUpdates();

    const waiting = kinds.map(kind => nameOf(kind, t)).join(", ");

    return (
        <Stack gap="md">
            <Group justify="flex-end" gap="sm" wrap="wrap" data-testid="live-updates">
                {/* **A dot, and never a number.** One rejudge is three frames
                    for one submission and some frames concern rows that are not
                    on this screen, so any count would be read as an amount of
                    work and would not be one. What is honest is that something
                    moved, when, and of what kind. */}
                {pending && (
                    <Tooltip
                        multiline
                        w={260}
                        label={since === undefined
                            ? t("Something changed while updates were off.")
                            : `${t("Changed since")} ${formatInZone(new Date(since).toISOString(), viewerZone(), "time")}: ${waiting}`}
                    >
                        <Badge color="orange" variant="light" data-testid="live-pending">
                            {t("Changes waiting")}
                        </Badge>
                    </Tooltip>
                )}
                {/* **A button, not a `Switch`.** Mantine renders a switch as
                    an `<input type="checkbox">`, and this bar sits at the top of
                    every panel screen inside `app-main` — so it would become the
                    *first* input on the page. Several browser checks address a
                    field as "the first input in the main area", and one of them
                    duly typed a hostname into this control instead. The state is
                    in the label and in `aria-pressed`, which is what a screen
                    reader needs anyway. */}
                <Button
                    data-testid="live-toggle"
                    aria-pressed={live}
                    variant={live ? "light" : "filled"}
                    color={live ? "teal" : "orange"}
                    leftSection={live ? <IconPlayerPlay size={16} /> : <IconPlayerPause size={16} />}
                    onClick={() => setLive(!live)}
                >
                    {live ? t("Updates on") : t("Updates off")}
                </Button>
                <Button
                    variant="default"
                    leftSection={<IconRefresh size={16} />}
                    onClick={refreshNow}
                    data-testid="live-refresh"
                >
                    {t("Refresh")}
                </Button>
            </Group>
            {children}
        </Stack>
    );
}
