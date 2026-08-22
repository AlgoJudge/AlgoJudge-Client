import { Alert, Button, Center, FileInput, Group, Loader, Select, Stack, Text } from "@mantine/core";
import { IconAlertCircle, IconSend, IconX } from "@tabler/icons-react";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Activity, ProblemDetail, Series, SubmissionSummary } from "../../api/ParticipantApi";
import { maySubmit, seriesState } from "../../api/seriesState";
import { useApiCall } from "../../provider/apiContext";
import { sha256 } from "../../utils/sha256";
import { submitRenderers } from "../../renderers";
import { KNOWN_LANGUAGES, languageLabel, pastedFileName } from "../editor/languages";
import { offeredLanguages } from "./offered";

// Monaco is large and only this form and the source preview need it, so it is
// split out of the main bundle rather than paid for on every page load.
const CodeEditor = lazy(() => import("../editor/CodeEditor"));

const formatBytes = (bytes: number) => `${Math.round(bytes / 1024 / 1024)} MB`;

export interface SubmissionFormProps {
    activity: Activity;
    problem: ProblemDetail;
    /** The rounds, to find the one holding this problem and ask whether it takes anything. */
    series: Series[];
    /**
     * What to do once it is sent. The submit screen goes to the submission; the
     * panel's modal closes and leaves the reader where they were.
     */
    onSent: (submission: SubmissionSummary) => void;
}

/**
 * Writing and sending one solution.
 *
 * Lifted out of the submit screen so the panel in the corner can offer the same
 * form without a second implementation of the rules below — which are the part
 * worth not writing twice: what counts as a valid submission, what the checksum
 * is computed over, and when a round stops accepting.
 */
export default function SubmissionForm({ activity, problem, series, onSent }: SubmissionFormProps) {
    const { t } = useTranslation();
    const call = useApiCall();

    // What the select offers: the assignment's `spec`, then its `config`, then
    // every id this build has a label for. See `offered.ts` — none of the three
    // is a permission, and the last one only happens where the assignment named
    // no languages at all, which the Runner reads as "accept anything I build".
    const offered = useMemo(() => {
        const named = offeredLanguages(problem.spec, problem.config);
        return named.length > 0
            ? named
            : KNOWN_LANGUAGES.map(id => ({ id, label: languageLabel(id) }));
    }, [problem.spec, problem.config]);

    const [language, setLanguage] = useState<string | null>(offered[0]?.id ?? null);
    const [code, setCode] = useState("");
    const [file, setFile] = useState<File | null>(null);
    const [error, setError] = useState<string | undefined>(undefined);
    const [sending, setSending] = useState(false);

    // A problem change must not carry the previous problem's draft with it —
    // which is now reachable without a route change, because the modal switches
    // problems in place.
    useEffect(() => {
        setCode("");
        setFile(null);
        setError(undefined);
        setLanguage(offered[0]?.id ?? null);
    }, [problem.slug, offered]);

    // The series this problem belongs to. A round that has not started, was
    // stopped, or has ended is refused here rather than by the Server after
    // somebody has written an answer.
    const holding = series.find(s => s.id === problem.seriesId);
    const state = holding ? seriesState(holding) : "open";
    const closed = holding !== undefined && !maySubmit(holding);
    // What this problem type asks for, resolved here rather than taken from the
    // Server — whose `submitFields` is one constant for every type, because it
    // is not allowed to understand a type's semantics. Its list is the fallback
    // for a type this build does not know.
    const asks = submitRenderers.resolve(problem.type).value;
    const wantsFile = asks ? asks.file !== false : problem.submitFields.some(f => f.kind === "file");
    const wantsCode = asks ? asks.code : problem.submitFields.some(f => f.kind === "code");
    const wantsLanguage = asks ? asks.language : true;

    // First field wins. Whichever the participant starts filling locks the
    // other, so a submission never carries two sources and the Client never has
    // to guess which one was meant.
    const fileLocked = code.trim().length > 0;
    const codeLocked = file !== null;

    const accept = asks && asks.file !== false
        ? asks.file.accept
        : problem.submitFields.find(f => f.kind === "file")?.accept;

    const validate = (): string | undefined => {
        if (wantsLanguage && !language) return t("Choose a programming language");
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
                // **One document the Server stores and never reads.** The
                // language is a member of it; the envelope names the type whose
                // vocabulary the rest of it is written in.
                //
                // Absent for a type that has no language: an answer file is not
                // written in one, and sending a made-up value would put it on a
                // submission for ever.
                props: wantsLanguage && language
                    ? { type: problem.type, language }
                    : { type: problem.type },
                code: file ? undefined : code,
                file: file ?? undefined,
                // **Only the sender can name pasted source.** The Server named
                // it from a table of seven languages until 2026-08-22, which
                // meant a Server release per language; a default of `main.txt`
                // in its place would be a name the Runner refuses for every
                // toolchain it has.
                fileName: file ? undefined : pastedFileName(language ?? undefined),
                sha256: checksum,
            }));
            onSent(submission);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setSending(false);
        }
    };

    return (
        <Stack gap="md">
            {/* What this type has to say before anything is sent. Above the
                fields rather than beside the button: a warning read after the
                decision is a warning that arrived too late. */}
            {asks?.notices?.map(notice => (
                <Alert key={notice} color="blue" icon={<IconAlertCircle size={18} />}>
                    {t(notice)}
                </Alert>
            ))}

            {problem.submissionsLeft !== undefined && problem.submissionsLeft <= 3 && (
                <Alert color="yellow" icon={<IconAlertCircle size={18} />}>
                    {t("Submissions left")}: {problem.submissionsLeft}
                </Alert>
            )}

            <Group align="flex-start" grow wrap="wrap">
                {wantsLanguage && (
                    <Select
                        label={t("Programming language")}
                        description={t("Select the language your solution is written in")}
                        data={offered.map(l => ({ value: l.id, label: l.label }))}
                        value={language}
                        onChange={setLanguage}
                        allowDeselect={false}
                    />
                )}
                {wantsFile && (
                    <FileInput
                        label={t(asks && asks.file !== false ? asks.file.label : "Solution file")}
                        description={codeLocked
                            ? t("Clear the file to use the editor instead")
                            : asks && asks.file !== false && asks.file.description
                                ? `${t(asks.file.description)} — ${t("Up to {{limit}}", { limit: formatBytes(problem.maxUploadBytes) })}`
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

            {/* Said before anything is written rather than after it is sent:
                the Server refuses a submission into a stopped series, and
                letting somebody finish an answer first is the wrong order. */}
            {closed && (
                <Alert color="orange" icon={<IconAlertCircle size={18} />}>
                    {state === "paused"
                        ? t("This series is paused. Nothing is accepted until it starts again.")
                        : state === "ended"
                            ? t("This series has ended. The statements stay readable; nothing more is accepted.")
                            : t("This series has not started yet.")}
                </Alert>
            )}

            <Group justify="flex-end">
                <Button
                    size="md"
                    loading={sending}
                    disabled={closed}
                    onClick={send}
                    rightSection={<IconSend size={18} />}
                >
                    {t("Send")}
                </Button>
            </Group>
        </Stack>
    );
}
