import { Alert, Code, Group, Stack, Text } from "@mantine/core";
import { IconAlertTriangle, IconCopy } from "@tabler/icons-react";
import "katex/dist/katex.min.css";
import { MouseEvent, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
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
 * than passed through, and **this renderer** decides what every reference in it
 * becomes. If either changes, this stops being safe.
 *
 * References are handled here rather than refused before rendering. A document
 * whose links a reader may not follow is still a document they need — one
 * written before the rule existed, or stored by a Server that did not enforce
 * it, must not go unreadable in the middle of a contest. So an attachment
 * resolves, a path inside the application becomes a link the router follows, and
 * anything else is **censored**: its text stays, its destination does not, and
 * no anchor is emitted for it to be clicked or to leak a referrer.
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

/** A name this document could supply: no path, no scheme. */
const insideDocument = (target: string): boolean => /^[^/\\:?#]+$/.test(target) && !target.includes("..");

/** Somewhere this application can go: its own file, its own path, its own anchor. */
const insideApplication = (target: string): boolean =>
    !target.includes("..")
    && (insideDocument(target)
        || target.startsWith("#")
        || (target.startsWith("/") && !target.startsWith("//") && !target.includes("\\"))
        || /^mailto:[^\s<>@]+@[^\s<>@]+$/i.test(target));

export default function ContentView({ content, attachments = [] }: ContentViewProps) {
    const { t } = useTranslation();
    const navigate = useNavigate();

    const result = useMemo(() => {
        // The format rules only. The references below are this renderer's
        // business, and it censors rather than refuses.
        const validated = tryValidateContent(content, { references: "allow" });
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
                // A name nobody supplied and a picture from another host are two
                // different findings, and the reader is owed the right one.
                const label = insideDocument(name) ? t("Missing attachment") : t("External image removed");
                return `<span class="${classes.missing}">${label}: ${md.utils.escapeHtml(name)}</span>`;
            }
            if (attachment.mimeType === "application/pdf") {
                return `<object data="${md.utils.escapeHtml(attachment.url)}" type="application/pdf" width="100%" height="600"></object>`;
            }
            return `<img src="${md.utils.escapeHtml(attachment.url)}" alt="${alt}" loading="lazy" />`;
        };
        // Links cannot nest in CommonMark, so one flag per open tag, popped by
        // its close, is enough to keep the two rules in step.
        const censoring: boolean[] = [];
        md.renderer.rules.link_open = (tokens: Token[], index: number, options: RenderOptions, _env: unknown, self: Renderer) => {
            const href = referenceName(String(tokens[index].attrGet("href") ?? ""));
            const attachment = attachments.find(a => a.name === href);
            const permitted = attachment !== undefined || insideApplication(href);
            censoring.push(!permitted);
            if (!permitted) {
                return `<span class="${classes.censored}" title="${md.utils.escapeHtml(t("An external link was removed"))}">`;
            }
            if (attachment) tokens[index].attrSet("href", attachment.url);
            tokens[index].attrSet("rel", "noopener");
            return self.renderToken(tokens, index, options);
        };
        md.renderer.rules.link_close = (tokens: Token[], index: number, options: RenderOptions, _env: unknown, self: Renderer) =>
            censoring.pop() ? "</span>" : self.renderToken(tokens, index, options);

        try {
            return { segments: toSegments(md, validated.document.body, attachments) };
        } catch (error) {
            return { error: error instanceof ContentError ? error : new ContentError(String(error)) };
        }
    }, [content, attachments, t]);

    if ("error" in result) return <Failure error={result.error} />;

    // A link inside the application is followed by the router rather than by the
    // browser: the anchors are injected HTML, so there is no `Link` to render,
    // and without this every one of them would reload the whole application.
    const follow = (event: MouseEvent<HTMLDivElement>) => {
        const anchor = (event.target as HTMLElement).closest("a");
        const href = anchor?.getAttribute("href");
        if (!href || !href.startsWith("/") || href.startsWith("//")) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
        event.preventDefault();
        navigate(href);
    };

    return (
        <Stack gap="md" className={classes.content} onClick={follow}>
            {result.segments.map((segment: ContentSegment, i) =>
                segment.kind === "sample"
                    ? <Sample key={i} sample={segment} />
                    : <div key={i} dangerouslySetInnerHTML={{ __html: segment.html }} />
            )}
        </Stack>
    );
}
