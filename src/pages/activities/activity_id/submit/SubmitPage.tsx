import { Alert, Button, Card, Center, FileInput, Group, Loader, Select, Stack, Text, Title } from "@mantine/core";
import { IconAlertCircle, IconSend, IconX } from "@tabler/icons-react";
import { lazy, Suspense, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { Activity, ProblemDetail, Series } from "../../../../api/ParticipantApi";
import { useApiCall, useApiEffect } from "../../../../provider/ApiProvider";
import { sha256 } from "../../../../utils/sha256";
import LoadState from "../../../../components/LoadState";

// Monaco is large and only this screen and the source preview need it, so it is
// split out of the main bundle rather than paid for on every page load.
const CodeEditor = lazy(() => import("../../../../components/editor/CodeEditor"));

const formatBytes = (bytes: number) => `${Math.round(bytes / 1024 / 1024)} MB`;

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

export default function SubmitPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const call = useApiCall();
    const { activityId, problemId } = useParams();

    const [activity, setActivity] = useState<Activity | undefined>(undefined);
    const [series, setSeries] = useState<Series[] | undefined>(undefined);
    const [problem, setProblem] = useState<ProblemDetail | undefined>(undefined);

    const [language, setLanguage] = useState<string | null>(null);
    const [code, setCode] = useState("");
    const [file, setFile] = useState<File | null>(null);
    const [error, setError] = useState<string | undefined>(undefined);
    const [sending, setSending] = useState(false);

    const loadError = useApiEffect(async (api) => {
        if (!activityId) return;
        const activity = await api.participantApi.getActivity(activityId);
        setActivity(activity);
        setSeries(await api.participantApi.getSeries(activity.id));
        if (problemId) {
            const problem = await api.participantApi.getProblem(activity.id, problemId);
            setProblem(problem);
            setLanguage(problem.languages[0] ?? null);
        } else {
            setProblem(undefined);
        }
    }, [activityId, problemId]);

    // A problem change must not carry the previous problem's draft with it.
    useEffect(() => {
        setCode("");
        setFile(null);
        setError(undefined);
    }, [problemId]);

    // The picker shows only when the route carries no problem. Rendering it
    // whenever `problem` is still undefined flashed the whole list for one frame
    // on the way to a form that already knew which problem it was for.
    //
    // Matching the slug rather than testing for presence also covers moving from
    // one problem to another, where the previous one is still in state.
    if (!activity || !series || (problemId && problem?.slug !== problemId)) {
        return <LoadState error={loadError} loading={!loadError} />;
    }

    if (!problem) {
        return (
            <Stack gap="md">
                <Title>{t("Submit")}</Title>
                <ProblemPicker series={series} onPick={slug => navigate(`/activities/${activity.slug}/submit/${slug}`)} />
            </Stack>
        );
    }

    const wantsFile = problem.submitFields.some(f => f.kind === "file");
    const wantsCode = problem.submitFields.some(f => f.kind === "code");

    // First field wins. Whichever the participant starts filling locks the
    // other, so a submission never carries two sources and the Client never has
    // to guess which one was meant.
    const fileLocked = code.trim().length > 0;
    const codeLocked = file !== null;

    const accept = problem.submitFields.find(f => f.kind === "file")?.accept;

    const validate = (): string | undefined => {
        if (!language) return t("Choose a programming language");
        if (!file && code.trim().length === 0) return t("Provide a solution: paste the code or attach a file");
        if (file) {
            if (file.size === 0) return t("The selected file is empty");
            if (file.size > problem.maxUploadBytes) {
                return t("The file is larger than the limit of {{limit}}", { limit: formatBytes(problem.maxUploadBytes) });
            }
            if (accept && accept.length > 0) {
                const name = file.name.toLowerCase();
                if (!accept.some(ext => name.endsWith(ext.toLowerCase()))) {
                    return t("Allowed file types: {{list}}", { list: accept.join(", ") });
                }
            }
        } else if (new Blob([code]).size > problem.maxUploadBytes) {
            return t("The solution is larger than the limit of {{limit}}", { limit: formatBytes(problem.maxUploadBytes) });
        }
        return undefined;
    };

    const send = async () => {
        const problems = validate();
        if (problems) {
            setError(problems);
            return;
        }
        setError(undefined);
        setSending(true);
        try {
            // The checksum is computed over exactly what is being sent, here,
            // where the bytes are. The Server recomputes it and refuses a
            // mismatch, so a truncated upload fails instead of being judged.
            const checksum = file ? await sha256(file) : await sha256(new TextEncoder().encode(code));
            const submission = await call(api => api.participantApi.submit(activity.id, problem.slug, {
                language: language ?? undefined,
                code: file ? undefined : code,
                file: file ?? undefined,
                sha256: checksum,
            }));
            // Straight to the detail view, so the queued state is visible rather
            // than something the participant has to go looking for.
            navigate(`/activities/${activity.slug}/submissions/${submission.id}`);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
            setSending(false);
        }
    };

    return (
        <Stack gap="md">
            <Stack gap={2}>
                <Text size="sm" c="dimmed">{activity.name}</Text>
                <Title>[{problem.slug}] {problem.name}</Title>
            </Stack>

            {problem.submissionsLeft !== undefined && problem.submissionsLeft <= 3 && (
                <Alert color="yellow" icon={<IconAlertCircle size={18} />}>
                    {t("Submissions left")}: {problem.submissionsLeft}
                </Alert>
            )}

            <Group align="flex-start" grow wrap="wrap">
                <Select
                    label={t("Programming language")}
                    description={t("Select the language your solution is written in")}
                    data={problem.languages.map(l => ({ value: l, label: l }))}
                    value={language}
                    onChange={setLanguage}
                    allowDeselect={false}
                />
                {wantsFile && (
                    <FileInput
                        label={t("Solution file")}
                        description={codeLocked
                            ? t("Clear the file to use the editor instead")
                            : t("Up to {{limit}}", { limit: formatBytes(problem.maxUploadBytes) })}
                        placeholder={t("Choose a file")}
                        accept={accept?.join(",")}
                        value={file}
                        onChange={setFile}
                        disabled={fileLocked}
                        clearable
                        rightSection={file && <IconX size={16} onClick={() => setFile(null)} style={{ cursor: "pointer" }} />}
                    />
                )}
            </Group>

            {wantsCode && (
                <Stack gap={4}>
                    <Text size="sm" fw={500}>{t("Source code")}</Text>
                    {codeLocked && (
                        <Text size="xs" c="dimmed">{t("A file is attached, so the editor is disabled")}</Text>
                    )}
                    <Suspense fallback={<Center h={420}><Loader /></Center>}>
                        <CodeEditor
                            value={code}
                            onChange={setCode}
                            language={language ?? undefined}
                            readOnly={codeLocked}
                        />
                    </Suspense>
                </Stack>
            )}

            {error && (
                <Alert color="red" icon={<IconAlertCircle size={18} />}>{error}</Alert>
            )}

            <Group justify="flex-end">
                <Button
                    size="md"
                    loading={sending}
                    onClick={send}
                    rightSection={<IconSend size={18} />}
                >
                    {t("Send")}
                </Button>
            </Group>
        </Stack>
    );
}
