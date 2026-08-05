import { AppShell, Burger, Center, Group, Image, Loader, UnstyledButton, Text, Divider, Tooltip, Menu, ScrollArea, useMantineColorScheme, useComputedColorScheme, Badge } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { NavLink, Outlet, useMatch, useNavigate } from "react-router-dom";
import Logo from "../../components/logo/Logo";
import { displayName } from "../../api/displayName";
import { useAuth } from "../../provider/authContext";
import { useInstance } from "../../provider/instanceContext";
import { usePermissions } from "../../provider/permissionsContext";
import { MANAGER_AREAS, MANAGER_PERMISSIONS } from "../../pages/manager/managerAreas";
import classes from "./AppLayout.module.css";
import { Icon, IconBox, IconChartBarPopular, IconChevronDown, IconChevronsLeft, IconChevronsRight, IconClock, IconHome, IconListDetails, IconLogout, IconMessageQuestion, IconMoon, IconNotes, IconPackageExport, IconProps, IconSectionSign, IconSettings, IconSun, IconUser } from "@tabler/icons-react";
import { ComponentPropsWithoutRef, Suspense, useState } from "react";
import { useTranslation } from "react-i18next";
import { useApiEffect } from "../../provider/apiContext";
import { Activity, Series } from "../../api/ParticipantApi";
import { PROJECT_SITE } from "../../site";
import Countdown from "../../components/time/Countdown";

const NavbarLink = (props: {
    label: string,
    collapsed: boolean,
    to: string,
    icon: React.ForwardRefExoticComponent<IconProps & React.RefAttributes<Icon>>,
    /** Planned, not built. Rendered as a dead entry rather than a link to nothing. */
    soon?: boolean,
}) => {
    const { t } = useTranslation();

    // A link to a route that does not exist lands on a blank page, which reads
    // as a bug rather than as a feature that has not arrived.
    if (props.soon) {
        return (
            <Tooltip label={props.label} disabled={!props.collapsed} position="right" openDelay={500}>
                <span className={classes.link} data-collapsed={props.collapsed || undefined} data-soon>
                    <props.icon className={classes.linkIcon} stroke={1.5} />
                    <span>{props.label}</span>
                    {!props.collapsed && <span className={classes.soon}>{t("soon")}</span>}
                </span>
            </Tooltip>
        );
    }

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

/**
 * The manager panel's own navigation.
 *
 * Built from `MANAGER_AREAS`, the one table the landing screen and the route
 * guard also read, and filtered by what this person holds anywhere: a menu that
 * offers a screen answering 403 is worse than a shorter menu. `soon` entries
 * carry no permission — they lead nowhere and disclose nothing, and hiding them
 * would make the product look smaller than the plan it is being built to.
 */
const ManagerNavbar = (props: { collapsed: boolean }) => {
    const { t } = useTranslation();
    const { hasAny } = usePermissions();
    const match = useMatch({ path: "/manager", end: false });
    if (!match) return;
    // Somebody who may open nothing in the panel gets no panel navigation —
    // not even the dead entries. They are there to show a manager where the
    // product is going, and this person is being refused at the door.
    if (!hasAny(MANAGER_PERMISSIONS)) return;

    const links = MANAGER_AREAS.filter(area => area.permissions.length === 0 || hasAny(area.permissions));
    return (
        <>
            {links.map(item => (
                <NavbarLink
                    key={item.to}
                    to={item.to}
                    label={t(item.label)}
                    icon={item.icon}
                    collapsed={props.collapsed}
                    soon={item.soon}
                />
            ))}
            <Divider my="md" className={classes.divider} />
        </>
    );
}

/**
 * The project, and the instance's own documents, at the foot of the navigation.
 *
 * The application shell had no way to reach any of them: they live in the public
 * footer, which this shell does not have, so a signed-in reader could not open
 * the privacy policy from anywhere inside the product.
 *
 * Deliberately quieter than everything above — no icon, no weight, smaller and
 * dimmed. These are read once and then never again, and they must not compete
 * with the entries somebody uses all day.
 */
const FootLinks = (props: { collapsed: boolean }) => {
    const { t } = useTranslation();
    const { instance } = useInstance();
    // Nothing when collapsed: without an icon there is nothing left to draw at a
    // hundred pixels wide.
    if (props.collapsed) return null;
    return (
        <div className={classes.foot}>
            {/* The only link out of the instance in the whole shell, and it is
                the product's own site rather than anybody else's. */}
            <a href={PROJECT_SITE} target="_blank" rel="noreferrer" className={classes.footLink}>
                {t("About")}
            </a>
            {/* Which documents exist is the instance's decision, and one that
                publishes none must not show four dead links. */}
            {instance.legalDocuments.map(kind => (
                <NavLink key={kind} to={`/${kind}`} className={classes.footLink}>
                    {t(`legal.${kind}`)}
                </NavLink>
            ))}
        </div>
    );
};

const ActivityNavbar = (props: {
    collapsed: boolean,
    activity: Activity | undefined,
    /** What the reader holds **in this activity**, not anywhere. */
    permissions: string[],
}) => {
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
        // The way back into administering the activity being looked at. Scoped
        // to this one: holding `activity:update` somewhere else is not a reason
        // to offer a screen that would refuse.
        props.permissions.includes("activity:update")
            && { to: `/manager/activities/${activity.id}`, label: t("Manage this activity"), icon: IconSettings },
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
    const { session } = useAuth();
    return (
        <UnstyledButton mx="xl" {...props} className={classes.user}>
            <Group>
                <div style={{ flex: 1 }}>
                    <Text size="sm" fw={500}>
                        {session ? displayName(session) : ""}
                    </Text>

                    <Text c="dimmed" size="xs">
                        {session?.username}
                    </Text>
                </div>

                <IconChevronDown size={14} stroke={1.5} />
            </Group>
        </UnstyledButton>
    );
}

const UserMenu = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { signOut } = useAuth();
    return (
        <Menu shadow="md" width={220}>
            <Menu.Target>
                <UserButton />
            </Menu.Target>

            <Menu.Dropdown>
                <Menu.Item leftSection={<IconUser size={14} />} onClick={() => navigate("/account")}>
                    {t("My account")}
                </Menu.Item>
                {/* Ends the session on the Server, not only in this tab: the
                    entry used to have no handler at all. */}
                <Menu.Item
                    leftSection={<IconLogout size={14} />}
                    onClick={() => void signOut().then(() => navigate("/login", { replace: true }))}
                >
                    {t("Logout")}
                </Menu.Item>
            </Menu.Dropdown>
        </Menu>
    );
}

