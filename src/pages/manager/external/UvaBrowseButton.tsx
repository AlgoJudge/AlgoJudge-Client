import { Alert, Button, Modal, Title } from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";
import { ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { UvaProblemPicker, type UvaPickerProblem } from "@algojudge/uva-explorer-react";
import { ApiError, NotFoundError } from "../../../api/ApiError";
import { useApiCall } from "../../../provider/apiContext";
import { Access, usable } from "./access";

/**
 * The button that opens the UVa archive, and the window it opens it in.
 *
 * **Shared, because the archive is not a settings screen's private business.**
 * It began on the external-content page, next to the box you type problem
 * numbers into — which is the one place a manager already knows the numbers.
 * Somebody looking for a problem to set does not, and they are on the problems
 * screen.
 *
 * What the caller keeps is what to do with a selection: importing is the same
 * call either way, but where the result is shown is not.
 */
export function UvaBrowseButton({
    children,
    disabled,
    variant,
    leftSection,
    onPicked,
    onRefused,
}: {
    children: ReactNode;
    disabled?: boolean;
    variant?: string;
    leftSection?: ReactNode;
    /** What a confirmed selection is for. Awaited, and the window closes after. */
    onPicked: (problems: UvaPickerProblem[]) => Promise<void> | void;
    /**
     * A credential this installation holds and could not spend, or `undefined`
     * to say the last refusal no longer applies.
     *
     * **An object rather than a bare code**, because a refusal may legitimately
     * carry no code and that has to stay distinguishable from clearing. Written
     * as `code: string | undefined` it was not: opening the picker cleared with
     * `undefined`, and a caller that turned a code into a sentence eagerly drew
     * "the archive could not be asked" every time somebody clicked the button.
     *
     * Reported rather than drawn, because the two screens using this put their
     * refusals in different places — a button that grows an alert underneath
     * itself would break the row it sits in on one of them.
     */
    onRefused?: (refusal: { code?: string } | undefined) => void;
}) {
    const { t, i18n } = useTranslation();
    const call = useApiCall();

    const [picking, setPicking] = useState(false);
    const [access, setAccess] = useState<Access | undefined>(undefined);

    /**
     * Opens the picker with whatever credential this installation can produce.
     *
     * **Three outcomes, and they are not two.** A credential opens the archive
     * with this installation's private metadata. **No key at all is a 404 and
     * opens the public archive** — an installation that holds none has decided to
     * browse anonymously, and that is a working mode. Anything else is a
     * refusal: an installation that holds a key and could not spend it has
     * something wrong with it, and degrading quietly to anonymous would hide a
     * broken configuration behind a picker that merely looks short of metadata.
     */
    const browse = async () => {
        onRefused?.(undefined);

        if (usable(access)) {
            setPicking(true);
            return;
        }

        try {
            // Asked for when it is needed and not before: a screen nobody opened
            // should not have spent one of the archive's tokens.
            const answer = await call(api => api.managerApi.requestAccessKey("uvaexplorer"));
            setAccess({ value: answer.value, expiresAt: answer.expiresAt });
        }
        catch (error) {
            if (error instanceof NotFoundError) {
                setAccess("anonymous");
            }
            else {
                onRefused?.({ code: error instanceof ApiError ? error.code : undefined });
                return;
            }
        }

        setPicking(true);
    };

    const confirm = async (problems: UvaPickerProblem[]) => {
        try {
            await onPicked(problems);
        } finally {
            setPicking(false);
        }
    };

    return (
        <>
            <Button
                variant={variant}
                leftSection={leftSection}
                disabled={disabled}
                onClick={() => void browse()}
            >
                {children}
            </Button>

            {/* **Most of the window, because the archive is a screen and not a
                field.** It carries its own search, filters and statement panel,
                and the 520px strip it used to live in showed about four rows of
                a list somebody is scrolling to make a decision. */}
            <Modal
                opened={picking}
                onClose={() => setPicking(false)}
                title={<Title order={4}>{t("Problems in the UVa archive")}</Title>}
                // **Viewport units, not a percentage.** `size` lands on
                // `width: var(--modal-size)`, and a percentage there resolves
                // against the inner box Mantine has already inset by its own
                // offsets — measured at a 1500px viewport, `80%` drew 1080px,
                // which is 80% of 1350 and 72% of the screen.
                size="80vw"
                centered
                data-testid="uva-picker"
                styles={{
                    // **The height, which `size` cannot express** — it is the
                    // width and nothing else. The column, and `minHeight: 0`
                    // under it, are what let the iframe take the rest: a flex
                    // child refuses to shrink past its content without it, and
                    // an iframe's content is a whole page.
                    content: { height: "90vh", display: "flex", flexDirection: "column" },
                    body: {
                        flex: 1,
                        minHeight: 0,
                        display: "flex",
                        flexDirection: "column",
                        gap: "var(--mantine-spacing-sm)",
                    },
                }}
            >
                {access === "anonymous" && (
                    <Alert color="blue" icon={<IconInfoCircle size={18} />}>
                        {t("This installation holds no key for the archive, so you are browsing what it publishes to everybody.")}
                    </Alert>
                )}

                <UvaProblemPicker
                    // Absent for an installation with no key, which is how
                    // the picker is told to browse the public archive.
                    accessToken={access === "anonymous" ? undefined : access?.value}
                    // The reader's language, not the installation's. This was
                    // pinned to Polish while it lived on one screen.
                    language={i18n.language.startsWith("pl") ? "pl" : "en"}
                    options={{
                        showAiPanel: true,
                        showFilters: true,
                        filtersMode: "summary",
                    }}
                    style={{ flex: 1, minHeight: 0, width: "100%", border: 0 }}
                    title={t("Problems in the UVa archive")}
                    onConfirm={message => void confirm(message.problems)}
                    onCancel={() => setPicking(false)}
                />
            </Modal>
        </>
    );
}
