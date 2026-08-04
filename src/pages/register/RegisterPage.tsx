import {
    Alert, Anchor, Box, Button, Checkbox, Container, Group, LoadingOverlay, Paper, PasswordInput,
    Stack, Text, TextInput, Title,
} from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate } from "react-router-dom";
import { InstanceInfo } from "../../api/CoreApi";
import LoadState from "../../components/LoadState";
import { useApiCall, useApiEffect } from "../../provider/ApiProvider";
import { useAuth } from "../../provider/AuthProvider";
import classes from './RegisterPage.module.css';

const MIN_PASSWORD = 12;

/**
 * Creating an account, where the instance allows it.
 *
 * Most will not: accounts are made by an organiser or arrive through SSO, and
 * local registration is a setting that ships blocked. The screen therefore asks
 * the instance first and says plainly that it takes no sign-ups, rather than
 * offering a form whose answer is always no.
 */
export default function RegisterPage() {
    const { t } = useTranslation();
    const call = useApiCall();
    const { status } = useAuth();

    const [instance, setInstance] = useState<InstanceInfo | undefined>(undefined);
    const [form, setForm] = useState({
        username: "", firstName: "", lastName: "", email: "", password: "", repeat: "",
    });
    const [accepted, setAccepted] = useState(false);
    const [error, setError] = useState<string | undefined>(undefined);
    const [done, setDone] = useState(false);
    const [busy, setBusy] = useState(false);

    const loadError = useApiEffect(async (api) => {
        setInstance(await api.authApi.getInstanceInfo());
    }, []);

    const submit = async () => {
        if (form.username.trim().length === 0) return setError(t("A login is required"));
        if (instance?.requireEmail && form.email.trim().length === 0) {
            return setError(t("This instance requires an email address"));
        }
        if (form.password.length < MIN_PASSWORD) {
            return setError(t("A password needs at least 12 characters"));
        }
        if (form.password !== form.repeat) return setError(t("The passwords differ"));
        // The checkbox blocks the form rather than decorating it, and what it
        // records travels with the account.
        if (!accepted) return setError(t("The terms have to be accepted"));

        setError(undefined);
        setBusy(true);
        try {
            await call(api => api.authApi.register({
                username: form.username.trim(),
                firstName: form.firstName.trim() || undefined,
                lastName: form.lastName.trim() || undefined,
                email: form.email.trim() || undefined,
                password: form.password,
                acceptedTerms: true,
            }));
            setDone(true);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    };

    if (status === "authenticated") return <Navigate to="/activities" replace />;
    if (!instance) return <LoadState error={loadError} loading={!loadError} />;

    if (!instance.localRegistrationEnabled) {
        return (
            <Container size={520} my={40}>
                <Title ta="center" className={classes.title}>{t('Register')}</Title>
                <Paper withBorder shadow="md" p={30} mt={30} radius="md">
                    <Stack gap="sm">
                        <Alert color="blue" icon={<IconInfoCircle size={18} />}>
                            {t("This instance does not accept sign-ups. Accounts are created by an organiser or come from the identity provider.")}
                        </Alert>
                        <Text size="sm" c="dimmed">
                            {t("If you are expecting an account, ask whoever runs the contest or the course.")}
                        </Text>
                        <Group justify="center">
                            <Anchor component={Link} to="/login">{t('Sign in')}</Anchor>
                        </Group>
                    </Stack>
                </Paper>
            </Container>
        );
    }

    if (done) {
        return (
            <Container size={520} my={40}>
                <Paper withBorder shadow="md" p={30} mt={30} radius="md">
                    <Stack gap="sm">
                        <Title order={3}>{t("The account was created")}</Title>
                        <Text size="sm">
                            {instance.requireConfirmedEmail
                                ? t("Confirm the address before signing in.")
                                : t("You can sign in now.")}
                        </Text>
                        <Anchor component={Link} to="/login">{t('Sign in')}</Anchor>
                    </Stack>
                </Paper>
            </Container>
        );
    }

    return (
        <Container size={520} my={40}>
            <Title ta="center" className={classes.title}>{t('Register')}</Title>

            {error && (
                <Alert variant="light" color="red" withCloseButton onClose={() => setError(undefined)} my="md">
                    {error}
                </Alert>
            )}

            <Box pos="relative">
                <Paper withBorder shadow="md" p={30} mt={30} radius="md">
                    <LoadingOverlay visible={busy} zIndex={1000} overlayProps={{ radius: "sm", blur: 2 }} />
                    <Stack gap="sm">
                        <TextInput
                            label={t('Username')}
                            description={t('The only required field: it is what they sign in as')}
                            value={form.username}
                            onChange={e => setForm({ ...form, username: e.currentTarget.value })}
                            required
                        />
                        <Group grow>
                            <TextInput
                                label={t('First name')}
                                description={t('Optional')}
                                value={form.firstName}
                                onChange={e => setForm({ ...form, firstName: e.currentTarget.value })}
                            />
                            <TextInput
                                label={t('Last name')}
                                description={t('Optional')}
                                value={form.lastName}
                                onChange={e => setForm({ ...form, lastName: e.currentTarget.value })}
                            />
                        </Group>
                        <TextInput
                            label={t('Email')}
                            description={instance.requireEmail ? undefined : t('Optional')}
                            value={form.email}
                            onChange={e => setForm({ ...form, email: e.currentTarget.value })}
                            required={instance.requireEmail}
                        />
                        <PasswordInput
                            label={t('Password')}
                            description={t('At least 12 characters')}
                            value={form.password}
                            onChange={e => setForm({ ...form, password: e.currentTarget.value })}
                            required
                        />
                        <PasswordInput
                            label={t('Repeat the password')}
                            value={form.repeat}
                            onChange={e => setForm({ ...form, repeat: e.currentTarget.value })}
                            required
                        />
                        <Checkbox
                            checked={accepted}
                            onChange={e => setAccepted(e.currentTarget.checked)}
                            label={
                                <Text size="sm">
                                    {t('I accept the terms and conditions')}{' '}
                                    <Anchor component={Link} to="/terms" size="sm">{t('Terms')}</Anchor>
                                    {' · '}
                                    <Anchor component={Link} to="/privacy" size="sm">{t('Privacy policy')}</Anchor>
                                </Text>
                            }
                        />
                        <Button fullWidth mt="md" loading={busy} onClick={submit}>
                            {t('Sign up')}
                        </Button>
                    </Stack>
                </Paper>
            </Box>
        </Container>
    );
}