/**
 * The instance's mark, at the top of the navigation.
 *
 * The operator's logo where they have set one, and the placeholder that ships
 * with the software where they have not — so an unconfigured instance says so
 * instead of quietly wearing the product's own face. Absent entirely when the
 * operator turned the mark off.
 */
const InstanceMark = ({ collapsed }: { collapsed: boolean }) => {
    const { logoUrl } = useInstance();
    if (!logoUrl) return null;
    return (
        <>
            {/* In a light box, because a logo is drawn for paper: on the
                navigation's own colour an operator's mark disappears. Seventy per
                cent of the width, centred, so it reads without dominating. */}
            <NavLink to="/" className={classes.mark} data-collapsed={collapsed || undefined}>
                <Image src={logoUrl} alt="" fit="contain" h={collapsed ? 36 : 72} w="80%" mx="auto" />
            </NavLink>
            <Divider my="md" className={classes.divider} />
        </>
    );
};

export default function AppLayout() {
    const { t } = useTranslation();
    const { hasAny } = usePermissions();
    const [opened, { toggle }] = useDisclosure();
    const [collapsed, collapse] = useDisclosure();
    // Matched on the participant route rather than read from any parameter named
    // `activityId`: the manager screens use that name too, and the participant
    // shell must not appear over them.
    const participantRoute = useMatch({ path: "/activities/:activityId", end: false });
    const activityId = participantRoute?.params.activityId;

    // Loaded once here and shared by the sidebar and the clock, so entering an
    // activity does not fetch it twice.
    const [activity, setActivity] = useState<Activity | undefined>(undefined);
    const [series, setSeries] = useState<Series[]>([]);
    const [activityPermissions, setActivityPermissions] = useState<string[]>([]);

    useApiEffect(async (api) => {
        if (!activityId) {
            setActivity(undefined);
            setSeries([]);
            setActivityPermissions([]);
            return;
        }
        const loaded = await api.participantApi.getActivity(activityId);
        setActivity(loaded);
        setSeries(await api.participantApi.getSeries(loaded.id));
        // Asked per activity, because a grant is per activity: what somebody may
        // do in the one they are looking at is the only question the sidebar of
        // that activity should ask.
        setActivityPermissions(await api.managerApi.getMyPermissions(loaded.id));
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
    }, [activityId]);

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

            {/* Three parts, because the middle one is the only part that may
                grow without limit: the manager panel offers a dozen entries and
                an activity its own list on top of them, and on a short window
                they simply ran off the bottom with no way to reach them. The
                mark and the foot links stay put; what is between them scrolls. */}
            <AppShell.Navbar p="md" className={classes.navbar}>
                <AppShell.Section>
                    <InstanceMark collapsed={collapsed} />
                </AppShell.Section>

                <AppShell.Section grow component={ScrollArea} type="auto" scrollbarSize={6}>
                    <ActivityNavbar collapsed={collapsed} activity={activity} permissions={activityPermissions} />
                    <ManagerNavbar collapsed={collapsed} />
                    <NavbarLink to={`/`} label={t("Home")} icon={IconHome} collapsed={collapsed} />
                    <NavbarLink to={`/activities`} label={t("Activities")} icon={IconListDetails} collapsed={collapsed} />
                    {/* The only way into the panel from the shell — there was
                        none at all before — and offered only where there is
                        something in it for this person. */}
                    {hasAny(MANAGER_PERMISSIONS) && (
                        <NavbarLink to={`/manager`} label={t("Manager")} icon={IconSettings} collapsed={collapsed} />
                    )}
                </AppShell.Section>

                <AppShell.Section>
                    <Divider my="md" className={classes.divider} />
                    {CollapseButton}
                    <FootLinks collapsed={collapsed} />
                </AppShell.Section>
            </AppShell.Navbar>

            <AppShell.Main>
                {/* One boundary for every lazily loaded route, rather than one
                    per screen that each has to remember to add. */}
                <Suspense fallback={<Center my="xl"><Loader size="xl" /></Center>}>
                    <Outlet />
                </Suspense>
            </AppShell.Main>
        </AppShell>
    );
}
