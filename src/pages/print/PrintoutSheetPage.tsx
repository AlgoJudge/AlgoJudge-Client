import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { PrintoutSheet } from "../../api/ManagerApi";
import LoadState from "../../components/LoadState";
import { useApiEffect } from "../../provider/apiContext";
import classes from "./PrintoutSheetPage.module.css";

/**
 * One request, as a page of A4.
 *
 * **A route rather than a written tab**, for three reasons each sufficient on
 * its own: the source is not in memory on the queue screen and fetching it means
 * an await; the handout sheet this could have copied hard-codes Polish, which is
 * a defect not to reproduce in a bilingual product; and **a jammed printer needs
 * a reload**, which a `document.write` tab cannot do.
 *
 * **Outside every shell.** Under the application's layout the navigation prints
 * down the side of the page.
 *
 * **No `window.print()`.** The operator presses Ctrl+P when the page looks
 * right, which is also when they have chosen the tray.
 */
export default function PrintoutSheetPage() {
    const { t } = useTranslation();
    const { printoutId } = useParams();
    const [sheet, setSheet] = useState<PrintoutSheet | undefined>(undefined);

    const error = useApiEffect(async (api) => {
        if (!printoutId) return;
        setSheet(await api.managerApi.getPrintoutSheet(printoutId));
    }, [printoutId]);

    if (!sheet) return <LoadState error={error} loading={!error} />;

    const { printout } = sheet;
    // The activity's own zone, so a time on paper reads as the room did rather
    // than as the operator's laptop does.
    const asked = new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: sheet.timeZone,
    }).format(new Date(printout.requestedAt));

    const lines = (sheet.source ?? "").replace(/\n$/, "").split("\n");

    return (
        <div className={classes.sheet} data-testid="printout-sheet">
            <header className={classes.header}>
                <p className={classes.who} data-testid="sheet-who">
                    {printout.requestedByName}
                    {printout.groupName && <span className={classes.dim}> · {printout.groupName}</span>}
                </p>
                <p className={classes.meta} data-testid="sheet-when">
                    {asked} · {printout.activityName}
                </p>
                <p className={`${classes.meta} ${classes.dim}`}>
                    {printout.fileName}
                    {sheet.problemSlug && ` · ${sheet.problemSlug}${sheet.problemName ? ` — ${sheet.problemName}` : ""}`}
                    {printout.title && ` · ${printout.title}`}
                </p>
            </header>

            {sheet.source === undefined ? (
                <p className={classes.gone} data-testid="sheet-disposed">
                    {t("The source of this printout has been disposed of.")}
                </p>
            ) : (
                <div className={classes.listing} data-testid="sheet-source">
                    <div className={classes.gutter}>
                        {lines.map((_, i) => `${i + 1}\n`).join("")}
                    </div>
                    <pre className={classes.code}>{lines.join("\n")}</pre>
                </div>
            )}

            {/* The digest, so a page on a desk can be matched to a row in the
                queue after the source itself is gone. */}
            <footer className={classes.footer} data-testid="sheet-digest">
                {printout.sha256}
            </footer>
        </div>
    );
}
