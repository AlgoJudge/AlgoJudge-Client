import { Alert, Center, Loader, Modal, Select, Stack, Text, Title } from "@mantine/core";
import { IconAlertCircle } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Activity, ProblemDetail, Series } from "../../api/ParticipantApi";
import { maySubmit } from "../../api/seriesState";
import { useApi } from "../../provider/apiContext";
import SubmissionForm from "../submission/SubmissionForm";

export interface SubmitModalProps {
    activity: Activity;
    series: Series[];
    opened: boolean;
    onClose: () => void;
    /** The problem the reader is already looking at, where they are on one. */
    initialSlug?: string;
}

/**
 * Sending a solution without leaving the page.
 *
 * The submissions panel exists so a verdict can be watched from wherever
 * somebody is; sending still cost the trip to the submit screen and back. This
 * is the same form — `SubmissionForm`, shared with that screen — over a problem
 * picker, and it closes when the submission is away.
 *
 * **Nothing else happens on send.** No navigation, no reload: the reader goes
 * back to what they were reading. The panel behind it picks the submission up on
 * its own, because `submit` dispatches `submissionStateChanged` and the panel
 * listens for it.
 */
export default function SubmitModal({ activity, series, opened, onClose, initialSlug }: SubmitModalProps) {
    const { t } = useTranslation();
    const api = useApi();

    const [slug, setSlug] = useState<string | null>(initialSlug ?? null);
    const [problem, setProblem] = useState<ProblemDetail | undefined>(undefined);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | undefined>(undefined);

    // Only rounds that **accept** something. `maySubmit` rather than `isOpen`
    // alone, because that is the rule the Server applies: a round that has ended
    // is still readable and takes nothing, and offering its problems here would
    // be offering a form that is refused.
    const offered = series
        .filter(s => maySubmit(s))
        .map(s => ({
            group: s.name,
            // Grouped the way Mantine expects — `{ group, items }`. A flat option
            // carrying a `group` key is read as a group whose `items` are
            // missing, and the component crashes mapping over them.
            items: (s.problems ?? []).map(p => ({
                value: p.slug,
                label: `[${p.slug}] ${p.name}`,
            })),
        }))
        .filter(g => g.items.length > 0);

    const known = offered.some(g => g.items.some(i => i.value === slug));

    useEffect(() => {
        if (!opened) return;
        // Opening from a problem's own page starts on that problem; opening from
        // anywhere else starts on whatever the reader last chose, and on nothing
        // the first time.
        setSlug(current => initialSlug ?? current);
    }, [opened, initialSlug]);

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

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title={<Title order={4}>{t("Send a submission")}</Title>}
            // Wide: the code editor is in here, and a solution written in a
            // column the width of a dialog is worse than the trip this saves.
            // `xl` is 800px, which is not enough for one; capped against the
            // viewport so the page it sits over is still visible around it.
            size="min(1100px, 92vw)"
            centered
        >
            <Stack gap="md">
                {offered.length === 0 ? (
                    <Text c="dimmed">{t("No problems are open for submission right now")}</Text>
                ) : (
                    <Select
                        label={t("Problem")}
                        placeholder={t("Choose the problem")}
                        data={offered}
                        value={known ? slug : null}
                        onChange={setSlug}
                        searchable
                        required
                    />
                )}

                {error && (
                    <Alert color="red" icon={<IconAlertCircle size={18} />}>{error}</Alert>
                )}

                {loading && <Center h={120}><Loader /></Center>}

                {problem && !loading && (
                    <SubmissionForm
                        activity={activity}
                        problem={problem}
                        series={series}
                        onSent={onClose}
                    />
                )}
            </Stack>
        </Modal>
    );
}
