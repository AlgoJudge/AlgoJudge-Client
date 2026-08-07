import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { SeriesChange } from "../../api/ParticipantApi";
import { useApiEffect } from "../../provider/apiContext";

/**
 * What happened while somebody was looking at something else.
 *
 * A round opens, ends, is stopped or moved, and a verdict arrives — and until
 * now the screen changed quietly underneath the reader. These say so, from the
 * corner, and take them where it happened.
 *
 * **Only the activity being looked at.** Somebody solving a contest does not
 * want a course's round opening over their statement, and the shell knows which
 * activity that is because it already loaded it for the navigation.
 *
 * Raised here rather than in each screen: a participant moving between the
 * problem list and a statement must not be told the same thing twice, and a
 * screen that happens to be unmounted must not swallow it.
 */
export interface ActivityNotificationsProps {
    /**
     * The activity being looked at, as its two identifiers rather than the whole
     * object: the shell replaces that object whenever anything about the
     * activity changes, and re-subscribing every time would drop whatever
     * arrived in the gap. Absent outside an activity, where nothing is
     * announced.
     */
    activityId?: string;
    slug?: string;
}

/** What each kind of change says, and what colour carries it. */
const SERIES_MESSAGE: Record<SeriesChange, { key: string, colour: string }> = {
    opened: { key: "series.opened", colour: "teal" },
    closed: { key: "series.closed", colour: "gray" },
    paused: { key: "series.paused", colour: "orange" },
    resumed: { key: "series.resumed", colour: "teal" },
    rescheduled: { key: "series.rescheduled", colour: "blue" },
};

export default function ActivityNotifications({ activityId, slug }: ActivityNotificationsProps) {
    const { t } = useTranslation();
    const navigate = useNavigate();

    useApiEffect(async (api) => {
        if (!activityId || !slug) return;

        /** Clickable, and keyed so a burst of the same thing replaces itself. */
        const show = (key: string, colour: string, title: string, message: string, to: string) =>
            notifications.show({
                id: key,
                color: colour,
                title,
                message,
                autoClose: 8000,
                style: { cursor: "pointer" },
                onClick: () => {
                    notifications.hide(key);
                    navigate(to);
                },
            });

        api.participantApi.eventDispatcher.addEventListener("seriesChanged", evt => {
            if (evt.data.activityId !== activityId) return;
            const { series, change } = evt.data;
            const said = SERIES_MESSAGE[change];
            // An unknown change from a newer Server says nothing rather than
            // showing a notification with a translation key in it.
            if (!said) return;
            show(
                `series-${series.id}`,
                said.colour,
                series.name,
                t(said.key),
                `/activities/${slug}/problems`,
            );
        });

        api.participantApi.eventDispatcher.addEventListener("submissionStateChanged", evt => {
            if (evt.data.activityId !== activityId) return;
            const submission = evt.data.submission;
            // Only a verdict. A submission moving from queued to running is the
            // list's business, not something to interrupt anybody for.
            if (submission.state !== "completed" && submission.state !== "failed") return;
            const scored = submission.score !== undefined
                ? `${submission.verdict ?? ""} ${submission.score}/${submission.maxScore ?? 100}`.trim()
                : submission.verdict ?? t("Evaluated");
            show(
                `submission-${submission.id}`,
                submission.state === "failed" || submission.score === 0 ? "red"
                    : submission.score === submission.maxScore ? "teal" : "yellow",
                `[${submission.problemSlug}] ${submission.problemName}`,
                scored,
                `/activities/${slug}/submissions/${submission.id}`,
            );
        });
    }, [activityId, slug, navigate, t]);

    return null;
}
