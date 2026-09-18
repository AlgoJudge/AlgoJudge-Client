import { Box, Burger, Center, Collapse, Container, Group, Menu, Stack, Text, UnstyledButton } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconChevronDown } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { displayName } from '../../api/displayName';
import { useAuth } from '../../provider/authContext';
import { useApiEffect } from '../../provider/apiContext';
import Logo from '../logo/Logo';
import classes from './Header.module.css';
import { notifications } from '@mantine/notifications';
import { useInstance } from '../../provider/instanceContext';
import { registrationOffered } from '../../api/registration';

function Header() {
    const [opened, { toggle, close }] = useDisclosure(false);
    const navigate = useNavigate();

    useApiEffect(async (api) => {
        api.authApi.eventDispatcher.addEventListener('systemMessage', (evt) => {
            notifications.show({
                title: evt.data.type === 'error' ? 'Connection error' : 'Notice',
                message: evt.data.message,
                color: evt.data.type === 'error' ? 'red' : 'blue'
            });
        });
    });

    const { t } = useTranslation();
    const { session, signOut } = useAuth();
    const { instance } = useInstance();

    const links = session ? [
        { link: '/', label: t('Home') },
        { link: '/activities', label: t('Activities') },
        {
            link: '#account',
            label: displayName(session),
            links: [
                { link: '/account', label: t('My account'), func: () => navigate('/account') },
                { link: '#logout', label: t('Logout'), func: () => void signOut() },
            ],
        }
    ] : [
        { link: '/', label: t('Home') },
        // Offered only where it leads anywhere — and a provider counts, which
        // is why this asks `registrationOffered` rather than the local flag on
        // its own. An installation that takes no sign-ups shows no entry, and
        // one that does must show it here: the sign-in screen carried the only
        // link to it, so anybody landing on the front page had no way to an
        // account at all.
        ...(registrationOffered(instance) ? [{ link: '/register', label: t('Register') }] : []),
        { link: '/login', label: t('Login') },
    ];

    // The same entries the desktop bar shows, flattened: below `sm` the account
    // menu has nowhere to hang a dropdown, and its two entries are simply two
    // more rows.
    const drawer: { link: string; label: string; func?: () => void | Promise<void> }[] =
        links.flatMap((link) => link.links ?? [{ link: link.link, label: link.label }]);

    const items = links.map((link) => {
        const menuItems = link.links?.map((item) => (
            <Menu.Item key={item.link} onClick={(event) => { event.preventDefault(); if (item.func) item.func(); }}>{item.label}</Menu.Item>
        ));

        if (menuItems) {
            return (
                // `click-hover` rather than `hover`: with `hover` alone Mantine
                // makes the target's own click a no-op, so on a touch screen the
                // menu opens on a tap and will not close on the next one. The
                // pointer behavior is unchanged.
                <Menu key={link.label} trigger="click-hover" transitionProps={{ exitDuration: 0 }} withinPortal>
                    <Menu.Target>
                        <a
                            href={link.link}
                            className={classes.link}
                            onClick={(event) => event.preventDefault()}
                        >
                            <Center>
                                <span className={classes.linkLabel}>{link.label}</span>
                                <IconChevronDown size="0.9rem" stroke={1.5} />
                            </Center>
                        </a>
                    </Menu.Target>
                    <Menu.Dropdown>{menuItems}</Menu.Dropdown>
                </Menu>
            );
        }

        // `NavLink` rather than `Link`, for the class React Router puts on
        // whichever entry matches the address. The application shell has had
        // this since it was written; the public bar is the half that did not.
        //
        // `end` is intent rather than necessity: this router already requires a
        // segment boundary, so `to="/"` does not prefix-match `/login`, and
        // removing `end` changes nothing here — measured, not assumed. It stays
        // because the day an entry gains a child route is the day it matters.
        return (
            <NavLink key={link.link} to={link.link} className={classes.link} end>
                {link.label}
            </NavLink>
        );
    });

    return (
        <header className={classes.header}>
            <Container size="md">
                <div className={classes.inner}>
                    <Group gap="sm" wrap="nowrap">
                        <Link to="/"><Logo h="1.2em" /></Link>
                        {/* A visitor should be able to tell whose installation
                            they have landed on, not only whose software. */}
                        {instance.name && (
                            <Text size="sm" c="dimmed" lineClamp={1} visibleFrom="sm">
                                {instance.name}
                            </Text>
                        )}
                    </Group>
                    <Group gap={5} visibleFrom="sm">
                        {items}
                    </Group>
                    <Burger opened={opened} onClick={toggle} size="sm" hiddenFrom="sm" aria-label={t('Menu')} />
                </div>

                {/* **The burger opened nothing.** `opened` was set by the button
                    and read by no one, and the bar above is `visibleFrom="sm"`,
                    so on a phone the public shell offered no way to sign in,
                    register, or reach anything at all. */}
                <Box hiddenFrom="sm">
                    <Collapse expanded={opened}>
                        <Stack gap={0} pb="xs" onClick={close}>
                            {drawer.map((entry) => entry.func
                                ? (
                                    <UnstyledButton
                                        key={entry.link}
                                        className={classes.link}
                                        onClick={(event) => { event.preventDefault(); entry.func?.(); }}
                                    >
                                        {entry.label}
                                    </UnstyledButton>
                                )
                                : (
                                    <NavLink key={entry.link} to={entry.link} className={classes.link} end>
                                        {entry.label}
                                    </NavLink>
                                ))}
                        </Stack>
                    </Collapse>
                </Box>
            </Container>
        </header>
    );
}

export default Header;