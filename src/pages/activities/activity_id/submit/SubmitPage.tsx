import { Button, Group, Stack, Text, Title } from "@mantine/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Activity, ProblemDetail, Series } from "../../../../api/ParticipantApi";
import { useApiEffect } from "../../../../provider/apiContext";
import LoadState from "../../../../components/LoadState";
import ProblemChoice from "../../../../components/submission/ProblemChoice";
import SubmissionForm from "../../../../components/submission/SubmissionForm";

/**
 * The submit screen.
 *
 * Owns the route and the loading; the choice of problem and the form itself are
 * `components/submission/ProblemChoice` and `SubmissionForm`, shared with the
 * modal the submissions panel opens — the rules about what may be sent are worth
 * having once.
 *
 * **Choosing a problem is still a navigation**, unlike in the modal, where it
 * happens in place. On a screen the address says which problem this is, so a
 * link to it can be sent and a reload comes back to the same form.
 */
export default function SubmitPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { activityId, problemId } = useParams();

    const [activity, setActivity] = useState<Activity | undefined>(undefined);
    const [series, setSeries] = useState<Series[] | undefined>(undefined);
    const [problem, setProblem] = useState<ProblemDetail | undefined>(undefined);

    const loadError = useApiEffect(async (api) => {
        if (!activityId) return;
        const activity = await api.participantApi.getActivity(activityId);
        setActivity(activity);
        setSeries(await api.participantApi.getSeries(activity.id));
        if (problemId) {
            setProblem(await api.participantApi.getProblem(activity.id, problemId));
        } else {
            setProblem(undefined);
        }
    }, [activityId, problemId]);

    // The picker shows only when the route carries no problem. Rendering it
    // whenever `problem` is still undefined flashed the whole list for one frame
    // on the way to a form that already knew which problem it was for.
    //
    // Matching the slug rather than testing for presence also covers moving from
    // one problem to another, where the previous one is still in state.
    if (!activity || !series || (problemId && problem?.slug !== problemId)) {
        return <LoadState error={loadError} loading={!loadError} />;
    }

    // **The Server refuses this, so the page says so rather than drawing a form
    // that cannot work.** The navigation has never offered Submit to somebody
    // who is not enrolled; the address stayed reachable by hand.
    if (activity.membership !== "enrolled") {
        return (
            <Stack gap="md">
                <Title>{t("Submit")}</Title>
                <Text c="dimmed">
                    {t("Only somebody enrolled in this activity may submit to it.")}
                </Text>
                <Group>
                    <Button component={Link} to={`/activities/${activity.slug}`}>
                        {t("Go to the activity")}
                    </Button>
                </Group>
            </Stack>
        );
    }

    return (
        <Stack gap="md">
            <Stack gap={2}>
                <Text size="sm" c="dimmed">{activity.name}</Text>
                <Title>{problem ? `[${problem.slug}] ${problem.name}` : t("Submit")}</Title>
            </Stack>

            {/* Above the form and always drawn, as the modal has it, so the
                problem can be changed without going back for a list. */}
            <ProblemChoice
                series={series}
                value={problemId ?? null}
                onChange={slug => navigate(slug
                    ? `/activities/${activity.slug}/submit/${slug}`
                    : `/activities/${activity.slug}/submit`)}
            />

            {problem && <SubmissionForm
                activity={activity}
                problem={problem}
                series={series}
                // Straight to the detail view, so the queued state is visible
                // rather than something the participant has to go looking for.
                onSent={submission => navigate(`/activities/${activity.slug}/submissions/${submission.id}`)}
            />}
        </Stack>
    );
}
