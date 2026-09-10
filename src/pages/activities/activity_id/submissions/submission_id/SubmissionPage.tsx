import { Button, Group, Modal, Stack, Title } from "@mantine/core";
import { IconFileText } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Activity, SubmissionDetail } from "../../../../../api/ParticipantApi";
import LoadState from "../../../../../components/LoadState";
import SourceView from "../../../../../components/submission/SourceView";
import SubmissionView from "../../../../../components/submission/SubmissionView";
import { useApiEffect } from "../../../../../provider/apiContext";

/**
 * One submission, as a screen.
 *
 * Owns the route, the activity and the way back; the submission itself is
 * `components/submission/SubmissionView`, shared with the panel's modal.
 *
 * **The source is a modal even here.** It was a screen of its own until
 * 2026-09-10, which meant reading your own code cost whatever you were reading
 * it against. What differs from the panel's window is only what follows a
 * resubmission: from a screen it is another screen.
 */
export default function SubmissionPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { activityId, submissionId } = useParams();

    const [activity, setActivity] = useState<Activity | undefined>(undefined);
    /** The submission whose source is open, and the whole of "is it open". */
    const [source, setSource] = useState<SubmissionDetail | undefined>(undefined);

    const error = useApiEffect(async (api) => {
        if (!activityId) return;
        setActivity(await api.participantApi.getActivity(activityId));
    }, [activityId]);

    if (!activity || !submissionId) {
        return <LoadState error={error} loading={!error} />;
    }

    return (
        <Stack gap="md">
            <Group>
                <Button data-testid="back" variant="default" onClick={() => navigate(-1)}>{t("Back")}</Button>
            </Group>

            <SubmissionView
                activity={activity}
                submissionId={submissionId}
                onShowCode={setSource}
                actions={submission => (
                    <Button
                        variant="light"
                        component={Link}
                        to={`/activities/${activity.slug}/problems/${submission.problemSlug}`}
                        leftSection={<IconFileText size={16} />}
                    >
                        {t("Problem")}
                    </Button>
                )}
            />

            <Modal
                opened={source !== undefined}
                onClose={() => setSource(undefined)}
                title={<Title order={4}>{t("Source code")}</Title>}
                // The same width the panel's window uses, and for the same
                // reason: a solution read in a column the width of a dialog is
                // worse than the screen this replaces.
                size="min(1100px, 92vw)"
                centered
            >
                {source && (
                    <SourceView
                        activity={activity}
                        submission={source}
                        onResubmitted={created => {
                            setSource(undefined);
                            navigate(`/activities/${activity.slug}/submissions/${created.id}`);
                        }}
                    />
                )}
            </Modal>
        </Stack>
    );
}
