import { ActionIcon, Button, Group, Modal, Stack, Tabs, Text, TextInput, Tooltip } from "@mantine/core";
import { IconPlus, IconX } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { languageName } from "./languageName";

/**
 * Which language of a statement is being edited.
 *
 * The default (`content.md`) always exists and cannot be removed: it is what a
 * reader falls back to, so deleting it would leave a problem that renders in
 * some interface languages and not others.
 */

/**
 * The key the default statement is held under. Not the empty string: Mantine's
 * `Tabs` rejects an empty value, and `*` can never be a language subtag, so it
 * cannot collide with one a manager adds.
 */
export const DEFAULT_LANGUAGE = "*";

const SUBTAG = /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i;

const ADD = "__add";

export interface LanguageTabsProps {
    value: string;
    /** Every language present, including {@link DEFAULT_LANGUAGE}. */
    languages: string[];
    onChange: (language: string) => void;
    onAdd: (language: string) => void;
    onRemove: (language: string) => void;
}

export default function LanguageTabs({ value, languages, onChange, onAdd, onRemove }: LanguageTabsProps) {
    const { t, i18n } = useTranslation();
    const [adding, setAdding] = useState(false);
    const [draft, setDraft] = useState("");

    const ordered = [DEFAULT_LANGUAGE, ...languages.filter(l => l !== DEFAULT_LANGUAGE).sort()];
    const trimmed = draft.trim().toLowerCase();
    const problem = !SUBTAG.test(trimmed)
        ? t("Use a language code such as en or uk")
        : languages.includes(trimmed)
            ? t("That language is already here")
            : undefined;

    return (
        <>
            {/* The add button is a tab so it sits on the same row; selecting it
                is not selecting a language. */}
            <Tabs value={value} onChange={v => v !== null && v !== ADD && onChange(v)}>
                <Tabs.List>
                    {ordered.map(tag => (
                        <Tabs.Tab
                            key={tag}
                            value={tag}
                            rightSection={tag === DEFAULT_LANGUAGE ? undefined : (
                                <Tooltip label={t("Remove this translation")}>
                                    <ActionIcon
                                        component="div"
                                        variant="subtle"
                                        color="gray"
                                        size="xs"
                                        onClick={event => {
                                            // The tab would otherwise switch to the
                                            // language being deleted on its way out.
                                            event.stopPropagation();
                                            onRemove(tag);
                                        }}
                                    >
                                        <IconX size={12} />
                                    </ActionIcon>
                                </Tooltip>
                            )}
                        >
                            {tag === DEFAULT_LANGUAGE
                                ? t("Default statement")
                                : `${languageName(tag, i18n.language)} (${tag})`}
                        </Tabs.Tab>
                    ))}
                    <Tabs.Tab value={ADD} onClick={() => setAdding(true)}>
                        <Group gap={4}><IconPlus size={12} />{t("Language")}</Group>
                    </Tabs.Tab>
                </Tabs.List>
            </Tabs>

            <Modal opened={adding} onClose={() => setAdding(false)} title={t("Add a language")} centered>
                <Stack gap="sm">
                    <TextInput
                        label={t("Language code")}
                        description={t("A BCP-47 subtag. The file is stored as content-<code>.md")}
                        placeholder="en"
                        value={draft}
                        onChange={e => setDraft(e.currentTarget.value)}
                        error={draft.length > 0 ? problem : undefined}
                    />
                    <Text size="sm" c="dimmed">
                        {t("A reader gets this statement when it matches their interface language, and the default otherwise.")}
                    </Text>
                    <Group justify="space-between">
                        <Button data-testid="back" variant="default" onClick={() => setAdding(false)}>{t("Back")}</Button>
                        <Button data-testid="save"
                            disabled={problem !== undefined}
                            onClick={() => { onAdd(trimmed); setDraft(""); setAdding(false); }}
                        >
                            {t("Save")}
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </>
    );
}
