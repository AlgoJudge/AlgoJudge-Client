import { Anchor, Group, Stack } from "@mantine/core";
import { IconDownload } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";

/**
 * A statement that is a PDF rather than Markdown.
 *
 * **Shown, not merely offered.** A `content.pdf` used to be handed over as a
 * download link and nothing else, which reads as a missing statement — the page
 * has a heading, a submit button and, where the problem should be, a file name.
 * That was tolerable while every problem here was written in Markdown; a problem
 * imported from an archive has a PDF and nothing else, and the participant
 * should not have to fetch their own reading material.
 *
 * `<object>` rather than an `<iframe>` or a viewer library: it is the same
 * mechanism a PDF attachment inside a Markdown statement already uses, it needs
 * no dependency, and a browser that will not draw it falls through to the
 * children — which is why the download link stays, below, as the thing that
 * always works.
 */
export default function PdfStatement({ url, name }: { url: string; name: string }) {
    const { t } = useTranslation();

    return (
        <Stack gap="xs">
            <object data={url} type="application/pdf" width="100%" height={720} aria-label={name}>
                {/* Reached only when the browser draws no PDF of its own. */}
                <Group gap="xs">
                    <IconDownload size={16} />
                    <Anchor href={url} target="_blank" rel="noreferrer">
                        {t("This browser cannot show the statement. Open {{name}}", { name })}
                    </Anchor>
                </Group>
            </object>

            {/* Beside it as well as inside it: somebody reading on a small screen
                wants the file, not a frame seven hundred pixels tall. */}
            <Group gap="xs">
                <IconDownload size={16} />
                <Anchor href={url} target="_blank" rel="noreferrer">{name}</Anchor>
            </Group>
        </Stack>
    );
}
