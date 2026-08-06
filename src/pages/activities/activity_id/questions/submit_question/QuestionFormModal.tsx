import { Alert, Button, Group, Modal, SegmentedControl, Select, Stack, TextInput, Textarea, Title } from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Series } from "../../../../../api/ParticipantApi";
import { useApiCall } from "../../../../../provider/apiContext";

export interface QuestionFormModalProps {
    activityId: string;
    series: Series[];
    onCreated: () => void;
}

/**
 * Asking a question.
 *
 * A question is about **one** of three things: the activity at large, one
 * series, or one problem. The mock-up called a series a "group" and offered it
 * as a free-text field; it is a real scope, and choosing it is the first thing
 * the form asks — because it decides who ends up reading the question.
 */

type Scope = "activity" | "series" | "problem";
export default function QuestionFormModal({ activityId, series, onCreated }: QuestionFormModalProps) {
    const { t } = useTranslation();
    const call = useApiCall();

    const [opened, setOpened] = useState(false);
    const [topic, setTopic] = useState("");
    const [body, setBody] = useState("");
    const [scope, setScope] = useState<Scope>("activity");
    const [seriesId, setSeriesId] = useState<string | null>(null);
    const [problemId, setProblemId] = useState<string | null>(null);
    const [error, setError] = useState<string | undefined>(undefined);
    const [sending, setSending] = useState(false);

    // A problem in a series that has not opened is not something a participant
    // can have read, so it cannot be asked about either.
    //
    // Grouped the way Mantine expects: `{ group, items }`. A flat option with a
    // `group` key on it is read as a group whose `items` are missing, and the
    // component crashes trying to map over them.
    const problems = series
        .filter(s => s.isOpen)
        .map(s => ({
            group: s.name,
            items: (s.problems ?? []).map(p => ({
                value: p.id,
                label: `[${p.slug}] ${p.name}`,
            })),
        }))
        .filter(g => g.items.length > 0);

    // A series that has not opened holds nothing a participant has read, so it
    // cannot be asked about either.
    const openSeries = series.filter(s => s.isOpen);

    const close = () => {
        setOpened(false);
        setError(undefined);
    };

    const reset = (next: Scope) => {
        setScope(next);
        setSeriesId(null);
        setProblemId(null);
    };

    const send = async () => {
        if (topic.trim().length === 0 || body.trim().length === 0) {
            setError(t("Give the question a topic and a body"));
            return;
        }
        if (scope === "series" && !seriesId) {
            setError(t("Choose the series"));
            return;
        }
        if (scope === "problem" && !problemId) {
            setError(t("Choose the problem"));
            return;
        }
        setSending(true);
        setError(undefined);
        try {
            await call(api => api.participantApi.askQuestion(activityId, {
                topic: topic.trim(),
                body: body.trim(),
                // Exactly one of the two travels; the Server fills the series in
                // from the problem, so sending both would be two answers to one
                // question.
                seriesId: scope === "series" ? seriesId ?? undefined : undefined,
                problemId: scope === "problem" ? problemId ?? undefined : undefined,
            }));
            setTopic("");
            setBody("");
            reset("activity");
            setOpened(false);
            onCreated();
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setSending(false);
        }
    };

    return (
        <>
            <Button onClick={() => setOpened(true)} leftSection={<IconPlus size={16} />}>
                {t("Send question")}
            </Button>

            <Modal
                opened={opened}
                onClose={close}
                title={<Title order={4}>{t("Send question")}</Title>}
                size="lg"
                centered
            >
                <Stack gap="sm">
                    <SegmentedControl
                        fullWidth
                        value={scope}
                        onChange={value => reset(value as Scope)}
                        data={[
                            { value: "activity", label: t("Whole activity") },
                            { value: "series", label: t("Series") },
                            { value: "problem", label: t("Problem") },
                        ]}
                    />
                    {scope === "series" && (
                        <Select
                            label={t("Series")}
                            placeholder={t("Choose the series")}
                            data={openSeries.map(s => ({ value: s.id, label: s.name }))}
                            value={seriesId}
                            onChange={setSeriesId}
                            searchable
                            required
                        />
                    )}
                    {scope === "problem" && (
                        <Select
                            label={t("Problem")}
                            placeholder={t("Choose the problem")}
                            data={problems}
                            value={problemId}
                            onChange={setProblemId}
                            searchable
                            required
                        />
                    )}
                    <TextInput
                        label={t("Topic")}
                        value={topic}
                        onChange={e => setTopic(e.currentTarget.value)}
                        required
                    />
                    <Textarea
                        label={t("Question")}
                        value={body}
                        onChange={e => setBody(e.currentTarget.value)}
                        autosize
                        minRows={5}
                        required
                    />
                    {error && <Alert color="red">{error}</Alert>}
                    <Group justify="space-between">
                        <Button variant="default" onClick={close}>{t("Back")}</Button>
                        <Button loading={sending} onClick={send}>{t("Send")}</Button>
                    </Group>
                </Stack>
            </Modal>
        </>
    );
}
