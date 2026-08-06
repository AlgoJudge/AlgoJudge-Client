import { Alert, Badge, Button, Card, Center, Grid, Group, Loader, MultiSelect, Select, Stack, Table, Tabs, Text, TextInput, Title, Tooltip } from "@mantine/core";
import {
    IconAlertTriangle, IconArrowLeft, IconCopy, IconDeviceFloppy, IconDownload, IconInfoCircle,
    IconTrash, IconUpload,
} from "@tabler/icons-react";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
    FileScope, ManagedProblem, ManagedProblemVersion, ManagedUserSummary, ProblemFile, ProblemVisibility,
} from "../../../../api/ManagerApi";
import { Attachment } from "../../../../api/ParticipantApi";
import LanguageTabs, { DEFAULT_LANGUAGE } from "../../../../components/content/LanguageTabs";
import ContentEditor from "../../../../components/content/ContentEditor";
import PackageBuilder, { PackageDraft } from "../../../../components/package/PackageBuilder";
import { isPackageFile, PACKAGE_ARCHIVE, SAMPLES_ARCHIVE } from "../../../../package/types";
import LoadState from "../../../../components/LoadState";
import { CopyButton } from "../../../../components/buttons";
import ActivityTime from "../../../../components/time/ActivityTime";
import { emptyDocument, isStatementName, statementFileName } from "../../../../content/types";
import { tryValidateContent } from "../../../../content/validate";
import { useApiCall, useApiEffect } from "../../../../provider/apiContext";
import { sha256 } from "../../../../utils/sha256";
import { statementRenderers } from "../../../../renderers";
import { canEmbed, embedReference, linkReference } from "../../../../content/reference";

