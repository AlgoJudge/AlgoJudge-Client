import {
    Alert, Anchor, Box, Button, Center, Checkbox, Container, Group, Loader, LoadingOverlay, Paper,
    PasswordInput, Stack, Text, TextInput, Title,
} from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate } from "react-router-dom";
import { LegalDocumentKind } from "../../api/CoreApi";
import { pickDocumentRef, publishedLegalKinds } from "../../api/instanceDocuments";
import DocumentModal from "../../components/content/DocumentModal";
import RequiredAsterisk from "../../components/RequiredAsterisk";
import { useApiCall } from "../../provider/apiContext";
import { useAuth } from "../../provider/authContext";
import { useInstance } from "../../provider/instanceContext";
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
    const { t, i18n } = useTranslation();
    const call = useApiCall();
    const { status } = useAuth();

    // Read from the shared answer: the shell and the front page need it too, and
    // whether this instance takes sign-ups is one fact, not one per screen.
    const { instance } = useInstance();
    const [form, setForm] = useState({
        username: "", firstName: "", lastName: "", email: "", password: "", repeat: "",
    });
    const [accepted, setAccepted] = useState(false);
    const [error, setError] = useState<string | undefined>(undefined);
    const [done, setDone] = useState(false);
    const [busy, setBusy] = useState(false);
    /** Which document is open over the form, if any. */
    const [reading, setReading] = useState<LegalDocumentKind | undefined>(undefined);

    // What the box asks somebody to accept, out of what this instance published.
    const readable = publishedLegalKinds(instance.documents)
        .filter(kind => kind === "terms" || kind === "privacy");

    // **Asked for only where there is something to accept.** The box was
    // required unconditionally until 2026-09-01, on the stated grounds that
    // `acceptedTerms` is required by the API — which is not true: registration
    // is ASP.NET Core Identity's own handler and it binds no such field. So an
    // installation that publishes no terms demanded agreement to a document it
    // does not have, showed no link because there was none to show, and refused
    // the form until somebody ticked a bare asterisk.
    const mustAccept = readable.includes("terms");
    const readingRef = reading
        ? pickDocumentRef(instance.documents, reading, i18n.language)
        : undefined;


    const submit = async () => {
        if (form.username.trim().length === 0) return setError(t("A login is required"));
        if (instance.requireEmail && form.email.trim().length === 0) {
            return setError(t("This instance requires an email address"));
        }
        if (form.password.length < MIN_PASSWORD) {
            return setError(t("A password needs at least 12 characters"));
        }
        if (form.password !== form.repeat) return setError(t("The passwords differ"));
        // The checkbox blocks the form rather than decorating it — where there
        // is a document behind it.
        if (mustAccept && !accepted) return setError(t("The terms have to be accepted"));

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

    // The same three states the sign-in screen reads, and for the same reason:
    // a registration form shown to somebody already signed in, then replaced by
    // a redirect, is a flash of the wrong screen on every load.
    if (status === "loading") return <Center my="xl"><Loader size="xl" /></Center>;

    if (status === "authenticated") return <Navigate to="/activities" replace />;
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
                        {mustAccept && <Checkbox
                            checked={accepted}
                            onChange={e => setAccepted(e.currentTarget.checked)}
                            required
                            label={
                                <Text size="sm">
                                    {t('I accept the terms and conditions')}
                                    <RequiredAsterisk />
                                    {/* Only what this instance actually publishes.
                                        A link to a privacy policy nobody wrote
                                        leads to a page saying there is none,
                                        under a box demanding it be accepted. */}
                                    {readable.map((kind, index) => (
                                        <span key={kind}>
                                            {index === 0 ? ' ' : ' · '}
                                            <Anchor
                                                component="button"
                                                type="button"
                                                size="sm"
                                                // Opened over the form. Navigating
                                                // away to read it and coming back
                                                // to an empty form is how people
                                                // learn to tick without reading.
                                                onClick={() => setReading(kind)}
                                            >
                                                {t(`legal.${kind}`)}
                                            </Anchor>
                                        </span>
                                    ))}
                                </Text>
                            }
                        />}
                        <Button fullWidth mt="md" loading={busy} onClick={submit}>
                            {t('Sign up')}
                        </Button>
                    </Stack>
                </Paper>
            </Box>

            <DocumentModal
                opened={reading !== undefined}
                onClose={() => setReading(undefined)}
                title={readingRef?.title ?? (reading ? t(`legal.${reading}`) : "")}
                fileId={readingRef?.fileId}
            />
        </Container>
    );
}
