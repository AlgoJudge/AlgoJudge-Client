import {
    Alert, Badge, Button, Card, Group, PasswordInput, Stack, Tabs, Text, TextInput, Title,
} from "@mantine/core";
import { IconAlertTriangle, IconDownload, IconInfoCircle, IconTrash } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import LoadState from "../../components/LoadState";
import { useApiCall } from "../../provider/apiContext";
import { useAuth } from "../../provider/authContext";

const MIN_PASSWORD = 12;

/**
 * The signed-in person's own account.
 *
 * Everything here is theirs to change — but only where the account is this
 * instance's. An account owned by an identity provider is shown read-only with
 * one sentence saying so, because editing it here would either fail on the next
 * sign-in or quietly disagree with the provider.
 */
export default function AccountPage() {
    const { t } = useTranslation();
    const call = useApiCall();
    const navigate = useNavigate();
    const { session, setSession, signOut } = useAuth();

    const [query, setQuery] = useSearchParams();
    const tab = query.get("tab") ?? "profile";

    const [profile, setProfile] = useState({
        firstName: session?.firstName ?? "",
        lastName: session?.lastName ?? "",
        username: session?.username ?? "",
        email: session?.email ?? "",
    });
    const [passwords, setPasswords] = useState({ current: "", next: "", repeat: "" });
    const [confirmation, setConfirmation] = useState({ text: "", password: "" });

    const [message, setMessage] = useState<string | undefined>(undefined);
    const [error, setError] = useState<string | undefined>(undefined);
    const [busy, setBusy] = useState(false);

    // The guard above this route guarantees a session; this is the moment
    // between the two renders, not a state a person can sit in.
    if (!session) return <LoadState error={undefined} loading />;

    const local = session.isLocal;

    const run = async (operation: () => Promise<unknown>, done?: string) => {
        setError(undefined);
        setMessage(undefined);
        setBusy(true);
        try {
            await operation();
            if (done) setMessage(done);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    };

    const saveProfile = () => run(async () => {
        const updated = await call(api => api.authApi.updateProfile({
            firstName: profile.firstName,
            lastName: profile.lastName,
            username: profile.username,
            email: profile.email,
        }));
        setSession(updated);
    }, t("Saved"));

    const changePassword = () => {
        if (passwords.next.length < MIN_PASSWORD) {
            setError(t("A password needs at least 12 characters"));
            return;
        }
        if (passwords.next !== passwords.repeat) {
            setError(t("The passwords differ"));
            return;
        }
        run(async () => {
            await call(api => api.authApi.changePassword(passwords.current, passwords.next));
            setPasswords({ current: "", next: "", repeat: "" });
        }, t("The password was changed"));
    };

    const exportData = () => run(async () => {
        const blob = await call(api => api.authApi.exportData());
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `algojudge-${session.username}.json`;
        anchor.click();
        URL.revokeObjectURL(url);
    });

    /**
     * De-registers from every provider this account signs in through.
     *
     * No provider is named: somebody who holds one link and no password means
     * "remove my account", and picking one of several is a choice this screen
     * has no way to present usefully until an account can hold two.
     */
    const unlink = () => run(async () => {
        await call(api => api.authApi.unlinkProvider(undefined));
        await signOut();
        navigate("/login", { replace: true });
    });

    const deleteAccount = () => run(async () => {
        await call(api => api.authApi.deleteAccount(confirmation.password));
        // The session is gone with the account; the guard sends them onwards.
        await signOut();
        navigate("/login", { replace: true });
    });

    return (
        <Stack gap="md" maw={760}>
            <Stack gap={2}>
                <Group gap="xs">
                    <Title order={2}>{t("My account")}</Title>
                    {!local && <Badge variant="light" color="grape">SSO</Badge>}
                </Group>
                <Text size="sm" c="dimmed" ff="monospace">{session.username}</Text>
            </Stack>

            {error && <Alert color="red" withCloseButton onClose={() => setError(undefined)}>{error}</Alert>}
            {message && <Alert color="teal" withCloseButton onClose={() => setMessage(undefined)}>{message}</Alert>}

            {!local && (
                <Alert color="blue" icon={<IconInfoCircle size={18} />}>
                    {t("This account is managed by the identity provider. Your name, login, address and password are changed there.")}
                </Alert>
            )}

            <Tabs value={tab} onChange={value => setQuery(value ? { tab: value } : {}, { replace: true })}>
                <Tabs.List>
                    <Tabs.Tab value="profile">{t("Profile")}</Tabs.Tab>
                    <Tabs.Tab value="password">{t("Password")}</Tabs.Tab>
                    <Tabs.Tab value="data">{t("My data")}</Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value="profile" pt="md">
                    <Stack gap="sm">
                        <Group grow>
                            <TextInput
                                label={t("First name")}
                                description={t("Optional")}
                                value={profile.firstName}
                                onChange={e => setProfile({ ...profile, firstName: e.currentTarget.value })}
                                disabled={!local}
                            />
                            <TextInput
                                label={t("Last name")}
                                description={t("Optional")}
                                value={profile.lastName}
                                onChange={e => setProfile({ ...profile, lastName: e.currentTarget.value })}
                                disabled={!local}
                            />
                        </Group>
                        <TextInput
                            label={t("Username")}
                            description={t("Other people see this when you have given no name")}
                            value={profile.username}
                            onChange={e => setProfile({ ...profile, username: e.currentTarget.value })}
                            disabled={!local}
                            required
                        />
                        <TextInput
                            label={t("Email")}
                            description={t("Changing it makes the address unconfirmed again")}
                            value={profile.email}
                            onChange={e => setProfile({ ...profile, email: e.currentTarget.value })}
                            disabled={!local}
                            rightSection={session.email && !session.emailConfirmed
                                ? <Badge size="xs" variant="light" color="orange">?</Badge>
                                : undefined}
                        />
                        <Group justify="flex-end">
                            <Button loading={busy} disabled={!local} onClick={saveProfile}>{t("Save")}</Button>
                        </Group>
                    </Stack>
                </Tabs.Panel>

                <Tabs.Panel value="password" pt="md">
                    <Stack gap="sm" maw={420}>
                        <PasswordInput
                            label={t("Current password")}
                            value={passwords.current}
                            onChange={e => setPasswords({ ...passwords, current: e.currentTarget.value })}
                            disabled={!local}
                        />
                        <PasswordInput
                            label={t("New password")}
                            description={t("At least 12 characters")}
                            value={passwords.next}
                            onChange={e => setPasswords({ ...passwords, next: e.currentTarget.value })}
                            disabled={!local}
                        />
                        <PasswordInput
                            label={t("Repeat the password")}
                            value={passwords.repeat}
                            onChange={e => setPasswords({ ...passwords, repeat: e.currentTarget.value })}
                            disabled={!local}
                        />
                        <Group justify="flex-end">
                            <Button loading={busy} disabled={!local} onClick={changePassword}>
                                {t("Change the password")}
                            </Button>
                        </Group>
                    </Stack>
                </Tabs.Panel>

                <Tabs.Panel value="data" pt="md">
                    <Stack gap="md">
                        <Card withBorder radius="sm">
                            <Stack gap="xs">
                                <Title order={5}>{t("Export")}</Title>
                                <Text size="sm" c="dimmed">
                                    {t("Everything held about you, as a file you can keep.")}
                                </Text>
                                <Group>
                                    <Button
                                        variant="light"
                                        leftSection={<IconDownload size={16} />}
                                        loading={busy}
                                        onClick={exportData}
                                    >
                                        {t("Download my data")}
                                    </Button>
                                </Group>
                            </Stack>
                        </Card>

                        <Card withBorder radius="sm">
                            <Stack gap="xs">
                                <Title order={5}>
                                    {local ? t("Delete the account") : t("Leave through the provider")}
                                </Title>
                                {local ? (
                                    <>
                                        <Alert color="red" icon={<IconAlertTriangle size={18} />}>
                                            {t("Immediate and irreversible. Your submissions and results stay, under an identifier that no longer names you.")}
                                        </Alert>
                                        <TextInput
                                            label={t("Type DELETE to confirm")}
                                            value={confirmation.text}
                                            onChange={e => setConfirmation({ ...confirmation, text: e.currentTarget.value })}
                                        />
                                        <PasswordInput
                                            label={t("Password")}
                                            value={confirmation.password}
                                            onChange={e => setConfirmation({ ...confirmation, password: e.currentTarget.value })}
                                        />
                                        <Group justify="flex-end">
                                            <Button
                                                color="red"
                                                leftSection={<IconTrash size={16} />}
                                                loading={busy}
                                                disabled={confirmation.text !== "DELETE" || confirmation.password.length === 0}
                                                onClick={deleteAccount}
                                            >
                                                {t("Delete the account")}
                                            </Button>
                                        </Group>
                                    </>
                                ) : (
                                    <>
                                        {/* A different act with a different name.
                                            What this removes is a way of signing in;
                                            whether the account then goes depends on
                                            whether it was the last one. Calling it
                                            "delete" would promise more than it does
                                            in the case where a password remains. */}
                                        <Alert color="orange" icon={<IconAlertTriangle size={18} />}>
                                            {t("This removes your link to the identity provider. If it is the only way you sign in, the account is emptied — immediately, and your submissions and results stay under an identifier that no longer names you.")}
                                        </Alert>
                                        <TextInput
                                            label={t("Type DELETE to confirm")}
                                            value={confirmation.text}
                                            onChange={e => setConfirmation({ ...confirmation, text: e.currentTarget.value })}
                                        />
                                        <Group justify="flex-end">
                                            <Button
                                                color="red"
                                                leftSection={<IconTrash size={16} />}
                                                loading={busy}
                                                disabled={confirmation.text !== "DELETE"}
                                                onClick={unlink}
                                            >
                                                {t("Remove my link and account")}
                                            </Button>
                                        </Group>
                                    </>
                                )}
                            </Stack>
                        </Card>
                    </Stack>
                </Tabs.Panel>
            </Tabs>
        </Stack>
    );
}