export default function ManagerProblemPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const call = useApiCall();
    const { problemId } = useParams();
    // Which version the other tabs show. In the URL, so "look at version 2 of
    // this problem" is a link, and so a reload does not jump back to the newest.
    const [query, setQuery] = useSearchParams();
    const selectedId = query.get("version") ?? undefined;
    const fileInput = useRef<HTMLInputElement>(null);
    const attachmentInput = useRef<HTMLInputElement>(null);

    const [problem, setProblem] = useState<ManagedProblem | undefined>(undefined);
    const [versions, setVersions] = useState<ManagedProblemVersion[]>([]);
    const [users, setUsers] = useState<ManagedUserSummary[]>([]);
    // Keyed by language subtag; the default statement is under DEFAULT_LANGUAGE.
    // One state rather than one per tab: publishing sends them together, because
    // a version carries every language it was published with.
    const [sources, setSources] = useState<Record<string, string>>({ [DEFAULT_LANGUAGE]: emptyDocument() });
    const [language, setLanguage] = useState<string>(DEFAULT_LANGUAGE);
    const [note, setNote] = useState("");
    const [uploadScope, setUploadScope] = useState<FileScope>("participant");
    const [error, setError] = useState<string | undefined>(undefined);
    const [busy, setBusy] = useState(false);
    const [reload, setReload] = useState(0);
    // The draft. A version is published whole — statement, files and package in
    // one request — so a file waits here rather than being written into a
    // version that already exists and that a submission may already point at.
    const [staged, setStaged] = useState<{ file: File; scope: FileScope }[]>([]);
    const [removed, setRemoved] = useState<string[]>([]);
    const [packageDraft, setPackageDraft] = useState<PackageDraft | undefined>(undefined);

    const loadError = useApiEffect(async (api) => {
        if (!problemId) return;
        // A draft belongs to the version it was written against. Reloading — or
        // looking at an older version — starts a new one.
        setStaged([]);
        setRemoved([]);
        const loaded = await api.managerApi.getProblem(problemId);
        setProblem(loaded);
        setUsers(await api.managerApi.searchUsers(""));

        const history = await api.managerApi.getProblemVersions(problemId);
        setVersions(history);

        // The selected version, defaulting to the newest. Older ones are
        // history: they can be read, and a correction to them is published as a
        // new version rather than written over the old one.
        const newest = history.find(v => v.id === selectedId) ?? history[0];
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
    }, [problemId, selectedId, reload]);

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

    // A staged file has no URL until it is stored, and the preview has to show
    // the figure that is about to be published rather than a gap. Revoked when
    // the set changes, so a long editing session does not leak them.
    const stagedUrls = useMemo(
        () => new Map(staged.map(entry => [entry.file.name, URL.createObjectURL(entry.file)])),
        [staged]);
    useEffect(() => () => { for (const url of stagedUrls.values()) URL.revokeObjectURL(url); }, [stagedUrls]);

    // Stable, so reporting the draft does not re-run the builder's effect.
    const handleDraft = useCallback((draft: PackageDraft | undefined) => setPackageDraft(draft), []);

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
        // The bytes go up first and the version references what came back.
        // Checksums are computed here, where the bytes are, and recomputed by
        // the Server, which refuses to store a mismatch — so a truncated upload
        // fails before it can become part of a published version.
        const store = async (bytes: Blob, name: string) => {
            const checksum = await sha256(bytes);
            return await call(api => api.fileApi.upload(bytes, name, checksum));
        };

        const files = await Promise.all(staged.map(async entry => ({
            fileId: (await store(entry.file, entry.file.name)).id,
            name: entry.file.name,
            scope: entry.scope,
        })));
        const archive = await packageDraft?.build();
        // The examples go with it: they are cut from the same package, and a
        // version whose statement shows one sample and whose download holds
        // another is worse than no download at all.
        const samples = archive ? await packageDraft?.buildSamples() : undefined;
        const built = archive
            ? {
                fileId: (await store(archive, PACKAGE_ARCHIVE)).id,
                samplesFileId: samples ? (await store(samples, SAMPLES_ARCHIVE)).id : undefined,
            }
            : undefined;
        await call(api => api.managerApi.createProblemVersion(problemId, {
            note: note.trim() || undefined,
            content: sources[DEFAULT_LANGUAGE],
            translations: Object.entries(sources)
                .filter(([tag]) => tag !== DEFAULT_LANGUAGE)
                .map(([tag, content]) => ({ language: tag, content })),
            files,
            removedFiles: removed,
            package: built,
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
    const newest = versions[0];
    const selected = versions.find(v => v.id === selectedId) ?? newest;
    // History is read, not rewritten: an older version takes no new statement,
    // no new files and no new package. The banner says so and every control
    // that would change it is disabled.
    const isNewest = selected?.id === newest?.id;
    const locked = !!problem.archivedAt || !isNewest;

    // What the next version would hold: what this one holds, less what the draft
    // removes, plus what it adds. Every screen below reads this rather than the
    // stored list, so the preview shows the statement as it will be published.
    type DraftFile = ProblemFile & { state: "kept" | "removed" | "added" };
    const files: DraftFile[] = [
        ...(selected?.files ?? []).map((f): DraftFile => ({
            ...f,
            state: removed.includes(f.name) ? "removed" : "kept",
        })),
        ...staged.map((entry): DraftFile => ({
            name: entry.file.name,
            scope: entry.scope,
            mimeType: entry.file.type || "application/octet-stream",
            sizeBytes: entry.file.size,
            sha256: "",
            url: stagedUrls.get(entry.file.name),
            state: "added",
        })),
    ];
    // A translation is a statement, not an attachment: `content-en.md` is written
    // in the editor beside `content.md`, and offering either as something to
    // point at from the statement would be pointing a document at itself.
    const participantFiles = files.filter(f =>
        f.state !== "removed" && f.scope === "participant" && !isStatementName(f.name));

    // The preview gets the real files, so a figure appears in it exactly as it
    // will on the participant's screen — including the notice when the name
    // points at nothing.
    const previewAttachments: Attachment[] = participantFiles.map(f => ({
        name: f.name,
        mimeType: f.mimeType,
        sizeBytes: f.sizeBytes,
        url: f.url ?? "#",
        sha256: f.sha256,
    }));

    const stageAttachment = (file: File) => {
        setError(undefined);
        if (isStatementName(file.name)) {
            // The statement is written in the editor. Attaching one here would
            // put a second answer beside the one being published.
            setError(t("content.* is the statement; edit it in the Statement tab"));
            return;
        }
        if (isPackageFile(file.name)) {
            // Both are built from the package and rebuilt on publication, so an
            // attachment of that name would be overwritten without warning.
            setError(t("The package is built in the Package tab"));
            return;
        }
        if (files.some(f => f.state !== "removed" && f.name === file.name)) {
            // Refused rather than replaced, as the Server refuses it: a statement
            // referring to the name must not change meaning because somebody
            // attached a different file.
            setError(`${t("This version already has a file called")} ${file.name}`);
            return;
        }
        setStaged(current => [...current, { file, scope: uploadScope }]);
    };

    const unstage = (name: string) => setStaged(current => current.filter(entry => entry.file.name !== name));
    const publishes = staged.length > 0 || removed.length > 0 || packageDraft !== undefined;

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

            {!isNewest && selected && (
                <Alert color="blue" icon={<IconInfoCircle size={18} />}>
                    <Group justify="space-between" wrap="wrap">
                        <Text size="sm">
                            {t("You are looking at version")} {selected.version} {t("of")} {versions.length}.{" "}
                            {t("Older versions are read-only: a correction is published as a new one.")}
                        </Text>
                        <Button
                            variant="light"
                            size="compact-sm"
                            onClick={() => setQuery(q => { q.delete("version"); return q; }, { replace: true })}
                        >
                            {t("Back to the newest")}
                        </Button>
                    </Group>
                </Alert>
            )}

            {/* The open tab is in the URL, as it is on the activity screen:
                "look at this problem's package" is a link somebody sends. */}
            <Tabs
                value={query.get("tab") ?? "content"}
                onChange={value => setQuery(q => {
                    if (value && value !== "content") q.set("tab", value);
                    else q.delete("tab");
                    return q;
                }, { replace: true })}
            >
                <Tabs.List>
                    <Tabs.Tab value="content">{t("Statement")}</Tabs.Tab>
                    <Tabs.Tab value="files">{t("Attachments")} ({files.length})</Tabs.Tab>
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

                                <ContentEditor value={source} onChange={setSource} attachments={participantFiles} />
                            </Stack>
                        </Grid.Col>

                        <Grid.Col span={{ base: 12, lg: 6 }}>
                            <Card withBorder radius="sm">
                                <Title order={5} mb="sm">{t("Preview")}</Title>
                                {/* The same renderer the participant gets, so the
                                    preview cannot drift from the real screen. */}
                                <Suspense fallback={<Center my="xl"><Loader /></Center>}>
                                    <Statement content={source} attachments={previewAttachments} />
                                </Suspense>
                            </Card>
                        </Grid.Col>
                    </Grid>
                </Tabs.Panel>

                {/* No version yet is an ordinary state, not a blocked one: a new
                    problem is prepared whole — statement, files and package — and
                    publishing creates version 1 out of all three. */}
                <Tabs.Panel value="files" pt="md">
                    <Stack gap="md">
                            <Group justify="space-between" wrap="wrap">
                                <Text size="sm" c="dimmed" maw={620}>
                                    {selected
                                        ? t("Files of the version shown. A participant receives the participant-scoped ones; the statement points at them by name. Additions and removals are published with the next version.")
                                        : t("Files of the first version, published together with the statement and the package.")}
                                </Text>
                                <Group gap="xs">
                                    <Select
                                        size="sm"
                                        w={200}
                                        data={[
                                            { value: "participant", label: t("scope.participant") },
                                            { value: "manager", label: t("scope.manager") },
                                        ]}
                                        value={uploadScope}
                                        onChange={v => v && setUploadScope(v as FileScope)}
                                    />
                                    <Button
                                        leftSection={<IconUpload size={16} />}
                                        disabled={locked}
                                        loading={busy}
                                        onClick={() => attachmentInput.current?.click()}
                                    >
                                        {t("Add a file")}
                                    </Button>
                                    <input
                                        ref={attachmentInput}
                                        type="file"
                                        style={{ display: "none" }}
                                        onChange={e => {
                                            const file = e.currentTarget.files?.[0];
                                            if (file) stageAttachment(file);
                                            e.currentTarget.value = "";
                                        }}
                                    />
                                </Group>
                            </Group>

                            <Table striped>
                                <Table.Thead>
                                    <Table.Tr>
                                        <Table.Th>{t("Name")}</Table.Th>
                                        <Table.Th>{t("Scope")}</Table.Th>
                                        <Table.Th>{t("Type")}</Table.Th>
                                        <Table.Th>{t("Size")}</Table.Th>
                                        <Table.Th>sha256</Table.Th>
                                        <Table.Th />
                                    </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                    {files.map(file => (
                                        <Table.Tr key={file.name} opacity={file.state === "removed" ? 0.5 : 1}>
                                            <Table.Td>
                                                <Group gap="xs" wrap="nowrap">
                                                    <Text
                                                        size="sm"
                                                        ff="monospace"
                                                        td={file.state === "removed" ? "line-through" : undefined}
                                                    >
                                                        {file.name}
                                                    </Text>
                                                    {file.state === "added" && (
                                                        <Badge size="sm" variant="light" color="teal">{t("new")}</Badge>
                                                    )}
                                                    {file.state === "removed" && (
                                                        <Badge size="sm" variant="light" color="red">{t("removed")}</Badge>
                                                    )}
                                                </Group>
                                            </Table.Td>
                                            <Table.Td>
                                                <Badge variant="light" size="sm">{t(`scope.${file.scope}`)}</Badge>
                                            </Table.Td>
                                            <Table.Td><Text size="xs" c="dimmed">{file.mimeType}</Text></Table.Td>
                                            <Table.Td>
                                                <Text size="sm">{Math.max(1, Math.ceil(file.sizeBytes / 1024))} kB</Text>
                                            </Table.Td>
                                            <Table.Td>
                                                {/* A staged file has no checksum yet: it
                                                    is computed when it is published, from
                                                    the bytes that are sent. */}
                                                <Text size="xs" c="dimmed" ff="monospace">
                                                    {file.sha256 ? `${file.sha256.slice(0, 12)}…` : "—"}
                                                </Text>
                                            </Table.Td>
                                            <Table.Td>
                                                <Group gap="xs" justify="flex-end" wrap="nowrap">
                                                    {/* Copied rather than typed: a name
                                                        with a space needs the angle
                                                        bracket form, and nobody should
                                                        have to know that. The form that
                                                        shows the file where it can be
                                                        shown, a link where it cannot. */}
                                                    {file.scope === "participant" && !isStatementName(file.name) && (
                                                        <Tooltip label={t("Copy the reference")}>
                                                            <CopyButton
                                                                variant="subtle"
                                                                size="compact-sm"
                                                                value={canEmbed(file.mimeType)
                                                                    ? embedReference(file.name)
                                                                    : linkReference(file.name)}
                                                            >
                                                                {() => <IconCopy size={14} />}
                                                            </CopyButton>
                                                        </Tooltip>
                                                    )}
                                                    {file.url && (
                                                        <Button
                                                            variant="subtle"
                                                            size="compact-sm"
                                                            component="a"
                                                            href={file.url}
                                                            download={file.name}
                                                        >
                                                            <IconDownload size={14} />
                                                        </Button>
                                                    )}
                                                    {/* Neither the statement nor the package
                                                        is an attachment: both are written
                                                        elsewhere and rebuilt on
                                                        publication, so deleting one from
                                                        this list would leave a problem
                                                        nothing can judge. */}
                                                    {file.state === "removed" ? (
                                                        <Button
                                                            variant="subtle"
                                                            size="compact-sm"
                                                            onClick={() => setRemoved(current =>
                                                                current.filter(name => name !== file.name))}
                                                        >
                                                            {t("Restore")}
                                                        </Button>
                                                    ) : (
                                                        <Tooltip label={isStatementName(file.name)
                                                            ? t("The statement is edited in the Statement tab")
                                                            : isPackageFile(file.name)
                                                                ? t("The package is built in the Package tab")
                                                                : t("Delete")}>
                                                            <Button
                                                                variant="subtle"
                                                                color="red"
                                                                size="compact-sm"
                                                                disabled={locked || isStatementName(file.name) || isPackageFile(file.name)}
                                                                onClick={() => file.state === "added"
                                                                    ? unstage(file.name)
                                                                    : setRemoved(current => [...current, file.name])}
                                                            >
                                                                <IconTrash size={14} />
                                                            </Button>
                                                        </Tooltip>
                                                    )}
                                                </Group>
                                            </Table.Td>
                                        </Table.Tr>
                                    ))}
                                </Table.Tbody>
                            </Table>

                            {files.length === 0 && <Text size="sm" c="dimmed">{t("No files yet")}</Text>}

                            {/* The two forms do two different things, and the note
                                has to say which is which: the exclamation mark shows
                                the file, its absence points at it. Saying "a PDF is a
                                link" left the form that displays one unmentioned. */}
                            <Alert color="blue">
                                {t("![description](<name>) shows the file inside the statement — a picture appears, a PDF opens in a frame. [description](<name>) is a link to it instead. The angle brackets are needed when the name contains a space; the copy button beside a file writes the whole reference. Only participant-scoped files can be pointed at.")}
                            </Alert>
                    </Stack>
                </Tabs.Panel>

                <Tabs.Panel value="package" pt="md">
                    {/* Keyed by version: switching to another one, or publishing,
                        starts the builder again and opens what that version holds.
                        A problem with no version yet builds its first package here
                        and publishes it with everything else. */}
                    <PackageBuilder
                        key={selected?.id ?? "first"}
                        disabled={locked}
                        stored={selected?.files.find(f => f.name === PACKAGE_ARCHIVE)}
                        onOpenStored={selected
                            ? () => call(api => api.managerApi.getProblemPackage(problem.id, selected.id))
                            : undefined}
                        onDraftChange={handleDraft}
                    />
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
                                <Table.Th />
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {versions.map(version => (
                                <Table.Tr key={version.id} bg={version.id === selected?.id ? "var(--mantine-color-blue-light)" : undefined}>
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
                                    <Table.Td>
                                        <Group justify="flex-end">
                                            {/* Selecting a version points the
                                                statement, package and attachment
                                                tabs at it. */}
                                            <Button
                                                variant={version.id === selected?.id ? "filled" : "light"}
                                                size="compact-sm"
                                                onClick={() => setQuery(
                                                    version.id === newest?.id ? {} : { version: version.id },
                                                    { replace: true })}
                                            >
                                                {version.id === selected?.id ? t("Shown") : t("Show")}
                                            </Button>
                                        </Group>
                                    </Table.Td>
                                </Table.Tr>
                            ))}
                        </Table.Tbody>
                    </Table>
                    {versions.length === 0 && (
                        <Text size="sm" c="dimmed" mt="sm">
                            {t("No version yet. Prepare the statement, the files and the package, then publish them as version 1.")}
                        </Text>
                    )}
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

            {/* One publish control for the whole editor, outside the tabs.
                A version is published whole — statement, attachments and package
                together — so there is nothing to save per tab, and a change made
                in one tab cannot be forgotten while publishing from another. */}
            <Card withBorder radius="sm">
                <Stack gap="xs">
                    <TextInput
                        label={t("What changed")}
                        placeholder={t("Shown in the version history")}
                        value={note}
                        onChange={e => setNote(e.currentTarget.value)}
                        disabled={locked}
                    />
                    <Group justify="space-between" wrap="wrap">
                        <Group gap="xs">
                            <Text size="sm" c="dimmed">
                                {t("Publishing creates version")} {(versions[0]?.version ?? 0) + 1}:
                            </Text>
                            <Tooltip label={Object.keys(sources)
                                .map(tag => tag === DEFAULT_LANGUAGE ? t("Default statement") : tag).join(", ")}>
                                <Badge variant="light" size="sm">
                                    {t("statement")} · {Object.keys(sources).length}
                                </Badge>
                            </Tooltip>
                            {staged.length > 0 && (
                                <Tooltip label={staged.map(entry => entry.file.name).join(", ")}>
                                    <Badge variant="light" size="sm" color="teal">+{staged.length}</Badge>
                                </Tooltip>
                            )}
                            {removed.length > 0 && (
                                <Tooltip label={removed.join(", ")}>
                                    <Badge variant="light" size="sm" color="red">−{removed.length}</Badge>
                                </Tooltip>
                            )}
                            <Badge variant="light" size="sm" color={packageDraft ? "teal" : "gray"}>
                                {packageDraft ? t("new package") : t("package unchanged")}
                            </Badge>
                        </Group>
                        <Group gap="xs">
                            {packageDraft?.blocked && (
                                <Text size="sm" c="red">{t("The package has errors")}</Text>
                            )}
                            <Button
                                leftSection={<IconDeviceFloppy size={16} />}
                                loading={busy}
                                disabled={locked || packageDraft?.blocked}
                                onClick={publish}
                            >
                                {t("Publish a new version")}
                            </Button>
                        </Group>
                    </Group>
                    {publishes && !locked && (
                        <Text size="xs" c="dimmed">
                            {t("Unpublished changes are kept only in this browser tab.")}
                        </Text>
                    )}
                </Stack>
            </Card>
        </Stack>
    );
}
