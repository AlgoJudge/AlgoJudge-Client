import { Button, Tooltip } from "@mantine/core";
import { IconPackageExport } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ScopedApi } from "../../api/ScopedApi";
import { BundleContents, BundleTooLarge, WARN_BYTES, weigh, writeBundle } from "../../exchange/bundle";
import { useApiCall } from "../../provider/apiContext";

/**
 * Writing an activity, a round or a problem out to a file.
 *
 * **The bundle is assembled in the browser**, which is what keeps the Server
 * clear of a problem type's dialect and the importer on the ordinary manager
 * API. The cost is memory, and it is stated rather than discovered: over 64 MB
 * the manager is told, over 256 MB the export is refused and names the problems
 * to blame.
 */

interface ExportButtonProps {
    /** Reads it out of this installation. Runs only when the button is pressed. */
    collect: (api: ScopedApi) => Promise<BundleContents>;
    /** Without `.zip`; the extension is added here so every export agrees. */
    filename: string;
    label: string;
    /** An icon-only button in a row of them, rather than a labelled one. */
    compact?: boolean;
    onError: (message: string) => void;
    onWarning?: (message: string) => void;
}

export default function ExportButton({
    collect, filename, label, compact, onError, onWarning,
}: ExportButtonProps) {
    const { t } = useTranslation();
    const call = useApiCall();
    const [busy, setBusy] = useState(false);

    const run = async () => {
        setBusy(true);
        onError("");
        try {
            const contents = await call(collect);
            const bytes = weigh(contents);
            if (bytes > WARN_BYTES) {
                onWarning?.(t("This is a large export ({{mb}} MB). It is assembled in your browser, so give it a moment.",
                    { mb: Math.round(bytes / 1024 / 1024) }));
            }

            const blob = await writeBundle(contents);

            // Revoked on the next tick rather than immediately: the click has to
            // start before the address stops meaning anything.
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `${filename}.zip`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 0);
        } catch (e) {
            onError(e instanceof BundleTooLarge
                // Naming the heaviest is the difference between a refusal a
                // manager can act on and one that leaves them bisecting a
                // contest by hand.
                ? t("This export is {{mb}} MB, over the limit. The largest are: {{largest}}. Export one round at a time.",
                    { mb: Math.round(e.bytes / 1024 / 1024), largest: e.largest.join(", ") })
                : e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    };

    if (compact) {
        return (
            <Tooltip label={label}>
                <Button variant="subtle" size="compact-sm" aria-label={label} loading={busy} onClick={run}>
                    <IconPackageExport size={14} />
                </Button>
            </Tooltip>
        );
    }

    return (
        <Button
            variant="default"
            leftSection={<IconPackageExport size={16} />}
            loading={busy}
            onClick={run}
        >
            {label}
        </Button>
    );
}
