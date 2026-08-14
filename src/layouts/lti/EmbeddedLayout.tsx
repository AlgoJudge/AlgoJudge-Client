import { Anchor, Center, Group, Loader, Text } from "@mantine/core";
import { IconExternalLink } from "@tabler/icons-react";
import { Suspense, useState } from "react";
import { useTranslation } from "react-i18next";
import { NavLink, Outlet, useMatch } from "react-router-dom";
import { Activity } from "../../api/ParticipantApi";
import { useApiEffect } from "../../provider/apiContext";
import { useLaunch } from "../../provider/launchContext";
import { activityLinks, leavingTheActivity, withinTheActivity } from "../activityLinks";
import classes from "./EmbeddedLayout.module.css";

/**
 * The interface a learner meets inside a course page.
 *
 * §5.2 asks for three things and this is all three: navigation **confined to the
 * launched activity** with no route out of it, the chrome that belongs to the
 * platform removed — no instance header, no footer, no legal links, because
 * Moodle already draws its own around this frame — and the mode entered from how
 * the session was established rather than from the address.
 *
 * <b>It cannot grow.</b> Measured 2026-08-13: Moodle implements no
 * `lti.frameResize`, and no `postMessage` at all in `mod/lti`, in any supported
 * version. The height is whatever the teacher typed into the activity's
 * settings, so the chrome is one row and the content scrolls inside itself.
 */
export default function EmbeddedLayout() {
    const { t } = useTranslation();
    const { launch } = useLaunch();

    // From the route when there is one, and from the launch otherwise — the
    // landing redirect goes to the activity, so both agree; the launch is what
    // answers before the first navigation has happened.
    const route = useMatch({ path: "/activities/:activityId", end: false });
    const slug = route?.params.activityId ?? launch?.activitySlug;

    const [activity, setActivity] = useState<Activity | undefined>(undefined);
    const [permissions, setPermissions] = useState<string[]>([]);

    useApiEffect(async (api) => {
        if (!slug) {
            setActivity(undefined);
            setPermissions([]);
            return;
        }
        const loaded = await api.participantApi.getActivity(slug);
        setActivity(loaded);
        // Per activity, because a grant is per activity: what somebody may do in
        // the one they were launched into is the only question this asks.
        setPermissions(await api.managerApi.getMyPermissions(loaded.id));
    }, [slug]);

    const links = activity ? activityLinks(activity, permissions, t) : [];
    const inside = withinTheActivity(links);
    const outside = leavingTheActivity(links);

    return (
        <div className={classes.shell}>
            <div className={classes.bar}>
                <Text fw={600} size="sm" className={classes.course}>
                    {/* The course as the platform calls it, then the activity.
                        Somebody in a frame has lost the page around them and
                        should not have to guess which course this is. */}
                    {launch?.contextTitle ?? activity?.name ?? ""}
                </Text>

                <nav className={classes.links} aria-label={t("Activity")}>
                    {inside.map(link => (
                        <NavLink
                            key={link.to}
                            to={link.to}
                            end
                            className={({ isActive }) =>
                                isActive ? `${classes.link} ${classes.active}` : classes.link}
                        >
                            <link.icon size={16} stroke={1.5} />
                            <span>{link.label}</span>
                        </NavLink>
                    ))}
                </nav>

                <Group gap="xs" wrap="nowrap">
                    {/* §5.2 — a manager's configuration work opens in a window
                        with the full interface, because placing an activity and
                        publishing versions are not things to do through a course
                        page in a frame. */}
                    {outside.map(link => (
                        <Anchor
                            key={link.to}
                            href={link.to}
                            target="_blank"
                            rel="noopener noreferrer"
                            size="sm"
                            className={classes.link}
                        >
                            <IconExternalLink size={16} stroke={1.5} />
                            <span>{link.label}</span>
                        </Anchor>
                    ))}
                    {launch?.returnUrl && (
                        // Back to the course, when the platform offered
                        // somewhere. `_top` rather than the frame: the course
                        // page is what the frame is inside of, and loading it
                        // into the frame would nest Moodle in itself.
                        <Anchor
                            href={launch.returnUrl}
                            target="_top"
                            size="sm"
                            className={classes.link}
                        >
                            {t("Back to the course")}
                        </Anchor>
                    )}
                </Group>
            </div>

            <div className={classes.content}>
                <Suspense fallback={<Center my="xl"><Loader /></Center>}>
                    <Outlet />
                </Suspense>
            </div>
        </div>
    );
}
