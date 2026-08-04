import { ActionIcon, Alert, Button, Card, Group, Menu, NumberInput, Select, Stack, Text, Textarea, TextInput, Tooltip } from "@mantine/core";
import {
    IconAlertTriangle,
    IconArrowDown,
    IconArrowUp,
    IconCheck,
    IconCode,
    IconHeading,
    IconMath,
    IconPhoto,
    IconPlus,
    IconTestPipe,
    IconTrash,
    IconTypography,
} from "@tabler/icons-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ContentBlock, CONTENT_VERSION } from "../../content/types";
import { tryValidateContent } from "../../content/validate";

/**
 * Edits a `content.json` statement as a list of blocks.
 *
 * A block list rather than a WYSIWYG surface: the format is closed by design —
 * an unknown block is refused, not passed through — and a rich-text editor over
 * a closed block set with LaTeX in it is a project of its own. Here every block
 * is a small form, which is also what makes the constraints visible instead of
 * something the editor silently repairs.
 */

const BLOCK_TYPES = ["heading", "paragraph", "latex", "codeblock", "embed", "sample"] as const;
type BlockType = typeof BLOCK_TYPES[number];

const BLOCK_ICON: Record<BlockType, typeof IconHeading> = {
    heading: IconHeading,
    paragraph: IconTypography,
    latex: IconMath,
    codeblock: IconCode,
    embed: IconPhoto,
    sample: IconTestPipe,
};

const emptyBlock = (type: BlockType): ContentBlock => {
    switch (type) {
        case "heading": return { type, level: 2, text: "" };
        case "paragraph": return { type, text: "" };
        case "latex": return { type, text: "" };
        case "codeblock": return { type, text: "" };
        case "embed": return { type, attachment: "" };
        case "sample": return { type, input: "", output: "" };
    }
};

export interface ContentEditorProps {
    blocks: ContentBlock[];
    onChange: (blocks: ContentBlock[]) => void;
    /** Names of the participant-scoped attachments an `embed` may point at. */
    attachmentNames: string[];
}

