import { Badge, Button, Card, Center, Group, Loader, Stack, Table, Text, Title } from "@mantine/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import ActivityTime from "../time/ActivityTime";
import { tryValidateContent } from "../../content/validate";
import ContentEditor from "./ContentEditor";
import LanguageTabs, { DEFAULT_LANGUAGE } from "./LanguageTabs";

/**
 * The documents one owner publishes, each publishable or absent.
 *
 * Two owners use it — the instance and an activity — and they publish the same
 * kind of thing in the same format through the same File API, so they get one
 * editor rather than two that would need every future fix applied twice. What
 * differs between them arrives as props: which kinds there are, what they are
 * called, and the three calls that read and write them.
 *
 * The editor is the one a problem statement is written in, for the same reason:
 * it is the same format, validated by the same validator, drawn by the same
 * renderer.
 */

/** Everything the panel needs of a reference, whoever it belongs to. */
export interface PublishedRef<K extends string> {
    kind: K;
    language?: string;
    validFrom?: string;
    /** Only the instance ships templates. Absent means it is somebody's own text. */
    isTemplate?: boolean;
    fileId: string;
}

export interface DocumentsPanelProps<K extends string, R extends PublishedRef<K>> {
    /** In the order they are listed. Fixed, so the table does not reshuffle. */
    kinds: K[];
    label: (kind: K) => string;
    /** Everything currently published, of every kind. */
    published: R[];
    /** The file name a language's text is stored under. */
    fileName: (kind: K, language: string | undefined) => string;
    /** What a document's preview may refer to, e.g. the instance's mark. */
    attachments?: { name: string, mimeType: string }[];
    busy: boolean;
    /** Runs an operation and surfaces whatever it failed with. Owned by the screen. */
    run: (operation: () => Promise<unknown>) => Promise<void>;
    /** Uploads bytes and answers with the id to publish. */
    store: (bytes: Blob, name: string) => Promise<{ id: string }>;
    readText: (fileId: string) => Promise<string>;
    publish: (kind: K, statements: { language?: string, fileId: string }[]) => Promise<unknown>;
    unpublish: (kind: K) => Promise<unknown>;
    history: (kind: K) => Promise<R[]>;
}

