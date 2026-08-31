import { Alert, Button, Code, Group, Modal, Stack, Title } from "@mantine/core";
import { IconDownload } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { CreatedCredential } from "../../api/ManagerApi";
import { Handout, openHandout } from "./handout";

/**
 * Credentials, handed over once.
 *
 * The Server keeps a hash and there is nowhere to read these back from, which is
 * the point — so the only chance to save them is here. Three acts produce them:
 * creating an account, resetting a password, and making accounts in bulk. One
 * screen for all three, because "this is your only copy" is a thing that has to
 * be said the same way every time.
 */

/**
 * One field, quoted so that a spreadsheet reads it back as it was written.
 *
 * Two separate problems, and neither is hypothetical here: a login may hold a
 * comma or a quote, which without RFC 4180 quoting shifts every column after it
 * so the file stops mapping logins to passwords — and a login beginning `=`,
 * `+`, `-` or `@` is a **formula** to Excel and LibreOffice, which will evaluate
 * it and can be made to read the password in the cell beside it. Bulk creation
 * takes a manager-typed prefix, and the Server's password alphabet is not
 * constrained by this repository.
 *
 * The apostrophe is the documented spreadsheet escape: it forces the cell to
 * text and is not shown.
 */
const cell = (value: string) => {
    const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
    return `"${guarded.replace(/"/g, '""')}"`;
};

/** The handout a manager prints or pastes into a spreadsheet. */
const credentialsCsv = (credentials: CreatedCredential[]) =>
    [
        `${cell("username")},${cell("password")}`,
        ...credentials.map(c => `${cell(c.username)},${cell(c.password)}`),
    ].join("\r\n");

const downloadCredentials = (created: CreatedCredential[]) => {
    // **The byte order mark goes in the file and not on the screen.** Excel
    // reads a CSV without one in the system code page, which mangles every
    // accented login; the preview on screen is already text in a page that
    // declares its encoding, and a mark there would draw as a stray character.
    const blob = new Blob(["\uFEFF", credentialsCsv(created)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "accounts.csv";
    anchor.click();
    URL.revokeObjectURL(url);
};

export default function CredentialsModal({
    credentials, onClose, handout,
}: {
    /** Undefined closes it: there is nothing to show and nothing to warn about. */
    credentials?: CreatedCredential[];
    onClose: () => void;
    /**
     * Where these credentials are used, printed on every slip. It differs by
     * where they were made — the installation from the user list, the activity
     * from inside one — so it is asked for rather than guessed.
     */
    handout: Handout;
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
                            {/* A sheet of its own, not this window: printing
                                the screen printed a modal on top of an
                                application, navigation and all. */}
                            <Button variant="default" onClick={() => openHandout(credentials, handout)}>
                                {t("Print")}
                            </Button>
                            <Button data-testid="done" onClick={onClose}>{t("Done")}</Button>
                        </Group>
                    </Group>
                </Stack>
            )}
        </Modal>
    );
}
