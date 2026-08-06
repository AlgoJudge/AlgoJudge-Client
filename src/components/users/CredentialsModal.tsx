import { Alert, Button, Code, Group, Modal, Stack, Title } from "@mantine/core";
import { IconDownload } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { CreatedCredential } from "../../api/ManagerApi";

/**
 * Credentials, handed over once.
 *
 * The Server keeps a hash and there is nowhere to read these back from, which is
 * the point — so the only chance to save them is here. Three acts produce them:
 * creating an account, resetting a password, and making accounts in bulk. One
 * screen for all three, because "this is your only copy" is a thing that has to
 * be said the same way every time.
 */

/** The handout a manager prints or pastes into a spreadsheet. */
const credentialsCsv = (credentials: CreatedCredential[]) =>
    ["username,password", ...credentials.map(c => `${c.username},${c.password}`)].join("\n");

const downloadCredentials = (created: CreatedCredential[]) => {
    const blob = new Blob([credentialsCsv(created)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "accounts.csv";
    anchor.click();
    URL.revokeObjectURL(url);
};

export default function CredentialsModal({
    credentials, onClose,
}: {
    /** Undefined closes it: there is nothing to show and nothing to warn about. */
    credentials?: CreatedCredential[];
    onClose: () => void;
}) {
    const { t } = useTranslation();
    return (
        <Modal
            opened={credentials !== undefined}
            onClose={onClose}
            title={<Title order={4}>{t("Credentials")}</Title>}
            size="lg"
            centered
        >
            {credentials && (
                <Stack gap="sm">
                    <Alert color="orange">
                        {t("This is the only time these passwords can be read. Save or print them now.")}
                    </Alert>
                    <Code block style={{ maxHeight: 320, overflow: "auto" }}>
                        {credentialsCsv(credentials)}
                    </Code>
                    <Group justify="space-between">
                        <Button
                            variant="light"
                            leftSection={<IconDownload size={16} />}
                            onClick={() => downloadCredentials(credentials)}
                        >
                            {t("Download CSV")}
                        </Button>
                        <Group gap="xs">
                            <Button variant="default" onClick={() => window.print()}>{t("Print")}</Button>
                            <Button onClick={onClose}>{t("Done")}</Button>
                        </Group>
                    </Group>
                </Stack>
            )}
        </Modal>
    );
}