export default function DocumentsPanel<K extends string, R extends PublishedRef<K>>({
    kinds, label, published, fileName, attachments = [], busy, run, store, readText,
    publish, unpublish, history,
}: DocumentsPanelProps<K, R>) {
    const { t } = useTranslation();

    const [kind, setKind] = useState<K | undefined>(undefined);
    const [sources, setSources] = useState<Record<string, string>>({});
    const [editing, setEditing] = useState(DEFAULT_LANGUAGE);
    const [revisions, setRevisions] = useState<R[] | undefined>(undefined);
    const [loading, setLoading] = useState(false);

    const refsOf = (of: K) => published.filter(ref => ref.kind === of);

    /** Opens one for editing: its text, in every language it has. */
    const open = (of: K) => void run(async () => {
        setKind(of);
        setEditing(DEFAULT_LANGUAGE);
        setLoading(true);
        try {
            const texts: Record<string, string> = {};
            for (const ref of refsOf(of)) {
                texts[ref.language ?? DEFAULT_LANGUAGE] = await readText(ref.fileId);
            }
            // A document nobody has published starts empty rather than from a
            // template: replacing it is the point, and a copy of the template
            // would be published as though it were the author's own words.
            setSources(Object.keys(texts).length > 0 ? texts : { [DEFAULT_LANGUAGE]: "" });
            setRevisions(await history(of));
        } finally {
            setLoading(false);
        }
    });

    const onPublish = () => void run(async () => {
        if (!kind) return;
        // Every language, not only the one on screen: publishing a broken
        // translation nobody looked at is exactly how it would happen.
        for (const [tag, text] of Object.entries(sources)) {
            const parsed = tryValidateContent(text);
            if ("error" in parsed) {
                throw new Error(tag === DEFAULT_LANGUAGE
                    ? parsed.error.message
                    : `${tag}: ${parsed.error.message}`);
            }
        }
        const statements = await Promise.all(Object.entries(sources).map(async ([tag, text]) => {
            const forLanguage = tag === DEFAULT_LANGUAGE ? undefined : tag;
            const stored = await store(
                new Blob([text], { type: "text/markdown" }),
                fileName(kind, forLanguage));
            return { language: forLanguage, fileId: stored.id };
        }));
        await publish(kind, statements);
        setRevisions(await history(kind));
    });

    const onUnpublish = () => void run(async () => {
        if (!kind) return;
        await unpublish(kind);
        setRevisions(await history(kind));
    });

    const languages = Object.keys(sources);
    const source = sources[editing] ?? "";

    return (
        <Stack gap="md">
            <Card withBorder radius="sm" p={0}>
                <Table striped highlightOnHover>
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th>{t("Document")}</Table.Th>
                            <Table.Th>{t("State")}</Table.Th>
                            <Table.Th>{t("Languages")}</Table.Th>
                            <Table.Th />
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {kinds.map(of => {
                            const refs = refsOf(of);
                            return (
                                <Table.Tr key={of}>
                                    <Table.Td>
                                        <Text
                                            fw={500}
                                            style={{ cursor: "pointer" }}
                                            onClick={() => open(of)}
                                        >
                                            {label(of)}
                                        </Text>
                                    </Table.Td>
                                    <Table.Td>
                                        {refs.length === 0
                                            ? <Badge variant="light" color="gray">{t("not published")}</Badge>
                                            : refs[0].isTemplate
                                                ? <Badge variant="light" color="orange">{t("template")}</Badge>
                                                : <Badge variant="light" color="teal">{t("published")}</Badge>}
                                    </Table.Td>
                                    <Table.Td>
                                        <Text size="sm" c="dimmed" ff="monospace">
                                            {refs.map(ref => ref.language ?? "*").join(" ") || "—"}
                                        </Text>
                                    </Table.Td>
                                    <Table.Td>
                                        <Group justify="flex-end">
                                            <Button variant="light" size="compact-sm" onClick={() => open(of)}>
                                                {refs.length === 0 ? t("Write") : t("Edit")}
                                            </Button>
                                        </Group>
                                    </Table.Td>
                                </Table.Tr>
                            );
                        })}
                    </Table.Tbody>
                </Table>
            </Card>

            {kind && (
                <Card withBorder radius="sm">
                    <Stack gap="sm">
                        <Group justify="space-between" wrap="wrap">
                            <Title order={4}>{label(kind)}</Title>
                            <Group gap="xs">
                                {refsOf(kind).length > 0 && (
                                    <Button data-testid="stop-publishing" variant="light" color="red" size="compact-sm" loading={busy} onClick={onUnpublish}>
                                        {t("Stop publishing")}
                                    </Button>
                                )}
                                <Button data-testid="publish" size="compact-sm" loading={busy} onClick={onPublish}>{t("Publish")}</Button>
                            </Group>
                        </Group>

                        {loading ? <Center my="md"><Loader /></Center> : (
                            <>
                                <LanguageTabs
                                    value={editing}
                                    languages={languages}
                                    onChange={setEditing}
                                    onAdd={tag => { setSources({ ...sources, [tag]: "" }); setEditing(tag); }}
                                    onRemove={tag => {
                                        const rest = { ...sources };
                                        delete rest[tag];
                                        setSources(rest);
                                        if (editing === tag) setEditing(DEFAULT_LANGUAGE);
                                    }}
                                />
                                <ContentEditor
                                    value={source}
                                    onChange={value => setSources({ ...sources, [editing]: value })}
                                    attachments={attachments}
                                />
                            </>
                        )}

                        {revisions && revisions.length > 0 && (
                            <Stack gap={4}>
                                <Text size="sm" fw={500}>{t("Earlier revisions")}</Text>
                                {/* Kept rather than replaced: which document was
                                    in force on a given day is a question somebody
                                    is owed an answer to. */}
                                {revisions.map((ref, index) => (
                                    <Text key={`${ref.fileId}-${index}`} size="xs" c="dimmed">
                                        {ref.language ?? t("Default statement")}
                                        {ref.validFrom ? <> · <ActivityTime value={ref.validFrom} timeZone="Europe/Warsaw" hideZone /></> : null}
                                        {ref.isTemplate ? ` · ${t("template")}` : ""}
                                    </Text>
                                ))}
                            </Stack>
                        )}
                    </Stack>
                </Card>
            )}

            <Text size="xs" c="dimmed">
                {t("A document is published as of now. Withdrawing one removes its links everywhere; the revisions already published stay readable.")}
            </Text>
        </Stack>
    );
}
