import {
    Alert, Anchor, Box, Button, Container, LoadingOverlay, Paper, PasswordInput, Text, TextInput, Title,
} from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from "react-i18next";
import { Link, Navigate, useLocation } from 'react-router-dom';
import { UnauthorizedError } from '../../api/ApiError';
import { useAuth } from '../../provider/authContext';
import { useInstance } from '../../provider/instanceContext';
import classes from './LoginPage.module.css';

/**
 * Signing in.
 *
 * There is no "forgot password" link, and that is deliberate: this version sends
 * no email, so the link would lead to an administrator's inbox by a longer road.
 * The screen says so instead of implying a self-service reset that does not
 * exist.
 */
export default function LoginPage() {
    const { t } = useTranslation();
    const location = useLocation();
    const { status, signIn } = useAuth();

    const [login, setLogin] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | undefined>(undefined);
    const [busy, setBusy] = useState(false);
    // Read from the shared answer rather than fetched again here.
    const { instance } = useInstance();

    // Where the guard was going when it stopped somebody. The fallback is the
    // participant's own screen rather than the manager panel: most people who
    // sign in are participants.
    const destination = (location.state as { from?: string } | null)?.from ?? '/activities';

    const submit = async () => {
        if (login.trim().length === 0 || password.length === 0) {
            setError(t('Give a login and a password'));
            return;
        }
        setError(undefined);
        setBusy(true);
        try {
            await signIn(login.trim(), password);
        } catch (e) {
            // A wrong password and an unknown login answer the same way; anything
            // else carries the Server's own message, which is usually "locked".
            setError(e instanceof UnauthorizedError
                ? t('Invalid login or password')
                : e instanceof Error ? e.message : t('Error'));
            setBusy(false);
        }
    };

    if (status === 'authenticated') return <Navigate to={destination} replace />;

    return (
        <Container size={420} my={40}>
            <Title ta="center" className={classes.title}>{t('Login')}</Title>

            {instance.localRegistrationEnabled && (
                <Text c="dimmed" size="sm" ta="center" mt={5}>
                    {t('Do not have an account yet?')}{' '}
                    <Anchor component={Link} to="/register" size="sm">{t('Create account')}</Anchor>
                </Text>
            )}

            {error && (
                <Alert
                    variant="light"
                    color="red"
                    withCloseButton
                    onClose={() => setError(undefined)}
                    title={t('Error')}
                    icon={<IconInfoCircle />}
                    my="md"
                >
                    {error}
                </Alert>
            )}

            <Box pos="relative">
                <Paper withBorder shadow="md" p={30} mt={30} radius="md">
                    <LoadingOverlay visible={busy} zIndex={1000} overlayProps={{ radius: "sm", blur: 2 }} />
                    <TextInput
                        label={t('Login or email')}
                        placeholder={t('your login')}
                        value={login}
                        onChange={e => setLogin(e.currentTarget.value)}
                        onKeyDown={e => e.key === 'Enter' && submit()}
                        required
                    />
                    <PasswordInput
                        label={t('Password')}
                        placeholder={t('Your password')}
                        value={password}
                        onChange={e => setPassword(e.currentTarget.value)}
                        onKeyDown={e => e.key === 'Enter' && submit()}
                        required
                        mt="md"
                    />
                    <Button fullWidth mt="xl" loading={busy} onClick={submit}>
                        {t('Sign in')}
                    </Button>
                    <Text size="xs" c="dimmed" mt="md" ta="center">
                        {t('Forgotten your password? An administrator will issue a new one.')}
                    </Text>
                </Paper>
            </Box>
        </Container>
    );
}
