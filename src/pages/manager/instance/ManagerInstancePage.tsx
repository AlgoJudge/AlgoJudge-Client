import {
    Alert, Button, Card, Center, FileButton, Group, Image, PasswordInput, Stack, Switch, Tabs,
    Text, TextInput, Title, Tooltip,
} from "@mantine/core";
import { IconAlertTriangle, IconTrash, IconUpload } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { InstanceDocumentKind, InstanceDocumentRef } from "../../../api/CoreApi";
import { AccessKey, InstanceSettingsInput } from "../../../api/ManagerApi";
import { DOCUMENT_KINDS, LOGO_ATTACHMENT } from "../../../api/instanceDocuments";
import SharedDocumentsPanel from "../../../components/content/DocumentsPanel";
import { useApiCall, useApiEffect } from "../../../provider/apiContext";
import { useInstance } from "../../../provider/instanceContext";
import { sha256 } from "../../../utils/sha256";

/**
 * What the installation says about itself: its name, its mark, and the
 * documents it publishes.
 *
 * Stage 9 of the manager panel, and the screen that makes the rest of the
 * instance contract reachable — until it existed, the templates that ship with
 * the software were the only answer an installation ever had, and
 * `logoTranslations` was a field nobody could set.
 *
 * A document is published exactly as a problem version's statement is: the text
 * goes up through the File API and what is published is a list of ids. Nothing
 * here sends a document's text in the request.
 */

const settingsOf = (instance: {
    name?: string;
    localRegistrationEnabled: boolean;
    requireEmail: boolean;
    requireConfirmedEmail: boolean;
    showLogo: boolean;
    showLocalSignIn: boolean;
    accountDeletionEnabled: boolean;
    externalJudgingEnabled: boolean;
}): InstanceSettingsInput => ({
    name: instance.name,
    localRegistrationEnabled: instance.localRegistrationEnabled,
    requireEmail: instance.requireEmail,
    requireConfirmedEmail: instance.requireConfirmedEmail,
    showLogo: instance.showLogo,
    showLocalSignIn: instance.showLocalSignIn,
    accountDeletionEnabled: instance.accountDeletionEnabled,
    externalJudgingEnabled: instance.externalJudgingEnabled,
});

/** The file a language's text is stored under: `privacy.md`, `privacy-en.md`. */
const documentFileName = (kind: InstanceDocumentKind, language: string | undefined) =>
    language ? `${kind}-${language}.md` : `${kind}.md`;

