import { Alert, Code, Group, Stack, Text } from "@mantine/core";
import { IconAlertTriangle, IconCopy } from "@tabler/icons-react";
import "katex/dist/katex.min.css";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Attachment } from "../api/ParticipantApi";
import { CopyButton } from "../components/buttons";
import classes from "./ContentView.module.css";
import { createMarkdown, ContentSegment, RenderOptions, Renderer, SampleSegment, toSegments, Token } from "./markdown";
import { referenceName } from "./reference";
import { ContentError } from "./types";
import { tryValidateContent } from "./validate";

/**
 * Renders a validated `content.md` statement.
 *
 * The HTML is injected, which is safe only because of what produced it: the
 * parser runs with raw HTML disabled, so a tag in the source is escaped rather
 * than passed through, and the validator has already refused any reference
 * leaving the document. If either changes, this stops being safe.
 */

const Sample = ({ sample }: { sample: SampleSegment }) => {
    const { t } = useTranslation();
    const side = (label: string, value: string) => (
        <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
            <Group justify="space-between" align="center">
                <Text size="sm" fw={600}>{label}</Text>
                {/* The children render the label; the button is the component
                    itself, and it shows its own confirmation. */}
                <CopyButton value={value} size="compact-xs" variant="subtle">
                    {() => (
                        <Group gap={6} wrap="nowrap">
                            <IconCopy size={14} />
                            {t("Copy")}
                        </Group>
                    )}
                </CopyButton>
            </Group>
            <Code block style={{ whiteSpace: "pre", overflowX: "auto" }}>{value}</Code>
        </Stack>
    );
    return (
        <div className={classes.sample}>
            <Group align="flex-start" gap="md" wrap="wrap">
                {side(t("Sample input"), sample.input)}
                {side(t("Sample output"), sample.output)}
            </Group>
            {sample.explanation && (
                <div
                    className={classes.explanation}
                    dangerouslySetInnerHTML={{ __html: sample.explanation }}
                />
            )}
        </div>
    );
};

const Failure = ({ error }: { error: ContentError }) => {
    const { t } = useTranslation();
    return (
        <Alert color="red" icon={<IconAlertTriangle size={18} />} title={t("Statement could not be displayed")}>
            <Text size="sm">
                {error.line === undefined ? error.message : `${t("Line")} ${error.line}: ${error.message}`}
            </Text>
        </Alert>
    );
};

export interface ContentViewProps {
    /** The raw Markdown, straight from the attachment. Validated here. */
    content: unknown;
    attachments?: Attachment[];
}

export default function ContentView({ content, attachments = [] }: ContentViewProps) {
    const { t } = useTranslation();

    const result = useMemo(() => {
        const validated = tryValidateContent(content);
        if ("error" in validated) return validated;

        const md = createMarkdown();
        // An image names an attachment, so the renderer resolves it here rather
        // than trusting whatever the source wrote. A name with no attachment is
        // said out loud instead of leaving a broken image.
        md.renderer.rules.image = (tokens: Token[], index: number) => {
            const token = tokens[index];
            const name = referenceName(String(token.attrGet("src") ?? ""));
            const attachment = attachments.find(a => a.name === name);
            const alt = md.utils.escapeHtml(token.content);
            if (!attachment) {
                return `<span class="${classes.missing}">${t("Missing attachment")}: ${md.utils.escapeHtml(name)}</span>`;
            }
            if (attachment.mimeType === "application/pdf") {
                return `<object data="${md.utils.escapeHtml(attachment.url)}" type="application/pdf" width="100%" height="600"></object>`;
            }
            return `<img src="${md.utils.escapeHtml(attachment.url)}" alt="${alt}" loading="lazy" />`;
        };
        // A link to a PDF attachment becomes an embed; anything else the
        // validator already restricted to this problem's own files.
        md.renderer.rules.link_open = (tokens: Token[], index: number, options: RenderOptions, _env: unknown, self: Renderer) => {
            const href = referenceName(String(tokens[index].attrGet("href") ?? ""));
            const attachment = attachments.find(a => a.name === href);
            if (attachment) tokens[index].attrSet("href", attachment.url);
            tokens[index].attrSet("rel", "noopener");
            return self.renderToken(tokens, index, options);
        };

        try {
            return { segments: toSegments(md, validated.document.body, attachments) };
        } catch (error) {
            return { error: error instanceof ContentError ? error : new ContentError(String(error)) };
        }
    }, [content, attachments, t]);

    if ("error" in result) return <Failure error={result.error} />;

    return (
        <Stack gap="md" className={classes.content}>
            {result.segments.map((segment: ContentSegment, i) =>
                segment.kind === "sample"
                    ? <Sample key={i} sample={segment} />
                    : <div key={i} dangerouslySetInnerHTML={{ __html: segment.html }} />
            )}
        </Stack>
    );
}
