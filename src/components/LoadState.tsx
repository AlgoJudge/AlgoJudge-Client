import { Alert, Button, Center, Group, Loader } from "@mantine/core";
import { IconAlertTriangle, IconRefresh } from "@tabler/icons-react";
import { ReactNode } from "react";
import { useTranslation } from "react-i18next";

/**
 * What a screen shows while it has no data.
 *
 * Loading and failing are different states, and a screen that only distinguishes
 * "have data" from "do not have data yet" spins for ever the moment a request
 * fails. Every participant screen routes through this so the difference is drawn
 * once rather than eight times, differently.
 */
export interface LoadStateProps {
    /** Whatever the request rejected with, from `useApiEffect`. */
    error: unknown;
    /** True while the data has not arrived and nothing has failed. */
    loading: boolean;
    /** Rendered once neither state applies; usually omitted at a guard clause. */
    children?: ReactNode;
}

const message = (error: unknown): string =>
    error instanceof Error ? error.message : String(error);

export default function LoadState({ error, loading, children }: LoadStateProps) {
    const { t } = useTranslation();

    if (error !== undefined) {
        return (
            <Alert color="red" icon={<IconAlertTriangle size={18} />} title={t("Could not load this page")}>
                <Group justify="space-between" align="center" wrap="wrap">
                    <span>{message(error)}</span>
                    <Button
                        variant="light"
                        size="compact-sm"
                        leftSection={<IconRefresh size={14} />}
                        onClick={() => window.location.reload()}
                    >
                        {t("Try again")}
                    </Button>
                </Group>
            </Alert>
        );
    }

    if (loading) {
        return <Center my="xl"><Loader size="xl" /></Center>;
    }

    return <>{children}</>;
}
