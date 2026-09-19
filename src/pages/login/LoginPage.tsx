import {
    Alert, Anchor, Box, Button, Center, Container, Divider, Loader, LoadingOverlay, Paper,
    PasswordInput, Stack, Text, TextInput, Title,
} from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useTranslation } from "react-i18next";
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { providerChallengeUrl } from '../../api/providerChallenge';
import { UnauthorizedError } from '../../api/ApiError';
import { useAuth } from '../../provider/authContext';
import { useInstance } from '../../provider/instanceContext';
import { stashJoinPassword } from '../../utils/joinPassword';
import classes from './LoginPage.module.css';
import { registrationOffered } from "../../api/registration";

/**
 * Signing in.
 *
 * There is no "forgot password" link, and that is deliberate: this version sends
 * no email, so the link would lead to an administrator's inbox by a longer road.
 * The screen says so instead of implying a self-service reset that does not
 * exist.
 *
 * **That is about a local account, and only a local account.** Somebody who
 * signs in through a provider recovers their password there — the AlgoJudge
 * Account's own screen has offered exactly that since 2026-09-06 — and this
 * screen never sees it happen. Two surfaces, two answers, and the difference is
 * which account the password belongs to.
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
    const { instance, answered } = useInstance();
    const [query] = useSearchParams();

    // A federated sign-in that was refused comes back here as a redirect, not as
    // a response: the browser was mid-journey and there was nobody to read a
    // JSON body. The Server sends a code; this turns it into a sentence.
    const refusal = query.get('error');

    /*
     * Whether to draw the login-and-password form.
     *
     * **`?admin=true` is a convenience, not a secret.** An installation whose
     * people all arrive through a provider should not present a password box
     * almost nobody can use — but it still has administrators, local and
     * temporary accounts, and they need a way to the form. The endpoint behind
     * it is open either way, so nothing here is a control: hiding the form no
     * more disables password sign-in than removing a button disables the route
     * it pointed at.
     */
    const showForm = instance.showLocalSignIn || query.get('admin') === 'true';

    // Where the guard was going when it stopped somebody. The fallback is the
    // participant's own screen rather than the manager panel: most people who
    // sign in are participants.
    const destination = (location.state as { from?: string } | null)?.from ?? '/activities';

    /*
     * The same place, split for the journey through a provider.
     *
     * **The fragment must not become a `returnUrl`.** A self-enrollment link
     * carries the activity's password there so that no server sees it; a query
     * parameter the Server reads is an access log, a proxy, and the provider's
     * redirect. So the address given to the Server is the path and query alone,
     * and the fragment is stashed for this tab — `ActivityPage` collects it on
     * arrival.
     *
     * `destination` itself is untouched: signing in with a password redirects
     * locally, where the fragment reaches the activity without a server ever
     * holding it.
     */
    const fragment = destination.indexOf('#');
    const returnUrl = fragment === -1 ? destination : destination.slice(0, fragment);
    const joinPassword = fragment === -1 ? undefined : destination.slice(fragment + 1);
    // The path on its own, because that is what the activity screen has to
    // compare against when it decides whether the stash is addressed to it.
    const search = returnUrl.indexOf('?');
    const returnUrlPath = search === -1 ? returnUrl : returnUrl.slice(0, search);

    /*
     * Where this screen sends somebody who never gets to see it.
     *
     * **Four things suppress it, and each is a way somebody would otherwise be
     * stuck.**
     *
     * `?admin=true` is the deliberate way back to the form, and it has to work
     * here for the same reason it works above: an installation that redirects
     * still has administrators.
     *
     * `?error=` is a *refused* federated sign-in landing here to be explained.
     * Redirecting that back to the provider — which still holds a session and
     * will hand out the same refused ticket — is an infinite loop through
     * somebody else's servers with nothing on the screen, and it happens on an
     * ordinary path on a correctly configured installation.
     *
     * An unanswered instance would fire on the defaults, and somebody already
     * signed in has no business being sent to a provider at all.
     */
    const suppressed = query.get('admin') === 'true' || refusal !== null;
    const redirectTo = answered && !suppressed && status === 'anonymous'
        && instance.signInRedirectProvider
        ? providerChallengeUrl(instance.signInRedirectProvider, returnUrl)
        : undefined;

    useEffect(() => {
        if (!redirectTo) return;
        // The activity password stays in the tab, exactly as the buttons below
        // keep it. Without this, a self-enrollment link loses its password on
        // precisely the installations that set a redirect.
        if (joinPassword) stashJoinPassword(returnUrlPath, joinPassword);
        // **`replace`, not `assign` and not a router navigation.** A router
        // navigation would match this against the route table and never make a
        // request — the journey leaves this application. `assign` would leave
        // this screen in the history, so Back from the provider returns here and
        // redirects again: a trap with no way out.
        window.location.replace(redirectTo);
    }, [redirectTo, joinPassword, returnUrlPath]);

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

    // **Waited out rather than guessed**, the same three states `RequireSession`
    // and `SessionShell` read. Rendering the form while the session is still
    // being asked for shows a sign-in screen to somebody who is already signed
    // in, for as long as the answer takes, and then replaces it with a redirect.
    if (status === 'loading' || !answered) return <Center my="xl"><Loader size="xl" /></Center>;

    if (status === 'authenticated') return <Navigate to={destination} replace />;

    // The browser is leaving. Without this the form paints for one frame between
    // the effect being scheduled and the navigation committing.
    if (redirectTo) {
        const going = instance.providers
            .find(p => p.slug === instance.signInRedirectProvider)?.displayName ?? '';
        return (
            <Center my="xl">
                <Stack align="center" gap="sm">
                    <Loader size="xl" />
                    <Text c="dimmed">{t('Taking you to {{provider}}…', { provider: going })}</Text>
                </Stack>
            </Center>
        );
    }

    return (
        <Container size={420} my={40}>
            <Title ta="center" className={classes.title}>{t('Login')}</Title>

            {registrationOffered(instance) && (
                <Text c="dimmed" size="sm" ta="center" mt={5}>
                    {t('Do not have an account yet?')}{' '}
                    <Anchor component={Link} to="/register" size="sm">{t('Create account')}</Anchor>
                </Text>
            )}

            {refusal && !error && (
                <Alert variant="light" color="red" title={t('Signing in was refused')} icon={<IconInfoCircle />} my="md">
                    {refusal === 'provider.unmapped'
                        ? t('That provider does not grant you access to this installation. Ask whoever runs it.')
                        : refusal === 'provider.disabled'
                            ? t('That login method is switched off here.')
                            : t('The sign-in did not complete. Try again, or use a password.')}
                </Alert>
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
                    {showForm && (<>
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
                        {t('Forgot your password? An administrator will issue a new one.')}
                    </Text>
                    </>)}

                    {instance.providers.length > 0 && (
                        <>
                            {/* The divider separates two ways in, so it is only
                                a separator when both are on the page. */}
                            {showForm && <Divider my="lg" label={t('or')} labelPosition="center" />}
                            <Stack gap="xs">
                                {instance.providers.map(provider => (
                                    <Button
                                        key={provider.slug}
                                        variant="default"
                                        fullWidth
                                        // A full page load, not a router link: the
                                        // journey leaves this application for the
                                        // provider and comes back through the
                                        // Server. A client-side navigation would
                                        // never reach either.
                                        component="a"
                                        // The password stays in the tab rather
                                        // than in the address the Server is
                                        // handed. See `returnUrl` above.
                                        onClick={() => {
                                            if (joinPassword) stashJoinPassword(returnUrlPath, joinPassword);
                                        }}
                                        href={providerChallengeUrl(provider.slug, returnUrl)}
                                    >
                                        {t('Continue with {{provider}}', { provider: provider.displayName })}
                                    </Button>
                                ))}
                            </Stack>
                        </>
                    )}
                </Paper>
            </Box>
        </Container>
    );
}
