import { Anchor, Badge, Button, Card, Center, Group, Loader, SegmentedControl, Stack, Text, Title } from "@mantine/core";
import { IconClock, IconDatabase, IconDownload, IconLanguage } from "@tabler/icons-react";
import { Suspense, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { StatementRef } from "../../../../../api/FileApi";
import { Activity, ProblemDetail, Series } from "../../../../../api/ParticipantApi";
import { maySubmit, seriesState } from "../../../../../api/seriesState";
import ProblemStatusBadge from "../../../../../components/problem/ProblemStatusBadge";
import PdfStatement from "../../../../../content/PdfStatement";
import { useApi, useApiEffect } from "../../../../../provider/apiContext";
import LoadState from "../../../../../components/LoadState";
import { statementRenderers } from "../../../../../renderers";
import { languageName, pickLanguage } from "../../../../../components/content/languageName";
import { isStatementName } from "../../../../../content/types";

/**
 * The value standing for `content.md`, which has no language of its own. `*`
 * rather than the empty string: it can never be a language subtag, and Mantine's
 * controls dislike an empty value.
 */
const DEFAULT = "*";

/**
 * The statement, not material beside it: `content.md`, its translations, and a
 * `content.pdf` where a problem ships one.
 */
const isStatementFile = (name: string) => isStatementName(name) || /^content\.[^.]+$/i.test(name);

/**
 * The statement to draw, for one reader and one choice.
 *
 * The reader's interface language where the author wrote it, what they wrote
 * first otherwise, and whatever the reader picked over both — wanting the
 * English statement in a Polish interface is an ordinary thing to want, so the
 * switcher changes the statement alone.
 */
const chooseStatement = (
    statements: StatementRef[],
    chosen: string | undefined,
    interfaceLanguage: string,
): { ref?: StatementRef, language: string, translations: StatementRef[] } => {
    const translations = statements.filter(ref => ref.language !== undefined);
    const preferred = pickLanguage(
        translations.map(ref => ref.language!), interfaceLanguage) ?? DEFAULT;
    const language = chosen ?? preferred;
    const ref = language === DEFAULT
        ? statements.find(s => s.language === undefined)
        : statements.find(s => s.language === language);
    // A problem with only a translation and no default is odd but possible, and
    // showing nothing would be worse than showing the one statement there is.
    return { ref: ref ?? statements[0], language, translations };
};

/** Markdown is rendered; anything else — a `content.pdf` — is handed over as a file. */
const isMarkdown = (ref: StatementRef) => /\.md$/i.test(ref.name);

export default function ProblemPage() {
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();
    const api = useApi();
    const { activityId, problemId } = useParams();

    const [activity, setActivity] = useState<Activity | undefined>(undefined);
    const [problem, setProblem] = useState<ProblemDetail | undefined>(undefined);
    /**
     * The rounds, for the one holding this problem: whether anything may still
     * be sent is the series' answer, not the problem's.
     */
    const [series, setSeries] = useState<Series[]>([]);
    /** Set only when the reader chose; otherwise the interface language decides. */
    const [chosenLanguage, setChosenLanguage] = useState<string | undefined>(undefined);
    /** The text of the statement on screen, fetched by id like every other file. */
    const [statement, setStatement] = useState<string | undefined>(undefined);

    const error = useApiEffect(async (api) => {
        if (!activityId || !problemId) return;
        const activity = await api.participantApi.getActivity(activityId);
        setActivity(activity);
        const detail = await api.participantApi.getProblem(activity.id, problemId);
        setProblem(detail);
        setSeries(await api.participantApi.getSeries(activity.id));

        // The statement travels as a reference and is fetched like any other
        // file — the same id the manager uploaded it under, with the checksum
        // that came with it.
        const chosen = chooseStatement(detail.statements, chosenLanguage, i18n.language);
        setStatement(chosen.ref && isMarkdown(chosen.ref)
            ? await api.fileApi.getText(chosen.ref.fileId)
            : undefined);

        // The statement is where a participant sits while waiting for a verdict,
        // so their standing on this problem has to move here too — not only on
        // the list they came from.
        api.participantApi.eventDispatcher.addEventListener("problemStatusChanged", evt => {
            if (evt.data.activityId !== activity.id) return;
            setProblem(current => current && current.id === evt.data.problem.id
                ? {
                    ...current,
                    status: evt.data.problem.status,
                    bestScore: evt.data.problem.bestScore,
                    attempts: evt.data.problem.attempts,
                }
                : current);
        });
    }, [activityId, problemId, chosenLanguage, i18n.language]);

    if (!activity || !problem) {
        return <LoadState error={error} loading={!error} />;
    }

    const Statement = statementRenderers.resolve(problem.type).value;
    const downloads = problem.attachments.filter(a => !isStatementFile(a.name));
    const chosen = chooseStatement(problem.statements, chosenLanguage, i18n.language);
    const holding = series.find(s => s.id === problem.seriesId);
    const canSubmit = holding === undefined || maySubmit(holding);
    const state = holding ? seriesState(holding) : "open";

    return (
        <Stack gap="md">
            <Group justify="space-between" align="flex-start" wrap="wrap">
                <Stack gap={4}>
                    <Title>[{problem.slug}] {problem.name}</Title>
                    <Group gap="xs">
                        <ProblemStatusBadge
                            status={problem.status}
                            bestScore={problem.bestScore}
                            maxScore={problem.maxScore}
                            attempts={problem.attempts}
                        />
                        {/* Absent when the manager chose not to show them, so the
                            screen renders nothing rather than "undefined". */}
                        {problem.limits && (
                            <>
                                <Badge variant="light" leftSection={<IconClock size={14} />}>
                                    {(problem.limits.timeMs / 1000).toFixed(2)} s
                                </Badge>
                                <Badge variant="light" leftSection={<IconDatabase size={14} />}>
                                    {Math.round(problem.limits.memoryBytes / (1024 * 1024))} MiB
                                </Badge>
                            </>
                        )}
                        {problem.submissionsLeft !== undefined && (
                            <Badge variant="outline" color="gray">
                                {t("Submissions left")}: {problem.submissionsLeft}
                            </Badge>
                        )}
                        {/* Why the button is shut, where somebody looking at it
                            will read it. */}
                        {!canSubmit && (
                            <Badge variant="light" color={state === "paused" ? "orange" : "gray"}>
                                {state === "paused" ? t("The series is paused") : t("The series has ended")}
                            </Badge>
                        )}
                    </Group>
                </Stack>
                <Group>
                    <Button variant="default" onClick={() => navigate(-1)}>{t("Back")}</Button>
                    {/* Shut once the round stops accepting — disabled rather
                        than absent, as on the problem list, so the way in stays
                        where it has always been and says it is shut. */}
                    {canSubmit ? (
                        <Button component={Link} to={`/activities/${activity.slug}/submit/${problem.slug}`}>
                            {t("Submit")}
                        </Button>
                    ) : (
                        <Button disabled>{t("Submit")}</Button>
                    )}
                </Group>
            </Group>

            {chosen.translations.length > 0 && (
                <Group gap="xs">
                    <IconLanguage size={16} />
                    <SegmentedControl
                        size="xs"
                        value={chosen.language}
                        onChange={setChosenLanguage}
                        data={[
                            { value: DEFAULT, label: t("Default statement") },
                            ...chosen.translations.map(v => ({
                                value: v.language!,
                                label: languageName(v.language!, i18n.language),
                            })),
                        ]}
                    />
                </Group>
            )}

            {/* A statement that is not Markdown — a `content.pdf` — is drawn by
                something that can draw it, rather than fed to a renderer that
                reads Markdown. It used to be handed over as a download link,
                which on a problem imported from an archive is the whole
                statement reduced to a file name. */}
            {chosen.ref && !isMarkdown(chosen.ref) ? (
                <PdfStatement url={api.fileApi.url(chosen.ref.fileId)} name={chosen.ref.name} />
            ) : statement === undefined ? (
                <Center my="xl"><Loader /></Center>
            ) : (
                <Suspense fallback={<Center my="xl"><Loader /></Center>}>
                    <Statement content={statement} attachments={problem.attachments} />
                </Suspense>
            )}

            {problem.samples && problem.samples.length > 0 && (
                <Text size="sm" c="dimmed">
                    {t("Samples are also available as separate files where the problem provides them.")}
                </Text>
            )}

            {downloads.length > 0 && (
                <Card withBorder radius="sm">
                    <Title order={4} mb="xs">{t("Attachments")}</Title>
                    <Stack gap={4}>
                        {downloads.map(a => (
                            <Group key={a.name} gap="xs">
                                <IconDownload size={16} />
                                <Anchor href={a.url} download>{a.name}</Anchor>
                                <Text size="xs" c="dimmed">{Math.ceil(a.sizeBytes / 1024)} kB</Text>
                            </Group>
                        ))}
                    </Stack>
                </Card>
            )}
        </Stack>
    );
}
