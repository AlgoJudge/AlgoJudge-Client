import { Button, Group, Modal, Select, Stack, Text, TextInput } from "@mantine/core";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * One dialog for every copy in the product — an activity, a round, a problem.
 *
 * **A copy is a shape, not a history**, and the person making one has to be told
 * what that costs before they make it. The activity list has said so since
 * duplication was built; the problem library duplicated from a bare icon with no
 * sentence anywhere, and rounds could not be copied at all. Three copies with
 * three different amounts of explanation is three different products.
 *
 * The sentences are passed in rather than assembled here: what a copy of a round
 * carries is not what a copy of a problem carries, and a component composing
 * that from flags would need a translation key per combination — which
 * `check:i18n` cannot see, because it reads only calls written out in full.
 */

export interface CopyChoice {
    name: string;
    /** ISO-8601, or empty where the copy is not dated. */
    date: string;
    /** Where it goes, where that was a choice. */
    target?: string;
}

export interface CleanCopyModalProps {
    opened: boolean;
    onClose: () => void;
    title: string;
    /** What travels, in one sentence. */
    carries: string;
    /** What deliberately does not, in one sentence. */
    drops: string;
    /** Absent where the copy names itself — a problem's slug is derived. */
    name?: { label: string; placeholder?: string };
    /**
     * Absent where nothing about the copy is dated.
     *
     * **The one field a copy cannot infer.** Everything else moves by the same
     * amount, so this decides where the copy sits in time — and an import or a
     * copy that quietly kept last term's deadlines is the failure both features
     * exist to prevent.
     */
    date?: { label: string };
    /** Where the copy goes. Absent where there is nothing to choose. */
    target?: {
        label: string;
        description?: string;
        options: { value: string; label: string }[];
        initial: string;
    };
    confirmLabel: string;
    busy?: boolean;
    onConfirm: (chosen: CopyChoice) => void | Promise<void>;
}

export default function CleanCopyModal({
    opened, onClose, title, carries, drops, name, date, target, confirmLabel, busy, onConfirm,
}: CleanCopyModalProps) {
    const { t } = useTranslation();

    const [chosenName, setChosenName] = useState("");
    const [chosenDate, setChosenDate] = useState("");
    const [chosenTarget, setChosenTarget] = useState(target?.initial ?? "");

    // Reopening starts from nothing rather than from the last copy's answers: a
    // slug left in the field is the one thing that would be refused, and a date
    // left in it is the one thing nobody would look at twice.
    useEffect(() => {
        if (!opened) return;
        setChosenName("");
        setChosenDate("");
        setChosenTarget(target?.initial ?? "");
    }, [opened, target?.initial]);

    const ready = (!name || chosenName.trim().length > 0)
        && (!date || chosenDate.length > 0)
        && (!target || chosenTarget.length > 0);

    return (
        <Modal opened={opened} onClose={onClose} title={title}>
            <Stack gap="sm">
                <Text size="sm">{carries}</Text>
                <Text size="sm" c="dimmed">{drops}</Text>

                {target && (
                    <Select
                        label={target.label}
                        description={target.description}
                        data={target.options}
                        value={chosenTarget}
                        onChange={value => value && setChosenTarget(value)}
                        allowDeselect={false}
                        searchable
                    />
                )}

                {name && (
                    <TextInput
                        label={name.label}
                        placeholder={name.placeholder}
                        value={chosenName}
                        onChange={event => setChosenName(event.currentTarget.value)}
                    />
                )}

                {date && (
                    <TextInput
                        type="datetime-local"
                        label={date.label}
                        value={chosenDate}
                        onChange={event => setChosenDate(event.currentTarget.value)}
                    />
                )}

                <Group justify="flex-end">
                    <Button variant="default" onClick={onClose}>{t("Back")}</Button>
                    <Button
                        disabled={!ready || busy}
                        loading={busy}
                        onClick={() => onConfirm({
                            name: chosenName.trim(),
                            date: chosenDate ? new Date(chosenDate).toISOString() : "",
                            target: target ? chosenTarget : undefined,
                        })}
                    >
                        {confirmLabel}
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
}
