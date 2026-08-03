import { Alert, Anchor, Button, Code, Group, Image, Paper, Stack, Text, Title } from "@mantine/core";
import { IconAlertTriangle, IconCheck, IconCopy, IconFileOff } from "@tabler/icons-react";
import katex from "katex";
import "katex/dist/katex.min.css";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Attachment } from "../api/ParticipantApi";
import CodeHighlight from "../components/codehighlight/CodeHighlight";
import { CopyButton } from "../components/buttons";
import { splitInline } from "./latex";
import { ContentBlock, ContentError } from "./types";
import { tryValidateContent } from "./validate";

/**
 * Renders a validated `content.json` document.
 *
 * KaTeX output is injected as HTML, which is safe here only because the document
 * has already been validated: the LaTeX subset refuses every command KaTeX gates
 * behind `trust`, and the format admits no raw HTML at all. If either of those
 * changes, this stops being safe.
 */

const KATEX_OPTIONS = {
    trust: false,
    strict: "warn" as const,
    throwOnError: false,
};

const Math = ({ text, display }: { text: string; display?: boolean }) => {
    const html = useMemo(
        () => katex.renderToString(text, { ...KATEX_OPTIONS, displayMode: !!display }),
        [text, display]
    );
    return (
        <span
            style={display ? { display: "block", textAlign: "center", margin: "0.75rem 0" } : undefined}
            dangerouslySetInnerHTML={{ __html: html }}
        />
    );
};

/** Paragraph text with `$…$` maths woven through it. */
const Inline = ({ text }: { text: string }) => (
    <>
        {splitInline(text).map((segment, i) =>
            segment.kind === "math"
                ? <Math key={i} text={segment.text} />
                : <span key={i}>{segment.text}</span>
        )}
    </>
);

const Sample = ({ input, output, explanation }: { input: string; output: string; explanation?: string }) => {
    const { t } = useTranslation();
    const side = (label: string, value: string) => (
        <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
            <Group justify="space-between" align="center">
                <Text size="sm" fw={600}>{label}</Text>
                <CopyButton value={value}>
                    {({ copied, copy }) => (
                        <Button
                            size="compact-xs"
                            variant="subtle"
                            onClick={copy}
                            leftSection={copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                        >
                            {copied ? t("Copied") : t("Copy")}
                        </Button>
                    )}
                </CopyButton>
            </Group>
            <Code block style={{ whiteSpace: "pre", overflowX: "auto" }}>{value}</Code>
        </Stack>
    );
    return (
        <Paper withBorder p="sm" radius="sm">
            <Group align="flex-start" gap="md" wrap="wrap">
                {side(t("Sample input"), input)}
                {side(t("Sample output"), output)}
            </Group>
            {explanation && (
                <Text size="sm" mt="xs" c="dimmed"><Inline text={explanation} /></Text>
            )}
        </Paper>
    );
};

const Embed = ({ name, caption, attachments }: { name: string; caption?: string; attachments: Attachment[] }) => {
    const { t } = useTranslation();
    const attachment = attachments.find(a => a.name === name);

    // A missing attachment is named rather than left as a broken image: an
    // author needs to know which file the statement is asking for.
    if (!attachment) {
        return (
            <Alert color="yellow" icon={<IconFileOff size={18} />} title={t("Missing attachment")}>
                {name}
            </Alert>
        );
    }
    if (attachment.mimeType === "application/pdf") {
        return (
            <Stack gap={4}>
                <object data={attachment.url} type="application/pdf" width="100%" height="600">
                    <Anchor href={attachment.url}>{name}</Anchor>
                </object>
                {caption && <Text size="sm" c="dimmed" ta="center">{caption}</Text>}
            </Stack>
        );
    }
    return (
        <Stack gap={4}>
            <Image src={attachment.url} alt={caption ?? name} fit="contain" mah={480} />
            {caption && <Text size="sm" c="dimmed" ta="center">{caption}</Text>}
        </Stack>
    );
};

/** Mantine's Title takes 1–6; the format allows 1–4. */
const headingOrder = (level: number): 1 | 2 | 3 | 4 =>
    level >= 1 && level <= 4 ? (level as 1 | 2 | 3 | 4) : 3;

const Block = ({ block, attachments }: { block: ContentBlock; attachments: Attachment[] }) => {
    switch (block.type) {
        case "heading":
            return <Title order={headingOrder(block.level)}>{block.text}</Title>;
        case "paragraph":
            return <Text><Inline text={block.text} /></Text>;
        case "latex":
            return <Math text={block.text} display />;
        case "codeblock":
            return <CodeHighlight code={block.text} language={block.language} />;
        case "embed":
            return <Embed name={block.attachment} caption={block.caption} attachments={attachments} />;
        case "sample":
            return <Sample input={block.input} output={block.output} explanation={block.explanation} />;
    }
};

const ContentFailure = ({ error }: { error: ContentError }) => {
    const { t } = useTranslation();
    return (
        <Alert color="red" icon={<IconAlertTriangle size={18} />} title={t("Statement could not be displayed")}>
            <Text size="sm">
                {error.blockIndex === undefined
                    ? error.message
                    : `${t("Block")} ${error.blockIndex + 1}: ${error.message}`}
            </Text>
        </Alert>
    );
};

export interface ContentViewProps {
    /** The raw document, straight from the API. Validated here. */
    content: unknown;
    attachments?: Attachment[];
}

export default function ContentView({ content, attachments = [] }: ContentViewProps) {
    const result = useMemo(() => tryValidateContent(content), [content]);

    if ("error" in result) {
        return <ContentFailure error={result.error} />;
    }

    // Rendering can still fail on a formula the validator accepted, and one bad
    // block must not take the page with it.
    try {
        return (
            <Stack gap="md">
                {result.document.blocks.map((block, i) => (
                    <Block key={i} block={block} attachments={attachments} />
                ))}
            </Stack>
        );
    } catch (error) {
        return <ContentFailure error={error instanceof ContentError ? error : new ContentError(String(error))} />;
    }
}
