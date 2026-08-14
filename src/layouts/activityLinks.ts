import { Icon, IconBox, IconChartBarPopular, IconHome, IconMessageQuestion, IconNotes, IconPackageExport, IconProps, IconSectionSign, IconSettings } from "@tabler/icons-react";
import { ComponentType } from "react";
import { Activity } from "../api/ParticipantApi";
import { hasDocument } from "../api/activityDocuments";

export interface ActivityLink {
    to: string;
    label: string;
    icon: ComponentType<IconProps & React.RefAttributes<Icon>>;
    /**
     * Leaves the activity. The full interface renders it like any other link;
     * the embedded one opens it in a new tab, because §5.2 says a manager's
     * configuration work belongs in a window with the whole application rather
     * than inside a course page's frame.
     */
    leavesTheActivity?: boolean;
}

/**
 * Everything one activity offers the person looking at it.
 *
 * <b>Shared by both shells on purpose, and it is the shape that makes the
 * embedded one safe.</b> §5.2 requires a launched interface confined to the
 * launched activity — no instance shell, no activity list, no route out — and
 * the way to guarantee that is not vigilance but ignorance: this function is
 * given an activity and knows about nothing else, so no amount of editing it can
 * add a link to the front page. A shell that built its own list would drift, and
 * the drift would be a way out of the confinement nobody noticed.
 */
export const activityLinks = (
    activity: Activity,
    permissions: string[],
    t: (key: string) => string,
): ActivityLink[] => {
    const base = `/activities/${activity.slug}`;

    // Somebody not in the activity gets its name and the way to manage it if
    // they may, and nothing else: offering Submit to somebody who is not
    // enrolled offers a screen that will refuse.
    const enrolled = activity.membership === "enrolled";

    const candidates: (ActivityLink | false | undefined)[] = [
        // Only where somebody wrote the page. An entry leading to a blank page
        // is worse than no entry.
        enrolled && hasDocument(activity.documents, "home")
            ? { to: base, label: t("Activity page"), icon: IconHome } : undefined,
        enrolled ? { to: `${base}/problems`, label: t("Problems"), icon: IconNotes } : undefined,
        enrolled ? { to: `${base}/submit`, label: t("Submit"), icon: IconPackageExport } : undefined,
        enrolled ? { to: `${base}/submissions`, label: t("My submissions"), icon: IconBox } : undefined,
        // From who may see scores rather than from a switch beside it. Withheld
        // only where nobody but a manager may see one.
        enrolled && activity.scoreVisibility !== "managersOnly"
            ? { to: `${base}/ranking`, label: t("Ranking"), icon: IconChartBarPopular } : undefined,
        enrolled && activity.modules.questions
            ? { to: `${base}/questions`, label: t("Questions and announcements"), icon: IconMessageQuestion } : undefined,
        // From the reference rather than a module flag: whether there are rules
        // is whether somebody published any.
        hasDocument(activity.documents, "rules")
            ? { to: `${base}/rules`, label: t("Rules"), icon: IconSectionSign } : undefined,
        // Scoped to this activity: holding `activity:update` somewhere else is
        // not a reason to offer a screen that would refuse.
        permissions.includes("activity:update")
            ? {
                to: `/manager/activities/${activity.slug}`,
                label: t("Manage this activity"),
                icon: IconSettings,
                leavesTheActivity: true,
            } : undefined,
    ];

    return candidates.filter((link): link is ActivityLink => Boolean(link));
};

/** Named so a shell cannot accidentally offer one; used by the embedded shell. */
export const withinTheActivity = (links: ActivityLink[]): ActivityLink[] =>
    links.filter(link => !link.leavesTheActivity);

export const leavingTheActivity = (links: ActivityLink[]): ActivityLink[] =>
    links.filter(link => link.leavesTheActivity);
