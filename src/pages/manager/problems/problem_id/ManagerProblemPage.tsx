import { Alert, Badge, Button, Card, Center, Grid, Group, Loader, MultiSelect, Select, Stack, Table, Text, TextInput, Title, Tabs } from "@mantine/core";
import { IconAlertTriangle, IconArrowLeft, IconDeviceFloppy, IconDownload, IconUpload } from "@tabler/icons-react";
import { Suspense, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { ManagedProblem, ManagedProblemVersion, ManagedUserSummary, ProblemVisibility } from "../../../../api/ManagerApi";
import LanguageTabs, { DEFAULT_LANGUAGE } from "../../../../components/content/LanguageTabs";
import ContentEditor from "../../../../components/content/ContentEditor";
import PackageBuilder from "../../../../components/package/PackageBuilder";
import LoadState from "../../../../components/LoadState";
import ActivityTime from "../../../../components/time/ActivityTime";
import { emptyDocument, statementFileName } from "../../../../content/types";
import { tryValidateContent } from "../../../../content/validate";
import { useApiCall, useApiEffect } from "../../../../provider/ApiProvider";
import { sha256 } from "../../../../utils/sha256";
import { statementRenderers } from "../../../../renderers";

export default function ManagerProblemPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const call = useApiCall();
    const { problemId } = useParams();
    const fileInput = useRef<HTMLInputElement>(null);

    const [problem, setProblem] = useState<ManagedProblem | undefined>(undefined);
    const [versions, setVersions] = useState<ManagedProblemVersion[]>([]);
    const [users, setUsers] = useState<ManagedUserSummary[]>([]);
    // Keyed by language subtag; the default statement is under DEFAULT_LANGUAGE.
    // One state rather than one per tab: publishing sends them together, because
    // a version carries every language it was published with.
    const [sources, setSources] = useState<Record<string, string>>({ [DEFAULT_LANGUAGE]: emptyDocument() });
    const [language, setLanguage] = useState<string>(DEFAULT_LANGUAGE);
    const [note, setNote] = useState("");
    const [error, setError] = useState<string | undefined>(undefined);
    const [busy, setBusy] = useState(false);
    const [reload, setReload] = useState(0);

    const loadError = useApiEffect(async (api) => {
        if (!problemId) return;
        const loaded = await api.managerApi.getProblem(problemId);
        setProblem(loaded);
        setUsers(await api.managerApi.searchUsers(""));

        const history = await api.managerApi.getProblemVersions(problemId);
        setVersions(history);

        // The editor always starts from the newest version. Older ones are
        // history, and history is read rather than edited: a correction becomes
        // a new version.
        const newest = history[0];
        if (newest) {
            // Edited as the text it is. An unreadable document still opens, so
            // the author can see and repair what is wrong with it.
            const variants = await api.managerApi.getProblemContent(problemId, newest.id);
            const loadedSources: Record<string, string> = { [DEFAULT_LANGUAGE]: emptyDocument() };
            for (const variant of variants) {
                if (typeof variant.content !== "string") continue;
                loadedSources[variant.language ?? DEFAULT_LANGUAGE] = variant.content;
            }
            setSources(loadedSources);
            setLanguage(DEFAULT_LANGUAGE);
        }
    }, [problemId, reload]);

    const run = async (operation: () => Promise<unknown>) => {
        setError(undefined);
        setBusy(true);
        try {
            await operation();
            setReload(n => n + 1);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    };

    const source = sources[language] ?? emptyDocument();
    const setSource = (value: string) => setSources({ ...sources, [language]: value });

    const publish = () => run(async () => {
        if (!problemId) return;
        // Every language is validated, not only the one on screen: publishing a
        // broken translation nobody looked at is exactly how it would happen.
        for (const [tag, text] of Object.entries(sources)) {
            const parsed = tryValidateContent(text);
            if ("error" in parsed) {
                throw new Error(tag === DEFAULT_LANGUAGE
                    ? parsed.error.message
                    : `${statementFileName(tag)}: ${parsed.error.message}`);
            }
        }
        await call(api => api.managerApi.createProblemVersion(problemId, {
            note: note.trim() || undefined,
            content: sources[DEFAULT_LANGUAGE],
            translations: Object.entries(sources)
                .filter(([tag]) => tag !== DEFAULT_LANGUAGE)
                .map(([tag, content]) => ({ language: tag, content })),
        }));
        setNote("");
    });

    const download = () => {
        const blob = new Blob([source], { type: "text/markdown" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = statementFileName(language === DEFAULT_LANGUAGE ? undefined : language);
        anchor.click();
        URL.revokeObjectURL(url);
    };

    const upload = async (file: File) => {
        setError(undefined);
        try {
            const text = await file.text();
            // Loaded whether or not it validates: refusing to open a file is a
            // worse answer than showing what is wrong with it.
            const parsed = tryValidateContent(text);
            if ("error" in parsed) setError(parsed.error.message);
            setSource(text);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
    };

    if (!problem) return <LoadState error={loadError} loading={!loadError} />;

    const Statement = statementRenderers.resolve(problem.type).value;
    const attachmentNames = (versions[0]?.files ?? [])
        .filter(f => f.scope === "participant" && !/^content\./i.test(f.name))
        .map(f => f.name);

    return (
        <Stack gap="md">
            <Group justify="space-between" wrap="wrap">
                <Stack gap={2}>
                    <Group gap="xs">
                        <Title order={2}>{problem.name}</Title>
                        {problem.archivedAt && <Badge color="gray">{t("Archived")}</Badge>}
                    </Group>
                    <Text size="sm" c="dimmed" ff="monospace">{problem.slug} · {problem.type}</Text>
                </Stack>
                <Button variant="default" leftSection={<IconArrowLeft size={16} />} onClick={() => navigate("/manager/problems")}>
                    {t("Back")}
                </Button>
            </Group>

            {error && <Alert color="red" withCloseButton onClose={() => setError(undefined)}>{error}</Alert>}

            {problem.archivedAt && (
                <Alert color="gray" icon={<IconAlertTriangle size={18} />}>
                    {t("An archived problem takes no new versions. Restore it to keep editing.")}
                </Alert>
            )}

            <Tabs defaultValue="content">
                <Tabs.List>
                    <Tabs.Tab value="content">{t("Statement")}</Tabs.Tab>
                    <Tabs.Tab value="package">{t("Package")}</Tabs.Tab>
                    <Tabs.Tab value="versions">{t("Versions")} ({versions.length})</Tabs.Tab>
                    <Tabs.Tab value="sharing">{t("Sharing")}</Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value="content" pt="md">
                    <Grid>
                        <Grid.Col span={{ base: 12, lg: 6 }}>
                            <Stack gap="sm">
                                <LanguageTabs
                                    value={language}
                                    languages={Object.keys(sources)}
                                    onChange={setLanguage}
                                    onAdd={tag => {
                                        setSources({ ...sources, [tag]: emptyDocument() });
                                        setLanguage(tag);
                                    }}
                                    onRemove={tag => {
                                        const rest = { ...sources };
                                        delete rest[tag];
                                        setSources(rest);
                                        setLanguage(DEFAULT_LANGUAGE);
                                    }}
                                />

                                <Group gap="xs">
                                    <Button
                                        variant="light"
                                        size="compact-sm"
                                        leftSection={<IconUpload size={14} />}
                                        onClick={() => fileInput.current?.click()}
                                    >
                                        {t("Upload")} {statementFileName(language === DEFAULT_LANGUAGE ? undefined : language)}
                                    </Button>
                                    <Button
                                        variant="light"
                                        size="compact-sm"
                                        leftSection={<IconDownload size={14} />}
                                        onClick={download}
                                    >
                                        {t("Download")} {statementFileName(language === DEFAULT_LANGUAGE ? undefined : language)}
                                    </Button>
                                    <input
                                        ref={fileInput}
                                        type="file"
                                        accept=".md,text/markdown"
                                        style={{ display: "none" }}
                                        onChange={e => {
                                            const file = e.currentTarget.files?.[0];
                                            if (file) upload(file);
                                            e.currentTarget.value = "";
                                        }}
                                    />
                                </Group>

                                <ContentEditor value={source} onChange={setSource} attachmentNames={attachmentNames} />

                                <Card withBorder radius="sm">
                                    {/* Publishing writes a new version rather than
                                        editing the current one, so a result stays
                                        attached to what it was judged against. */}
                                    <Stack gap="xs">
                                        <TextInput
                                            label={t("What changed")}
                                            placeholder={t("Shown in the version history")}
                                            value={note}
                                            onChange={e => setNote(e.currentTarget.value)}
                                        />
                                        <Group justify="space-between">
                                            <Text size="sm" c="dimmed">
                                                {t("Publishing creates version")} {(versions[0]?.version ?? 0) + 1}
                                            </Text>
                                            <Button
                                                leftSection={<IconDeviceFloppy size={16} />}
                                                loading={busy}
                                                disabled={!!problem.archivedAt}
                                                onClick={publish}
                                            >
                                                {t("Publish a new version")}
                                            </Button>
                                        </Group>
                                    </Stack>
                                </Card>
                            </Stack>
                        </Grid.Col>

                        <Grid.Col span={{ base: 12, lg: 6 }}>
                            <Card withBorder radius="sm">
                                <Title order={5} mb="sm">{t("Preview")}</Title>
                                {/* The same renderer the participant gets, so the
                                    preview cannot drift from the real screen. */}
                                <Suspense fallback={<Center my="xl"><Loader /></Center>}>
                                    <Statement content={source} attachments={[]} />
                                </Suspense>
                            </Card>
                        </Grid.Col>
                    </Grid>
                </Tabs.Panel>

                <Tabs.Panel value="package" pt="md">
                    {versions[0] ? (
                        <PackageBuilder
                            disabled={!!problem.archivedAt}
                            onUpload={async archive => {
                                // Computed here, where the bytes were assembled.
                                const checksum = await sha256(archive);
                                await call(api => api.managerApi.uploadProblemPackage(problem.id, versions[0].id, archive, checksum));
                                setReload(n => n + 1);
                            }}
                        />
                    ) : (
                        <Alert color="yellow">
                            {t("Publish a version first: a package is attached to one.")}
                        </Alert>
                    )}
                </Tabs.Panel>

                <Tabs.Panel value="versions" pt="md">
                    <Table striped>
                        <Table.Thead>
                            <Table.Tr>
                                <Table.Th>{t("Version")}</Table.Th>
                                <Table.Th>{t("Date")}</Table.Th>
                                <Table.Th>{t("Author")}</Table.Th>
                                <Table.Th>{t("What changed")}</Table.Th>
                                <Table.Th>{t("Package")}</Table.Th>
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {versions.map(version => (
                                <Table.Tr key={version.id}>
                                    <Table.Td>
                                        <Group gap="xs">
                                            <Text fw={500}>v{version.version}</Text>
                                            {version.version === problem.currentVersion && (
                                                <Badge size="sm" variant="light" color="teal">{t("Current")}</Badge>
                                            )}
                                        </Group>
                                    </Table.Td>
                                    <Table.Td>
                                        <ActivityTime value={version.createdAt} timeZone="Europe/Warsaw" format="date" hideZone />
                                    </Table.Td>
                                    <Table.Td><Text size="sm">{version.createdByName ?? "—"}</Text></Table.Td>
                                    <Table.Td><Text size="sm" c="dimmed">{version.note ?? "—"}</Text></Table.Td>
                                    <Table.Td>
                                        {version.hasPackage
                                            ? <Badge variant="light" color="teal" size="sm">{t("Uploaded")}</Badge>
                                            : <Badge variant="light" color="gray" size="sm">{t("Missing")}</Badge>}
                                    </Table.Td>
                                </Table.Tr>
                            ))}
                        </Table.Tbody>
                    </Table>
                    <Text size="sm" c="dimmed" mt="sm">
                        {t("Versions are append-only: a correction publishes a new one instead of editing an old one.")}
                    </Text>
                </Tabs.Panel>

                <Tabs.Panel value="sharing" pt="md">
                    <Stack gap="sm" maw={640}>
                        <Select
                            label={t("Visibility")}
                            data={[
                                { value: "private", label: t("visibility.private") },
                                { value: "shared", label: t("visibility.shared") },
                                { value: "instance", label: t("visibility.instance") },
                            ]}
                            value={problem.visibility}
                            onChange={v => v && run(() => call(api =>
                                api.managerApi.setProblemVisibility(problem.id, v as ProblemVisibility, problem.sharedWith)))}
                        />
                        {problem.visibility === "shared" && (
                            <MultiSelect
                                label={t("Shared with")}
                                data={users.map(u => ({ value: u.id, label: `${u.name} (${u.username})` }))}
                                value={problem.sharedWith}
                                onChange={ids => run(() => call(api =>
                                    api.managerApi.setProblemVisibility(problem.id, "shared", ids)))}
                                searchable
                            />
                        )}
                        <Alert color="blue">
                            {t("Sharing decides which problems a manager can see. What they may do with one is decided by their permissions.")}
                        </Alert>
                    </Stack>
                </Tabs.Panel>
            </Tabs>
        </Stack>
    );
}
