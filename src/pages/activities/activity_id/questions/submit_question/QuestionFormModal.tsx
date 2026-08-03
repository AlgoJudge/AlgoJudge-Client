import { Alert, Button, Group, Modal, Select, Stack, TextInput, Textarea, Title } from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Series } from "../../../../../api/ParticipantApi";
import { useApiCall } from "../../../../../provider/ApiProvider";

export interface QuestionFormModalProps {
    activityId: string;
    series: Series[];
    onCreated: () => void;
}

/**
 * Asking a question.
 *
 * There is no group selector: everything here is within one activity, so the
 * only useful narrowing is which problem it concerns — and that is optional,
 * because a question about the rules concerns none of them.
 */
export default function QuestionFormModal({ activityId, series, onCreated }: QuestionFormModalProps) {
    const { t } = useTranslation();
    const call = useApiCall();

    const [opened, setOpened] = useState(false);
    const [topic, setTopic] = useState("");
    const [body, setBody] = useState("");
    const [problemId, setProblemId] = useState<string | null>(null);
    const [error, setError] = useState<string | undefined>(undefined);
    const [sending, setSending] = useState(false);

    // A problem in a series that has not opened is not something a participant
    // can have read, so it cannot be asked about either.
    const problems = series
        .filter(s => s.isOpen)
        .flatMap(s => (s.problems ?? []).map(p => ({
            value: p.id,
            label: `[${p.slug}] ${p.name}`,
            group: s.name,
        })));

    const close = () => {
        setOpened(false);
        setError(undefined);
    };

    const send = async () => {
        if (topic.trim().length === 0 || body.trim().length === 0) {
            setError(t("Give the question a topic and a body"));
            return;
        }
        setSending(true);
        setError(undefined);
        try {
            await call(api => api.participantApi.askQuestion(activityId, {
                topic: topic.trim(),
                body: body.trim(),
                problemId: problemId ?? undefined,
            }));
            setTopic("");
            setBody("");
            setProblemId(null);
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
                    <Select
                        label={t("Problem")}
                        description={t("Leave empty for a general question")}
                        placeholder={t("General")}
                        data={problems}
                        value={problemId}
                        onChange={setProblemId}
                        searchable
                        clearable
                    />
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
