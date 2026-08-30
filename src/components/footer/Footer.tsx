import {
    Anchor, Center, Container, Group, Menu, useComputedColorScheme, useMantineColorScheme,
} from '@mantine/core';
import { IconChevronUp } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import Logo from '../logo/Logo';
import classes from './Footer.module.css';
import { useInstance } from '../../provider/instanceContext';
import { publishedLegalKinds } from '../../api/instanceDocuments';
import { PROJECT_SITE } from '../../site';
import { isDarkGround } from '../../branding';

function Footer() {
    // Mantine and i18next each remember their own setting, and the application
    // shell already switches them directly. One store rather than two: a second
    // one only meant that whichever screen was mounted last won.
    const { t, i18n } = useTranslation();
    const { setColorScheme } = useMantineColorScheme();

    // **Which ground the mark is on, which the colour scheme cannot answer.**
    // This bar takes the instance's navigation colour, so it can be a saturated
    // blue in the *light* scheme — and the mark drawn for paper is then dark ink
    // on dark blue. With no theme it is the scheme's own answer, unchanged.
    const scheme = useComputedColorScheme();
    const { instance: themed } = useInstance();
    const ground = (scheme === 'dark' ? themed.theme?.dark : themed.theme?.light)?.navBackground;
    const onDarkGround = ground ? isDarkGround(ground) : scheme === 'dark';

    // Which documents exist is the instance's decision, and one that publishes
    // none must not show four dead links. Derived from the references the
    // instance answer carries, so withdrawing a document takes its link with it.
    const { instance } = useInstance();
    const documents = publishedLegalKinds(instance.documents);

    const links = [
        { link: PROJECT_SITE, label: t('About'), prev: false },
    ];

    const links2 = [
        {
            link: '#1',
            label: 'Lang',
            links: [
                { link: '#1-en', label: 'English', func: () => void i18n.changeLanguage('en') },
                { link: '#1-pl', label: 'Polski', func: () => void i18n.changeLanguage('pl') },
            ],
        },
        {
            link: '#2',
            label: 'Theme',
            links: [
                { link: '#2-light', label: 'Light', func: () => setColorScheme('light') },
                { link: '#2-dark', label: 'Dark', func: () => setColorScheme('dark') },
            ],
        }
    ];

    const items = links.map((link) => (
        <Anchor<'a'>
            className={classes.docLink}
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
        <Anchor className={classes.docLink} key={kind} component={Link} to={`/${kind}`} size="sm">
            {t(`legal.${kind}`)}
        </Anchor>
    ));

    const items3 = [...items, ...legalItems, ...items2];

    // In the flow of the page rather than pinned to the viewport. Affixed, it
    // floated over the last paragraph of every page with nothing behind it, so
    // the text of a document and the links of the footer were drawn on top of
    // each other and neither could be read.
    return (
        <div className={classes.footer} data-testid="footer">
            <Container className={classes.inner}>
                <Link to="/"><Logo onDark={onDarkGround} /></Link>
                <Group className={classes.links}>{items3}</Group>
            </Container>
        </div>
    );
}

export default Footer;