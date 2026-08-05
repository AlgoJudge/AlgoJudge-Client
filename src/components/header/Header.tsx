import { Burger, Center, Container, Group, Menu, useMantineColorScheme } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconChevronDown } from '@tabler/icons-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { displayName } from '../../api/displayName';
import { useAuth } from '../../provider/authContext';
import { useApiEffect } from '../../provider/apiContext';
import Logo from '../logo/Logo';
import classes from './Header.module.css';
import { notifications } from '@mantine/notifications';
import { usePreferences } from '../../provider/preferencesContext';

function Header() {
    const [opened, { toggle }] = useDisclosure(false);
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

    const { t, i18n } = useTranslation();
    const { session, signOut } = useAuth();

    const { theme, lang } = usePreferences();
    const { colorScheme, setColorScheme } = useMantineColorScheme();

    // Only when it actually differs. Mantine builds `setColorScheme` afresh on
    // every render, so it belongs in the dependency list — and each call does
    // real work whether or not anything changed: it writes localStorage and
    // injects a `transition: none` stylesheet for ten milliseconds. Called once
    // per render, that leaves the whole application without animation.
    useEffect(() => {
        if (theme && theme !== colorScheme) setColorScheme(theme);
    }, [theme, colorScheme, setColorScheme])
    // `i18n` is the i18next singleton, so listing it costs nothing.
    useEffect(() => { if (lang) void i18n.changeLanguage(lang) }, [lang, i18n])

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
        { link: '/login', label: t('Login') },
    ];

    const items = links.map((link) => {
        const menuItems = link.links?.map((item) => (
            <Menu.Item key={item.link} onClick={(event) => { event.preventDefault(); if (item.func) item.func(); }}>{item.label}</Menu.Item>
        ));

        if (menuItems) {
            return (
                <Menu key={link.label} trigger="hover" transitionProps={{ exitDuration: 0 }} withinPortal>
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

        return (
            <Link to={link.link} className={classes.link}>
                {link.label}
            </Link>
        );
    });

    return (
        <header className={classes.header}>
            <Container size="md">
                <div className={classes.inner}>
                    <Link to="/"><Logo /></Link>
                    <Group gap={5} visibleFrom="sm">
                        {items}
                    </Group>
                    <Burger opened={opened} onClick={toggle} size="sm" hiddenFrom="sm" />
                </div>
            </Container>
        </header>
    );
}

export default Header;