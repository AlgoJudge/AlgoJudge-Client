import { Anchor, Center, Container, Group, Menu } from '@mantine/core';
import { IconChevronUp } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import Logo from '../logo/Logo';
import classes from './Footer.module.css';
import { usePreferences } from '../../provider/PreferencesProvider';
import { useInstance } from '../../provider/instanceContext';

function Footer() {
    const { t } = useTranslation();
    const { setTheme, setLang } = usePreferences();

    // Which documents exist is the instance's decision, and one that publishes
    // none must not show four dead links. Read from the shared answer rather
    // than fetched again: the shell, the front page and the two account screens
    // all need it, and they should not each ask.
    const { instance } = useInstance();
    const documents = instance.legalDocuments;

    const links = [
        { link: 'https://algojudge.pl', label: t('About'), prev: false },
    ];

    const links2 = [
        {
            link: '#1',
            label: 'Lang',
            links: [
                { link: '#1-en', label: 'English', func: () => setLang('en') },
                { link: '#1-pl', label: 'Polski', func: () => setLang('pl') },
            ],
        },
        {
            link: '#2',
            label: 'Theme',
            links: [
                { link: '#2-light', label: 'Light', func: () => setTheme('light') },
                { link: '#2-dark', label: 'Dark', func: () => setTheme('dark') },
            ],
        }
    ];

    const items = links.map((link) => (
        <Anchor<'a'>
            c="dimmed"
            key={link.label}
            href={link.link}
            onClick={(event) => link.prev ? event.preventDefault() : {}}
            target="_blank"
            size="sm"
        >
            {link.label}
        </Anchor>
    ));
    const items2 = links2.map((link) => {
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
                                <IconChevronUp size="0.9rem" stroke={1.5} />
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
    const legalItems = documents.map(kind => (
        <Anchor c="dimmed" key={kind} component={Link} to={`/${kind}`} size="sm">
            {t(`legal.${kind}`)}
        </Anchor>
    ));

    const items3 = [...items, ...legalItems, ...items2];

    // In the flow of the page rather than pinned to the viewport. Affixed, it
    // floated over the last paragraph of every page with nothing behind it, so
    // the text of a document and the links of the footer were drawn on top of
    // each other and neither could be read.
    return (
        <div className={classes.footer}>
            <Container className={classes.inner}>
                <Link to="/"><Logo /></Link>
                <Group className={classes.links}>{items3}</Group>
            </Container>
        </div>
    );
}

export default Footer;