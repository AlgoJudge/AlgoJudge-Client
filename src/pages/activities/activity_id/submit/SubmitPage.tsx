import { Button, Card, Group, Stack, Text, Title } from "@mantine/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Activity, ProblemDetail, Series } from "../../../../api/ParticipantApi";
import { useApiEffect } from "../../../../provider/apiContext";
import LoadState from "../../../../components/LoadState";
import SubmissionForm from "../../../../components/submission/SubmissionForm";

/** Shown when the route carries no problem, so submitting still has a way in. */
const ProblemPicker = ({ series, onPick }: { series: Series[]; onPick: (slug: string) => void }) => {
    const { t } = useTranslation();
    const open = series.filter(s => s.isOpen);
    if (open.length === 0) {
        return <Text c="dimmed">{t("No problems are open for submission right now")}</Text>;
    }
    return (
        <Stack gap="md">
            <Text>{t("Choose a problem to submit")}</Text>
            {open.map(s => (
                <Card key={s.id} withBorder radius="sm">
                    <Title order={4} mb="xs">{s.name}</Title>
                    <Group gap="xs">
                        {(s.problems ?? []).map(p => (
                            <Button key={p.id} variant="light" onClick={() => onPick(p.slug)}>
                                [{p.slug}] {p.name}
                            </Button>
                        ))}
                    </Group>
                </Card>
            ))}
        </Stack>
    );
};

/**
 * The submit screen.
 *
 * Owns the route, the loading and the picker; the form itself is
 * `components/submission/SubmissionForm`, shared with the modal the submissions
 * panel opens — the rules about what may be sent are worth having once.
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

    if (!problem) {
        return (
            <Stack gap="md">
                <Title>{t("Submit")}</Title>
                <ProblemPicker series={series} onPick={slug => navigate(`/activities/${activity.slug}/submit/${slug}`)} />
            </Stack>
        );
    }

    return (
        <Stack gap="md">
            <Stack gap={2}>
                <Text size="sm" c="dimmed">{activity.name}</Text>
                <Title>[{problem.slug}] {problem.name}</Title>
            </Stack>

            <SubmissionForm
                activity={activity}
                problem={problem}
                series={series}
                // Straight to the detail view, so the queued state is visible
                // rather than something the participant has to go looking for.
                onSent={submission => navigate(`/activities/${activity.slug}/submissions/${submission.id}`)}
            />
        </Stack>
    );
}
