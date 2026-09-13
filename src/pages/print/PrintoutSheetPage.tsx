import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { PrintoutSheet } from "../../api/ManagerApi";
import LoadState from "../../components/LoadState";
import { useApiEffect } from "../../provider/apiContext";
import classes from "./PrintoutSheetPage.module.css";
import { formatInZone, offsetLabel } from "../../components/time/format";

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
    //
    // **And the tab closes itself when the dialog does.** On `afterprint`
    // rather than on the line after `print()`: the two look the same in a
    // browser that blocks, and differ in one that does not — and a tab that
    // vanished before the dialog appeared would be a page nobody could print.
    // Guarded on having an opener, because a tab somebody typed the address
    // into cannot be closed by script and the attempt only logs an error.
    useEffect(() => {
        if (!sheet) return;

        const done = () => { if (window.opener) window.close(); };
        window.addEventListener("afterprint", done);
        const at = requestAnimationFrame(() => requestAnimationFrame(() => window.print()));

        return () => {
            window.removeEventListener("afterprint", done);
            cancelAnimationFrame(at);
        };
    }, [sheet]);

    if (!sheet) return <LoadState error={error} loading={!error} />;

    const { printout } = sheet;
    // **The activity's own zone — the one exception to showing the reader's.**
    // Paper leaves the browser and is carried to a room, so it has no reader to
    // be local to; a time on it has to read as the room did rather than as the
    // operator's laptop does. The zone is named beside it, because the operator
    // matching paper against the queue is now reading two different clocks.
    //
    // The locale was `undefined` — the operating system's, not the interface's —
    // so a Polish sheet printed `Jul 15, 2026, 2:00 PM` on an English laptop.
    const asked = formatInZone(printout.requestedAt, sheet.timeZone);
    const askedZone = `${offsetLabel(printout.requestedAt, sheet.timeZone)} (${sheet.timeZone})`;

    const lines = (sheet.source ?? "").replace(/\n$/, "").split("\n");

    return (
        <div className={classes.sheet} data-testid="printout-sheet">
            <header className={classes.header}>
                <p className={classes.who} data-testid="sheet-who">
                    {printout.requestedByName}
                    {printout.groupName && <span className={classes.dim}> · {printout.groupName}</span>}
                </p>
                <p className={classes.meta} data-testid="sheet-when">
                    {asked} <span className={classes.dim}>{askedZone}</span> · {printout.activityName}
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
