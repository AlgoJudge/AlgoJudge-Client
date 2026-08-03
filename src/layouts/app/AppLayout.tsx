import { AppShell, Burger, Group, UnstyledButton, Text, Divider, Tooltip, Menu, useMantineColorScheme, useComputedColorScheme, Badge } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { NavLink, Outlet, useMatch, useParams } from "react-router-dom";
import Logo from "../../components/logo/Logo";
import classes from "./AppLayout.module.css";
import { Icon, IconAlignBoxCenterTop, IconBox, IconChartBarPopular, IconChevronDown, IconChevronsLeft, IconChevronsRight, IconClock, IconDevicesPc, IconIdBadge2, IconListDetails, IconLogout, IconMessageQuestion, IconMoon, IconNotes, IconPackageExport, IconPrinter, IconProps, IconSectionSign, IconServer, IconSun, IconUserCheck, IconUsers, IconWorldWww } from "@tabler/icons-react";
import { ComponentPropsWithoutRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useApiEffect } from "../../provider/ApiProvider";
import { Activity, Series } from "../../api/ParticipantApi";
import Countdown from "../../components/time/Countdown";

const NavbarLink = (props: { label: string, collapsed: boolean, to: string, icon: React.ForwardRefExoticComponent<IconProps & React.RefAttributes<Icon>> }) => {
    return (
        <Tooltip label={props.label} disabled={!props.collapsed} position="right" openDelay={500}>
            <NavLink
                className={({ isActive }) => classes.link + " " + (isActive ? classes.active : "")}
                data-collapsed={props.collapsed || undefined}
                to={props.to}
                key={props.to}
                end
            >
                <props.icon className={classes.linkIcon} stroke={1.5} />
                <span>{props.label}</span>
            </NavLink>
        </Tooltip>
    );
}

const ManagerNavbar = (props: { collapsed: boolean }) => {
    const { t } = useTranslation();
    const match = useMatch({path: "/manager", end: false});
    if (!match) return;
    const links = [
        { to: `/manager/users`, label: t("Users"), icon: IconUsers },
        { to: `/manager/roles`, label: t("Roles"), icon: IconUserCheck },
        { to: `/manager/oidc`, label: t("External logins"), icon: IconIdBadge2 },
        { to: `/manager/lti`, label: t("LTI platforms"), icon: IconAlignBoxCenterTop },
        { to: `/manager/external-content`, label: t("Extarnal content"), icon: IconWorldWww },
        { to: `/manager/runners`, label: t("Runners"), icon: IconServer },
        { to: `/manager/workstations`, label: t("Workstations"), icon: IconDevicesPc },
        { to: `/manager/printers`, label: t("Printers"), icon: IconPrinter },
        { to: `/manager/problems`, label: t("Problems"), icon: IconNotes },
        { to: `/manager/activities`, label: t("Activities"), icon: IconListDetails },
        { to: `/manager/submissions`, label: t("Submissions"), icon: IconBox },
        { to: `/manager/questions`, label: t("Questions and announcements"), icon: IconMessageQuestion },
    ]
    return (
        <>
            {links.map(item => item && <NavbarLink key={item.to} to={item.to} label={item.label} icon={item.icon} collapsed={props.collapsed} />)}
            <Divider my="md" className={classes.divider} />
        </>
    );
}

const ActivityNavbar = (props: { collapsed: boolean, activity: Activity | undefined }) => {
    const { t } = useTranslation();
    const activity = props.activity;
    if (!activity) return;

    // Which modules exist is the activity manager's decision, not a constant. A
    // course legitimately has no ranking, and the entry must not be there when
    // it does not.
    const base = `/activities/${activity.slug}`;
    const links = [
        { to: `${base}/problems`, label: t("Problems"), icon: IconNotes },
        { to: `${base}/submit`, label: t("Submit"), icon: IconPackageExport },
        { to: `${base}/submissions`, label: t("My submissions"), icon: IconBox },
        activity.modules.ranking && { to: `${base}/ranking`, label: t("Ranking"), icon: IconChartBarPopular },
        activity.modules.questions && { to: `${base}/questions`, label: t("Questions and announcements"), icon: IconMessageQuestion },
        activity.modules.rules && { to: `${base}/rules`, label: t("Rules"), icon: IconSectionSign },
    ]
    return (
        <>
            <Text className={classes.text}>{props.collapsed ? activity.slug : activity.name}</Text>
            <Divider my="md" className={classes.divider} />
            {links.map(item => item && <NavbarLink key={item.to} to={item.to} label={item.label} icon={item.icon} collapsed={props.collapsed} />)}
            <Divider my="md" className={classes.divider} />
        </>
    );
}

/**
 * Time left in the series that is currently running.
 *
 * It starts only once a series has started and counts to that series' end, not
 * to the activity's — an activity spanning three rounds has no single deadline a
 * participant is working against.
 */
const ActivityClock = ({ activity, series }: { activity: Activity | undefined, series: Series[] }) => {
    const { t } = useTranslation();
    if (!activity) return null;

    const now = Date.now();
    const running = series.find(s =>
        s.isOpen && s.endDate !== undefined &&
        (s.startDate === undefined || Date.parse(s.startDate) <= now) &&
        Date.parse(s.endDate) > now);
    if (!running?.endDate) return null;

    return (
        <Tooltip label={`${running.name} — ${t("Time left")}`}>
            <Badge size="lg" variant="light" color="blue" leftSection={<IconClock size={14} />}>
                <Countdown target={running.endDate} />
            </Badge>
        </Tooltip>
    );
}

