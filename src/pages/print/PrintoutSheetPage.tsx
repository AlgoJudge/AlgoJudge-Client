import { useEffect, useState } from "react";
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
 * **It prints itself.** The tab exists to produce paper and nothing else, so
 * the dialog opens as soon as there is something to print — the operator chose
 * the tray on the last one and would otherwise press Ctrl+P on every page. The
 * tab stays open behind the dialog, so a jam is a reload rather than a lost
 * request.
 */
export default function PrintoutSheetPage() {
    const { t } = useTranslation();
    const { printoutId } = useParams();
    const [sheet, setSheet] = useState<PrintoutSheet | undefined>(undefined);

    const error = useApiEffect(async (api) => {
        if (!printoutId) return;
        setSheet(await api.managerApi.getPrintoutSheet(printoutId));
    }, [printoutId]);

    // **After the paint, not on the state change.** `print()` blocks the thread
    // until the dialog closes, so calling it before the browser has laid the
    // page out prints the empty frame that was on screen when it was called.
    useEffect(() => {
        if (!sheet) return;
        const at = requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
        return () => cancelAnimationFrame(at);
    }, [sheet]);

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