export default function ManagerInstancePage() {
    const { t } = useTranslation();
    const call = useApiCall();
    const { instance, logoUrl } = useInstance();

    const [settings, setSettings] = useState<InstanceSettingsInput>(() => settingsOf(instance));
    const [error, setError] = useState<string | undefined>(undefined);
    const [busy, setBusy] = useState(false);

    // The answer is held by the provider and replaced whenever anybody changes
    // it — this screen included, through the event every write announces. The
    // draft follows it rather than drifting from it.
    useEffect(() => { setSettings(settingsOf(instance)); }, [instance]);

    const run = async (operation: () => Promise<unknown>) => {
        setError(undefined);
        setBusy(true);
        try {
            await operation();
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    };

    /** Uploads bytes and answers with the id the instance will reference. */
    const store = async (bytes: Blob, name: string) => {
        const checksum = await sha256(bytes);
        return await call(api => api.fileApi.upload(bytes, name, checksum));
    };

    return (
        <Stack gap="md">
            <Stack gap={2}>
                <Title order={2}>{t("Instance")}</Title>
                <Text size="sm" c="dimmed">
                    {t("What this installation is called, the mark it shows, and the documents it publishes.")}
                </Text>
            </Stack>

            {error && <Alert color="red" icon={<IconAlertTriangle size={18} />}>{error}</Alert>}

            <Tabs defaultValue="settings">
                <Tabs.List>
                    <Tabs.Tab value="settings">{t("Settings")}</Tabs.Tab>
                    <Tabs.Tab value="mark">{t("Mark")}</Tabs.Tab>
                    <Tabs.Tab value="documents">{t("Documents")}</Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value="settings" pt="md">
                    <Card withBorder radius="sm">
                        <Stack gap="sm">
                            <TextInput
                                label={t("Name")}
                                description={t("Shown beside the product's mark and in the window title. Leave it empty and only AlgoJudge is shown.")}
                                value={settings.name ?? ""}
                                onChange={e => setSettings({ ...settings, name: e.currentTarget.value })}
                            />
                            <Switch
                                label={t("Accept local sign-ups")}
                                description={t("Off by default: accounts are created by an organiser or arrive by SSO.")}
                                checked={settings.localRegistrationEnabled}
                                onChange={e => setSettings({ ...settings, localRegistrationEnabled: e.currentTarget.checked })}
                            />
                            <Switch
                                label={t("Require an address")}
                                checked={settings.requireEmail}
                                onChange={e => setSettings({ ...settings, requireEmail: e.currentTarget.checked })}
                            />
                            <Switch
                                label={t("Require a confirmed address before signing in")}
                                checked={settings.requireConfirmedEmail}
                                onChange={e => setSettings({ ...settings, requireConfirmedEmail: e.currentTarget.checked })}
                            />
                            <Switch
                                label={t("Show the mark in the application")}
                                checked={settings.showLogo}
                                onChange={e => setSettings({ ...settings, showLogo: e.currentTarget.checked })}
                            />
                            <Switch
                                label={t("Show the password form on the sign-in screen")}
                                description={t("Off leaves only the provider buttons. It hides the form and nothing more: the password endpoint stays open, administrators and temporary accounts still need it, and ?admin=true brings the form back for them.")}
                                checked={settings.showLocalSignIn}
                                onChange={e => setSettings({ ...settings, showLocalSignIn: e.currentTarget.checked })}
                            />
                            <Switch
                                label={t("Let people remove their own account")}
                                description={t("On by default. It is a data-protection right before it is a feature; closing it should be a decision.")}
                                checked={settings.accountDeletionEnabled}
                                onChange={e => setSettings({ ...settings, accountDeletionEnabled: e.currentTarget.checked })}
                            />
                            <Switch
                                label={t("Allow judging by services this installation does not run")}
                                description={t("Off by default, because sending somebody's submission to a third party is a thing to choose rather than to inherit. While it is off no such problem is handed out and the work waits, so turning it on later loses nothing. Turning it on is what the privacy notice has to account for.")}
                                checked={settings.externalJudgingEnabled}
                                onChange={e => setSettings({ ...settings, externalJudgingEnabled: e.currentTarget.checked })}
                            />
                            <Group justify="flex-end">
                                <Button data-testid="save"
                                    loading={busy}
                                    onClick={() => void run(() => call(api => api.managerApi.updateInstanceSettings(settings)))}
                                >
                                    {t("Save")}
                                </Button>
                            </Group>
                        </Stack>
                    </Card>

                    <AccessKeysCard />
                </Tabs.Panel>

                <Tabs.Panel value="mark" pt="md">
                    <MarkPanel busy={busy} run={run} store={store} />
                </Tabs.Panel>

                <Tabs.Panel value="documents" pt="md">
                    <DocumentsPanel busy={busy} run={run} store={store} logoUrl={logoUrl} />
                </Tabs.Panel>
            </Tabs>
        </Stack>
    );
}

interface PanelProps {
    busy: boolean;
    run: (operation: () => Promise<unknown>) => Promise<void>;
    store: (bytes: Blob, name: string) => Promise<{ id: string }>;
}

/**
 * The mark, and one per language for an institution whose wordmark differs
 * between them.
 *
 * A language without its own uses the default, exactly as a document does; an
 * instance with no mark at all shows the placeholder that ships with the
 * software, which is visibly a placeholder.
 */
function MarkPanel({ busy, run, store }: PanelProps) {
    const { t } = useTranslation();
    const call = useApiCall();
    const { instance } = useInstance();
    const [language, setLanguage] = useState("");

    const set = (file: File | null, forLanguage: string | undefined) => {
        if (!file) return;
        void run(async () => {
            const stored = await store(file, file.name);
            await call(api => api.managerApi.setInstanceLogo({ fileId: stored.id, language: forLanguage }));
        });
    };
    const clear = (forLanguage: string | undefined) =>
        void run(() => call(api => api.managerApi.setInstanceLogo({ language: forLanguage })));

    const marks = [
        { language: undefined as string | undefined, logo: instance.logo },
        ...(instance.logoTranslations ?? []).map(entry => ({ language: entry.language, logo: entry.logo })),
    ];

    return (
        <Stack gap="md">
            <Alert color="gray" p="xs">
                <Text size="sm">
                    {t("A language without a mark of its own uses the default one. An instance with none shows the placeholder that ships with the software.")}
                </Text>
            </Alert>

            {marks.map(mark => (
                <Card withBorder radius="sm" key={mark.language ?? "*"}>
                    <Group justify="space-between" wrap="wrap">
                        <Group gap="md">
                            <Card withBorder p="xs" radius="sm" bg="gray.0" w={180}>
                                {mark.logo
                                    ? <Image src={mark.logo.url} alt="" fit="contain" h={56} />
                                    : <Center h={56}><Text size="xs" c="dimmed">{t("none")}</Text></Center>}
                            </Card>
                            <Stack gap={2}>
                                <Text fw={500}>
                                    {mark.language ? mark.language : t("Default mark")}
                                </Text>
                                {mark.logo && (
                                    <Text size="xs" c="dimmed" ff="monospace">
                                        {mark.logo.mimeType} · {Math.max(1, Math.round(mark.logo.sizeBytes / 1024))} KiB
                                    </Text>
                                )}
                            </Stack>
                        </Group>
                        <Group gap="xs">
                            <FileButton onChange={file => set(file, mark.language)} accept="image/*">
                                {props => (
                                    <Button {...props} variant="light" size="compact-sm" leftSection={<IconUpload size={14} />} loading={busy}>
                                        {mark.logo ? t("Replace") : t("Upload")}
                                    </Button>
                                )}
                            </FileButton>
                            {mark.logo && (
                                <Tooltip label={t("Remove")}>
                                    <Button
                                        variant="light"
                                        color="red"
                                        size="compact-sm"
                                        loading={busy}
                                        onClick={() => clear(mark.language)}
                                    >
                                        <IconTrash size={14} />
                                    </Button>
                                </Tooltip>
                            )}
                        </Group>
                    </Group>
                </Card>
            ))}

            <Card withBorder radius="sm">
                <Group align="flex-end" gap="sm">
                    <TextInput
                        label={t("A mark for one language")}
                        description={t("A BCP-47 subtag, such as en.")}
                        placeholder="en"
                        value={language}
                        onChange={e => setLanguage(e.currentTarget.value.trim().toLowerCase())}
                    />
                    <FileButton onChange={file => { set(file, language); setLanguage(""); }} accept="image/*">
                        {props => (
                            <Button {...props} variant="light" leftSection={<IconUpload size={14} />} disabled={!/^[a-z]{2,3}(-[a-z0-9]+)*$/.test(language)}>
                                {t("Upload")}
                            </Button>
                        )}
                    </FileButton>
                </Group>
            </Card>
        </Stack>
    );
}

/**
 * The six documents an operator owns.
 *
 * The panel itself is shared with the activity screen, which publishes its own
 * three the same way. What differs is here: which kinds exist, what they are
 * called, and the calls that read and write them.
 */
function DocumentsPanel({ busy, run, store, logoUrl }: PanelProps & { logoUrl?: string }) {
    const { t } = useTranslation();
    const call = useApiCall();
    const { instance } = useInstance();

    return (
        <SharedDocumentsPanel<InstanceDocumentKind, InstanceDocumentRef>
            kinds={DOCUMENT_KINDS}
            label={kind => t(`legal.${kind}`)}
            published={instance.documents}
            fileName={documentFileName}
            // The one attachment an operator's document may point at. Absent
            // when they turned the mark off, which is theirs to do.
            attachments={logoUrl ? [{ name: LOGO_ATTACHMENT, mimeType: "image/svg+xml" }] : []}
            busy={busy}
            run={run}
            store={store}
            readText={fileId => call(api => api.fileApi.getText(fileId))}
            publish={(kind, statements) => call(api => api.managerApi.publishInstanceDocument(kind, statements))}
            unpublish={kind => call(api => api.managerApi.unpublishInstanceDocument(kind))}
            history={kind => call(api => api.managerApi.getInstanceDocumentHistory(kind))}
        />
    );
}

/**
 * The named secrets this installation holds for services it talks to.
 *
 * **Write-only here, and the screen has to say so.** Nothing on this page can
 * read a key back — the one endpoint that hands a value out is called by
 * whatever needs it, not by this form. An empty field would otherwise read as
 * "the key was lost" rather than as "the API refuses to disclose it", so the
 * screen states which keys are set and when, and offers to replace them.
 */
function AccessKeysCard() {
    const { t } = useTranslation();
    const call = useApiCall();

    const [keys, setKeys] = useState<AccessKey[]>([]);
    const [name, setName] = useState("uvaexplorer");
    const [value, setValue] = useState("");
    const [busy, setBusy] = useState(false);

    // Through the wrapper, for the same reason as everywhere else: a bare
    // effect with `useApiCall` never resolves, and a list that never arrives
    // reads as an installation holding no keys.
    useApiEffect(async api => setKeys(await api.managerApi.getAccessKeys()), []);

    const save = async () => {
        setBusy(true);
        try {
            setKeys(await call(api => api.managerApi.setAccessKey(name.trim(), value)));
            setValue("");
        } finally {
            setBusy(false);
        }
    };

    return (
        <Card withBorder padding="md">
            <Stack gap="sm">
                <Text fw={500}>{t("Access keys")}</Text>
                <Text size="sm" c="dimmed">
                    {t("Secrets this installation holds for services it talks to. They are never shown again after being saved — the screen can only say which are set. Saving an empty value removes one.")}
                </Text>

                {keys.length === 0 && (
                    <Text size="sm" c="dimmed">{t("No key is set.")}</Text>
                )}

                {keys.map(key => (
                    <Group key={key.name} justify="space-between">
                        <Text ff="monospace">{key.name}</Text>
                        <Text size="sm" c="dimmed">
                            {t("Set {{when}}", { when: new Date(key.updatedAt).toLocaleString() })}
                        </Text>
                    </Group>
                ))}

                <Group align="flex-end" gap="sm">
                    <TextInput
                        label={t("Key name")}
                        value={name}
                        disabled={busy}
                        onChange={e => setName(e.currentTarget.value)}
                    />
                    <PasswordInput
                        style={{ flex: 1 }}
                        label={t("Value")}
                        placeholder={t("Not shown once saved")}
                        value={value}
                        disabled={busy}
                        onChange={e => setValue(e.currentTarget.value)}
                    />
                    <Button data-testid="save" loading={busy} disabled={name.trim().length === 0} onClick={() => void save()}>
                        {t("Save")}
                    </Button>
                </Group>
            </Stack>
        </Card>
    );
}
