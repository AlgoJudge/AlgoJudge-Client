import { ActionIcon, Alert, Center, Group, Loader, Modal, Stack, Title } from "@mantine/core";
import { IconAlertCircle, IconArrowLeft } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Activity, ProblemDetail, Series, SubmissionDetail } from "../../api/ParticipantApi";
import { useApi } from "../../provider/apiContext";
import ProblemChoice from "../submission/ProblemChoice";
import { offers } from "../submission/problemsOnOffer";
import SourceView from "../submission/SourceView";
import SubmissionForm from "../submission/SubmissionForm";
import SubmissionView from "../submission/SubmissionView";

/**
 * What the window is showing. One at a time, in one window — a second modal over
 * the first would dim the page twice and leave the editor a dialog's width, and
 * `theme.ts` promises the browser checks that one modal is open at a time.
 */
type Stage =
    | { kind: "form" }
    | { kind: "submission"; id: string }
    | { kind: "code"; submission: SubmissionDetail };

export interface SubmissionModalProps {
    activity: Activity;
    series: Series[];
    opened: boolean;
    onClose: () => void;
    /** The problem the reader is already looking at, where they are on one. */
    initialSlug?: string;
    /** Opens straight on a submission rather than on the form. */
    initialSubmissionId?: string;
}

/**
 * Sending a solution, and reading what came of it, without leaving the page.
 *
 * The submissions panel exists so a verdict can be watched from wherever
 * somebody is. Everything it opened used to leave: sending closed this window,
 * and a row in the panel navigated away — so the statement being worked against,
 * which is the one thing worth keeping open, was the first thing to close.
 *
 * **Three stages in one window**: the form, the submission it created, and that
 * submission's source. Each is the same component the screens use —
 * `SubmissionForm`, `SubmissionView`, `SourceView` — so a modal and a screen
 * cannot come to disagree about what they show. What differs is only what
 * follows an action, which each host passes in.
 *
 * The address never changes here. A screen is reached as a screen; this is the
 * panel's half of that rule.
 */
export default function SubmissionModal({
    activity, series, opened, onClose, initialSlug, initialSubmissionId,
}: SubmissionModalProps) {
    const { t } = useTranslation();
    const api = useApi();

    const [stage, setStage] = useState<Stage>({ kind: "form" });
    /** Where the back arrow goes, one entry per hop taken inside the window. */
    const [trail, setTrail] = useState<Stage[]>([]);

    const [slug, setSlug] = useState<string | null>(initialSlug ?? null);
    const [problem, setProblem] = useState<ProblemDetail | undefined>(undefined);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | undefined>(undefined);

    const go = (next: Stage) => {
        setTrail(walked => [...walked, stage]);
        setStage(next);
    };

    const back = () => {
        setStage(trail[trail.length - 1] ?? { kind: "form" });
        setTrail(walked => walked.slice(0, -1));
    };

    // Opening decides the stage; hops inside the window do not go through here,
    // because neither of these changes while it is open.
    useEffect(() => {
        if (!opened) return;
        setTrail([]);
        setStage(initialSubmissionId
            ? { kind: "submission", id: initialSubmissionId }
            : { kind: "form" });
    }, [opened, initialSubmissionId]);

    useEffect(() => {
        if (!opened) return;
        // Opening from a problem's own page starts on that problem; opening from
        // anywhere else starts on whatever the reader last chose, and on nothing
        // the first time.
        setSlug(current => initialSlug ?? current);
    }, [opened, initialSlug]);

    const known = offers(series, slug);

    useEffect(() => {
        if (!opened || !slug || !known) {
            setProblem(undefined);
            return;
        }
        const controller = new AbortController();
        setLoading(true);
        setError(undefined);
        // Fetched rather than read off the round's summary: the languages, the
        // submit fields and the upload limit are the problem's own, and the form
        // cannot be drawn without them.
        api.participantApi.getProblem(activity.id, slug, controller.signal)
            .then(setProblem)
            .catch((e: unknown) => {
                if (controller.signal.aborted) return;
                setError(e instanceof Error ? e.message : String(e));
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });
        return () => controller.abort();
    }, [api, activity.id, slug, known, opened]);

    const heading = stage.kind === "form" ? t("Send a submission")
        : stage.kind === "submission" ? t("Submission")
            : t("Source code");

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title={
                <Group gap="xs" wrap="nowrap">
                    {trail.length > 0 && (
                        <ActionIcon
                            variant="subtle"
                            data-testid="modal-back"
                            aria-label={t("Back")}
                            onClick={back}
                        >
                            <IconArrowLeft size={18} />
                        </ActionIcon>
                    )}
                    <Title order={4}>{heading}</Title>
                </Group>
            }
            // Wide: the code editor is in here, and a solution written in a
            // column the width of a dialog is worse than the trip this saves.
            // `xl` is 800px, which is not enough for one; capped against the
            // viewport so the page it sits over is still visible around it.
            size="min(1100px, 92vw)"
            centered
        >
            {stage.kind === "form" && (
                <Stack gap="md">
                    <ProblemChoice series={series} value={slug} onChange={setSlug} />

                    {error && (
                        <Alert color="red" icon={<IconAlertCircle size={18} />}>{error}</Alert>
                    )}

                    {loading && <Center h={120}><Loader /></Center>}

                    {problem && !loading && (
                        <SubmissionForm
                            activity={activity}
                            problem={problem}
                            series={series}
                            // **The submission stays in the window.** It is
                            // queued when it arrives, and the same socket event
                            // the panel listens to turns that into a verdict
                            // while it is being watched.
                            onSent={submission => go({ kind: "submission", id: submission.id })}
                        />
                    )}
                </Stack>
            )}

            {stage.kind === "submission" && (
                <SubmissionView
                    activity={activity}
                    submissionId={stage.id}
                    heading={false}
                    onShowCode={submission => go({ kind: "code", submission })}
                />
            )}

            {stage.kind === "code" && (
                <SourceView
                    activity={activity}
                    submission={stage.submission}
                    // A resubmission is a new submission, so the window shows it
                    // rather than the source it was written from.
                    onResubmitted={created => go({ kind: "submission", id: created.id })}
                />
            )}
        </Modal>
    );
}