const ColorSchemeSwitch = () => {
    const { setColorScheme } = useMantineColorScheme();
    const computedColorScheme = useComputedColorScheme('light', { getInitialValueInEffect: true });
    return (
        <UnstyledButton
            onClick={() => setColorScheme(computedColorScheme === 'light' ? 'dark' : 'light')}
            aria-label="Toggle color scheme"
        >
            <IconSun className={classes.color_schema_icon + " " + classes.light} stroke={1.5} />
            <IconMoon className={classes.color_schema_icon + " " + classes.dark} stroke={1.5} />
        </UnstyledButton>
    );
}

const LangSelector = () => {
    const { t, i18n } = useTranslation();
    return (
        <Menu trigger="hover" transitionProps={{ exitDuration: 0 }} withinPortal>
            <Menu.Target>
                <UnstyledButton>
                    {t("Lang")} <IconChevronDown size="0.9rem" stroke={1.5} />
                </UnstyledButton>
            </Menu.Target>
            <Menu.Dropdown>
                <Menu.Item onClick={() => i18n.changeLanguage("en")}>English</Menu.Item>
                <Menu.Item onClick={() => i18n.changeLanguage("pl")}>Polski</Menu.Item>
            </Menu.Dropdown>
        </Menu>
    );
}

const UserButton = (props: ComponentPropsWithoutRef<'button'>) => {
    return (
        <UnstyledButton mx="xl" {...props} className={classes.user}>
            <Group>
                <div style={{ flex: 1 }}>
                    <Text size="sm" fw={500}>
                        John Smith
                    </Text>

                    <Text c="dimmed" size="xs">
                        john
                    </Text>
                </div>

                <IconChevronDown size={14} stroke={1.5} />
            </Group>
        </UnstyledButton>
    );
}

const UserMenu = () => {
    const { t } = useTranslation();
    return (
        <Menu shadow="md" width={200}>
            <Menu.Target>
                <UserButton />
            </Menu.Target>

            <Menu.Dropdown>
                <Menu.Item leftSection={<IconLogout size={14} />}>
                    {t("Logout")}
                </Menu.Item>
            </Menu.Dropdown>
        </Menu>
    );
}

export default function AppLayout() {
    const { t } = useTranslation();
    const [opened, { toggle }] = useDisclosure();
    const [collapsed, collapse] = useDisclosure();
    const params = useParams();

    // Loaded once here and shared by the sidebar and the clock, so entering an
    // activity does not fetch it twice.
    const [activity, setActivity] = useState<Activity | undefined>(undefined);
    const [series, setSeries] = useState<Series[]>([]);

    useApiEffect(async (api) => {
        if (!params.activityId) {
            setActivity(undefined);
            setSeries([]);
            return;
        }
        const loaded = await api.participantApi.getActivity(params.activityId);
        setActivity(loaded);
        setSeries(await api.participantApi.getSeries(loaded.id));
        api.participantApi.eventDispatcher.addEventListener("activityUpdated", evt => {
            if (evt.data.activity.id === loaded.id) setActivity(evt.data.activity);
        });
        api.participantApi.eventDispatcher.addEventListener("sectionOpened", evt => {
            if (evt.data.activityId !== loaded.id) return;
            setSeries(current => current.map(s => s.id === evt.data.series.id ? evt.data.series : s));
        });
        // The clock counts to the end of the running series, so a moved time has
        // to reach it — otherwise the header keeps counting to an instant that
        // no longer exists.
        api.participantApi.eventDispatcher.addEventListener("activityTimesChanged", async evt => {
            if (evt.data.activityId !== loaded.id) return;
            setSeries(await api.participantApi.getSeries(loaded.id));
        });
    }, [params.activityId]);

    const CollapseButton =
        <>
            <Tooltip label={t("Expand")} disabled={!collapsed} position="right" openDelay={500}>
                <a
                    className={classes.link}
                    data-collapsed={collapsed || undefined}
                    href={''}
                    onClick={(event) => {
                        event.preventDefault();
                        collapse.toggle();
                    }}
                >
                    {collapsed ? <IconChevronsRight className={classes.linkIcon} stroke={1.5} /> : <IconChevronsLeft className={classes.linkIcon} stroke={1.5} />}
                    <span>{t("Collapse")}</span>
                </a>
            </Tooltip>
        </>

    return (
        <AppShell
            header={{ height: "4em" }}
            navbar={{
                width: collapsed ? 100 : 300,
                breakpoint: 'sm',
                collapsed: { mobile: !opened },
            }}
            padding="md"
        >
            <AppShell.Header className={classes.header}>
                <Group>
                    <Burger
                        opened={opened}
                        onClick={toggle}
                        hiddenFrom="sm"
                        size="sm"
                    />
                    <NavLink to="/"><Logo h="1em" mx="xl" /></NavLink>
                </Group>
                <Group>
                    <ActivityClock activity={activity} series={series} />
                    <ColorSchemeSwitch />
                    <LangSelector />
                    <UserMenu />
                </Group>
            </AppShell.Header>

            <AppShell.Navbar p="md" className={classes.navbar}>
                <ActivityNavbar collapsed={collapsed} activity={activity} />
                <ManagerNavbar collapsed={collapsed} />
                <NavbarLink to={`/activities`} label={t("Activities")} icon={IconListDetails} collapsed={collapsed} />
                <Divider my="md" className={classes.divider} />
                {CollapseButton}
            </AppShell.Navbar>

            <AppShell.Main>
                <Outlet />
            </AppShell.Main>
        </AppShell>
    );
}