export default function ContentEditor({ blocks, onChange, attachmentNames }: ContentEditorProps) {
    const { t } = useTranslation();

    // Validated on every keystroke against the same validator the renderer uses,
    // so an author sees the refusal while writing rather than after publishing.
    const validation = useMemo(
        () => tryValidateContent({ version: CONTENT_VERSION, blocks }),
        [blocks]
    );

    const replace = (index: number, block: ContentBlock) =>
        onChange(blocks.map((b, i) => i === index ? block : b));

    const move = (index: number, by: number) => {
        const target = index + by;
        if (target < 0 || target >= blocks.length) return;
        const next = [...blocks];
        [next[index], next[target]] = [next[target], next[index]];
        onChange(next);
    };

    const remove = (index: number) => onChange(blocks.filter((_, i) => i !== index));

    const fields = (block: ContentBlock, index: number) => {
        switch (block.type) {
            case "heading":
                return (
                    <Group align="flex-end" grow>
                        <NumberInput
                            label={t("Level")}
                            min={1}
                            max={4}
                            value={block.level}
                            onChange={v => replace(index, { ...block, level: Number(v) || 1 })}
                            w={100}
                        />
                        <TextInput
                            label={t("Text")}
                            value={block.text}
                            onChange={e => replace(index, { ...block, text: e.currentTarget.value })}
                        />
                    </Group>
                );
            case "paragraph":
                return (
                    <Textarea
                        label={t("Text")}
                        description={t("Inline maths between $…$")}
                        value={block.text}
                        onChange={e => replace(index, { ...block, text: e.currentTarget.value })}
                        autosize
                        minRows={3}
                    />
                );
            case "latex":
                return (
                    <Textarea
                        label={t("Formula")}
                        description={t("Written in the allowed LaTeX subset, without the $ delimiters")}
                        value={block.text}
                        onChange={e => replace(index, { ...block, text: e.currentTarget.value })}
                        autosize
                        minRows={2}
                        styles={{ input: { fontFamily: "monospace" } }}
                    />
                );
            case "codeblock":
                return (
                    <Stack gap="xs">
                        <TextInput
                            label={t("Language")}
                            description={t("A hint for highlighting only")}
                            value={block.language ?? ""}
                            onChange={e => replace(index, { ...block, language: e.currentTarget.value || undefined })}
                        />
                        <Textarea
                            label={t("Code")}
                            value={block.text}
                            onChange={e => replace(index, { ...block, text: e.currentTarget.value })}
                            autosize
                            minRows={3}
                            styles={{ input: { fontFamily: "monospace" } }}
                        />
                    </Stack>
                );
            case "embed":
                return (
                    <Stack gap="xs">
                        {/* An embed may only name one of this problem's own
                            attachments, so it is a choice rather than a free
                            field: a document cannot reach outside itself. */}
                        <Select
                            label={t("Attachment")}
                            description={t("One of this problem's own files")}
                            data={attachmentNames}
                            value={block.attachment || null}
                            onChange={v => replace(index, { ...block, attachment: v ?? "" })}
                            searchable
                        />
                        <TextInput
                            label={t("Caption")}
                            value={block.caption ?? ""}
                            onChange={e => replace(index, { ...block, caption: e.currentTarget.value || undefined })}
                        />
                    </Stack>
                );
            case "sample":
                return (
                    <Stack gap="xs">
                        <Group grow align="flex-start">
                            <Textarea
                                label={t("Sample input")}
                                value={block.input}
                                onChange={e => replace(index, { ...block, input: e.currentTarget.value })}
                                autosize
                                minRows={3}
                                styles={{ input: { fontFamily: "monospace" } }}
                            />
                            <Textarea
                                label={t("Sample output")}
                                value={block.output}
                                onChange={e => replace(index, { ...block, output: e.currentTarget.value })}
                                autosize
                                minRows={3}
                                styles={{ input: { fontFamily: "monospace" } }}
                            />
                        </Group>
                        <Textarea
                            label={t("Explanation")}
                            value={block.explanation ?? ""}
                            onChange={e => replace(index, { ...block, explanation: e.currentTarget.value || undefined })}
                            autosize
                            minRows={2}
                        />
                    </Stack>
                );
        }
    };

    return (
        <Stack gap="sm">
            {"error" in validation ? (
                <Alert color="red" icon={<IconAlertTriangle size={18} />} title={t("The statement is not valid")}>
                    {validation.error.blockIndex === undefined
                        ? validation.error.message
                        : `${t("Block")} ${validation.error.blockIndex + 1}: ${validation.error.message}`}
                </Alert>
            ) : (
                <Alert color="teal" icon={<IconCheck size={18} />} p="xs">
                    <Text size="sm">{t("The statement is valid")}</Text>
                </Alert>
            )}

            {blocks.map((block, index) => {
                const Icon = BLOCK_ICON[block.type];
                return (
                    <Card key={index} withBorder radius="sm" p="sm">
                        <Group justify="space-between" mb="xs">
                            <Group gap="xs">
                                <Icon size={16} />
                                <Text fw={600} size="sm">{t(`block.${block.type}`)}</Text>
                                <Text size="xs" c="dimmed">#{index + 1}</Text>
                            </Group>
                            <Group gap={4}>
                                <ActionIcon variant="subtle" disabled={index === 0} onClick={() => move(index, -1)}>
                                    <IconArrowUp size={16} />
                                </ActionIcon>
                                <ActionIcon variant="subtle" disabled={index === blocks.length - 1} onClick={() => move(index, 1)}>
                                    <IconArrowDown size={16} />
                                </ActionIcon>
                                <Tooltip label={t("Delete")}>
                                    <ActionIcon variant="subtle" color="red" onClick={() => remove(index)}>
                                        <IconTrash size={16} />
                                    </ActionIcon>
                                </Tooltip>
                            </Group>
                        </Group>
                        {fields(block, index)}
                    </Card>
                );
            })}

            <Menu>
                <Menu.Target>
                    <Button variant="light" leftSection={<IconPlus size={16} />}>{t("Add block")}</Button>
                </Menu.Target>
                <Menu.Dropdown>
                    {BLOCK_TYPES.map(type => {
                        const Icon = BLOCK_ICON[type];
                        return (
                            <Menu.Item
                                key={type}
                                leftSection={<Icon size={16} />}
                                onClick={() => onChange([...blocks, emptyBlock(type)])}
                            >
                                {t(`block.${type}`)}
                            </Menu.Item>
                        );
                    })}
                </Menu.Dropdown>
            </Menu>
        </Stack>
    );
}
