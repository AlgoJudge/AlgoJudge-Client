import { Anchor, Group, Image, Modal, Stack, Text, Title } from "@mantine/core";
import { useTranslation } from "react-i18next";
import PdfStatement from "../../content/PdfStatement";

/** What a row has to be able to say about itself for this to open it. */
export interface PreviewableFile {
    name: string;
    mimeType: string;
    /**
     * Where the bytes are. Absent while a file is being published and has not
     * been stored, which is a state this window says out loud.
     *
     * An **address**, resolved by whoever opens this: a stored file's is built
     * from its id, and one staged in the editor is a blob URL over the bytes in
     * hand. Naming it `url` invited a caller to hand over whatever field it had.
     */
    address?: string;
}

/**
 * A stored file, shown where it is listed.
 *
 * **Because the alternative is downloading it to find out.** A manager checking
 * that the right figure went up, or that an imported statement is the problem
 * they meant, had to save the file and open it outside the browser — for a PDF
 * fetched from an archive, that is the only way to see what was imported at all.
 *
 * Driven by `mimeType` and an address, because that is what a row can always
 * answer — a stored file and one staged in the editor are the same question
 * here and have different answers. `PdfStatement` already knows how to frame a
 * PDF; this adds a window around it and nothing else.
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
            {file?.address === undefined ? (
                <Text c="dimmed">{t("This file has not been stored yet, so there is nothing to show.")}</Text>
            ) : pdf ? (
                <PdfStatement url={file.address} name={file.name} />
            ) : (
                <Stack gap="sm">
                    {/* `fit="contain"` and no fixed height: a figure is looked at
                        to check it is the right one, so it is shown whole rather
                        than cropped to a tidy box. */}
                    <Image src={file.address} alt={file.name} fit="contain" mah="78vh" />
                    <Group justify="flex-end">
                        <Anchor href={file.address} download={file.name} size="sm">
                            {t("Download")}
                        </Anchor>
                    </Group>
                </Stack>
            )}
        </Modal>
    );
}
