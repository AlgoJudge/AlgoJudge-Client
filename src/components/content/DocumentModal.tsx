import { Center, Loader, Modal, Text, Title } from "@mantine/core";
import { lazy, Suspense, useState } from "react";
import { useTranslation } from "react-i18next";
import { useApiEffect } from "../../provider/apiContext";

const ContentView = lazy(() => import("../../content/ContentView"));

/**
 * A document read without leaving the form that asked about it.
 *
 * Two forms make somebody accept something before they may go on — registering,
 * and enrolling in an activity — and both used to link away to the document.
 * Somebody who did the reasonable thing and opened the privacy policy before
 * ticking the box came back to an empty form, which teaches people to tick
 * without reading. Nothing navigates here.
 *
 * The text is fetched when the modal opens, not with the page: most readers tick
 * without opening it, and a policy is tens of kilobytes.
 */
export interface DocumentModalProps {
    opened: boolean;
    onClose: () => void;
    title: string;
    /** The stored text. Absent closes it: there is no document to read. */
    fileId?: string;
}

export default function DocumentModal({ opened, onClose, title, fileId }: DocumentModalProps) {
    const { t } = useTranslation();
    // Null rather than undefined for "asked, and there is none".
    const [content, setContent] = useState<string | undefined | null>(undefined);

    const error = useApiEffect(async (api) => {
        if (!opened || !fileId) return;
        setContent(undefined);
        setContent(await api.fileApi.getText(fileId));
    }, [opened, fileId]);

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title={<Title order={4}>{title}</Title>}
            size="lg"
            centered
        >
            {error ? (
                <Text c="red" size="sm">
                    {error instanceof Error ? error.message : String(error)}
                </Text>
            ) : content === undefined ? (
                <Center my="xl"><Loader /></Center>
            ) : content === null ? (
                <Text c="dimmed" size="sm">{t("There is no such page here")}</Text>
            ) : (
                <Suspense fallback={<Center my="xl"><Loader /></Center>}>
                    <ContentView content={content} attachments={[]} />
                </Suspense>
            )}
        </Modal>
    );
}
