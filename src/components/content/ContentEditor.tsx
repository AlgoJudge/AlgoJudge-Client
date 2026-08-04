import { Alert, Button, Group, Menu, Stack, Text, Textarea } from "@mantine/core";
import { IconAlertTriangle, IconCheck, IconCode, IconMath, IconPhoto, IconPlus, IconTable, IconTestPipe } from "@tabler/icons-react";
import { useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { imageReference } from "../../content/reference";
import { tryValidateContent } from "../../content/validate";

/**
 * Edits a `content.md` statement.
 *
 * A text area rather than a form per block: the format is Markdown, which
 * problem setters already write, and the editor that fits Markdown is the one
 * that lets them type it. The snippets below are a convenience for the two
 * constructs that are ours — samples and mathematics — not a structure the
 * document has to be built through.
 */

export interface ContentEditorProps {
    value: string;
    onChange: (value: string) => void;
    /** Names of the participant-scoped attachments an image may point at. */
    attachmentNames: string[];
}

const SNIPPETS = [
    { key: "sample", icon: IconTestPipe, text: "```in\n\n```\n\n```out\n\n```\n" },
    { key: "math", icon: IconMath, text: "$$\n\n$$\n" },
    { key: "table", icon: IconTable, text: "| Grupa | Ograniczenie | Punkty |\n|---|---|---|\n| 1 |  |  |\n" },
    { key: "code", icon: IconCode, text: "```cpp\n\n```\n" },
] as const;

export default function ContentEditor({ value, onChange, attachmentNames }: ContentEditorProps) {
    const { t } = useTranslation();
    const area = useRef<HTMLTextAreaElement>(null);

    // Validated on every keystroke by the validator the renderer uses, so an
    // author sees the refusal while writing rather than after publishing.
    const validation = useMemo(() => tryValidateContent(value), [value]);

    const insert = (snippet: string) => {
        const element = area.current;
        const at = element?.selectionStart ?? value.length;
        onChange(value.slice(0, at) + snippet + value.slice(at));
        // Put the caret inside the snippet rather than after it, which is where
        // the next thing typed belongs.
        requestAnimationFrame(() => {
            const offset = at + snippet.indexOf("\n\n") + 1;
            element?.focus();
            element?.setSelectionRange(offset, offset);
        });
    };

    return (
        <Stack gap="sm">
            {"error" in validation ? (
                <Alert color="red" icon={<IconAlertTriangle size={18} />} title={t("The statement is not valid")}>
                    <Text size="sm">
                        {validation.error.line === undefined
                            ? validation.error.message
                            : `${t("Line")} ${validation.error.line}: ${validation.error.message}`}
                    </Text>
                </Alert>
            ) : (
                <Alert color="teal" icon={<IconCheck size={18} />} p="xs">
                    <Text size="sm">{t("The statement is valid")}</Text>
                </Alert>
            )}

            <Group gap="xs" wrap="wrap">
                {SNIPPETS.map(snippet => (
                    <Button
                        key={snippet.key}
                        variant="light"
                        size="compact-sm"
                        leftSection={<snippet.icon size={14} />}
                        onClick={() => insert(snippet.text)}
                    >
                        {t(`snippet.${snippet.key}`)}
                    </Button>
                ))}
                <Menu>
                    <Menu.Target>
                        <Button
                            variant="light"
                            size="compact-sm"
                            leftSection={<IconPhoto size={14} />}
                            disabled={attachmentNames.length === 0}
                        >
                            {t("snippet.image")}
                        </Button>
                    </Menu.Target>
                    <Menu.Dropdown>
                        {/* An image names one of this problem's own attachments, so
                            it is a choice rather than a free field: a statement
                            cannot reach outside itself. */}
                        {attachmentNames.map(name => (
                            <Menu.Item
                                key={name}
                                leftSection={<IconPlus size={14} />}
                                onClick={() => insert(`${imageReference(name)}\n`)}
                            >
                                {name}
                            </Menu.Item>
                        ))}
                    </Menu.Dropdown>
                </Menu>
            </Group>

            <Textarea
                ref={area}
                value={value}
                onChange={e => onChange(e.currentTarget.value)}
                autosize
                minRows={24}
                maxRows={60}
                spellCheck={false}
                styles={{ input: { fontFamily: "monospace", fontSize: 13, lineHeight: 1.5 } }}
            />
        </Stack>
    );
}
