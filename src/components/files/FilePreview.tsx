import { Anchor, Group, Image, Modal, Stack, Text, Title } from "@mantine/core";
import { useTranslation } from "react-i18next";
import PdfStatement from "../../content/PdfStatement";

/** What a row has to be able to say about itself for this to open it. */
export interface PreviewableFile {
    name: string;
    mimeType: string;
    /** Absent until the Server has stored it; a staged file carries a blob URL. */
    url?: string;
}

/**
 * A stored file, shown where it is listed.
 *
 * **Because the alternative is downloading it to find out.** A manager checking
 * that the right figure went up, or that an imported statement is the problem
 * they meant, had to save the file and open it outside the browser — for a PDF
 * fetched from an archive, that is the only way to see what was imported at all.
 *
 * Driven by `mimeType` and `url`, which is all an attachment row carries: the
 * list is names and sizes, not file ids, so there is nothing to fetch by. The
 * bytes are already addressable, and `PdfStatement` already knows how to frame a
 * PDF — this adds a window around them and nothing else.
 *
 * Deliberately narrow: {@link canEmbed} decides what may be shown, and anything
 * else keeps the download button it has always had rather than opening a window
 * onto a thing the browser will not draw.
 */
export default function FilePreview({
    file,
    onClose,
}: {
    file: PreviewableFile | undefined;
    onClose: () => void;
}) {
    const { t } = useTranslation();
    const pdf = file?.mimeType === "application/pdf";

    return (
        <Modal
            opened={file !== undefined}
            onClose={onClose}
            title={<Title order={5} ff="monospace">{file?.name}</Title>}
            size="80vw"
            centered
            styles={{
                content: { height: "90vh", display: "flex", flexDirection: "column" },
                body: { flex: 1, minHeight: 0, display: "flex", flexDirection: "column" },
            }}
        >
            {file?.url === undefined ? (
                <Text c="dimmed">{t("This file has not been stored yet, so there is nothing to show.")}</Text>
            ) : pdf ? (
                <PdfStatement url={file.url} name={file.name} />
            ) : (
                <Stack gap="sm">
                    {/* `fit="contain"` and no fixed height: a figure is looked at
                        to check it is the right one, so it is shown whole rather
                        than cropped to a tidy box. */}
                    <Image src={file.url} alt={file.name} fit="contain" mah="78vh" />
                    <Group justify="flex-end">
                        <Anchor href={file.url} download={file.name} size="sm">
                            {t("Download")}
                        </Anchor>
                    </Group>
                </Stack>
            )}
        </Modal>
    );
}
