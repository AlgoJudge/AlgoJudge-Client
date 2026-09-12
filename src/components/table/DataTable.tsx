import { Table, TableProps } from "@mantine/core";
import { ReactNode, useEffect, useRef } from "react";
import classes from "./DataTable.module.css";

export interface DataTableProps extends TableProps {
    /** The width below which the desktop table would start cutting its columns. */
    minWidth?: number;
    children?: ReactNode;
}

/**
 * A table on a desktop, a list of cards on a phone.
 *
 * ## Why a component and not a stylesheet
 *
 * The card layout needs each cell to say which column it came from, and CSS
 * cannot read another element's text. The alternative was a `data-label` typed
 * by hand onto every `<td>` in twenty-three files, which drifts the first time
 * somebody adds a column and never says so. This copies the labels off the
 * header row after each render instead, so a column that moves takes its label
 * with it.
 *
 * ## Why the markup does not change
 *
 * Below `sm` the rows are laid out by `display` alone: the `<table>`, `<tr>` and
 * `<td>` all survive, and so does everything inside them. That is deliberate.
 * `verify-clicks.mjs` clicks `tbody tr td p` and reads its `cursor`, and
 * `verify-submission-origin.mjs` counts `span[style*=pointer]` inside
 * `tbody tr` — both at desktop widths, where none of these rules apply, and
 * both against a DOM this component leaves exactly as it found it.
 *
 * ## The sideways scroll is kept above the breakpoint
 *
 * `minWidth` is what `Table.ScrollContainer` was given, and it still applies
 * from `sm` up: a 900px table on a 800px window should scroll rather than
 * crush its columns. Below `sm` it is dropped, because there the row is no
 * longer a row.
 */
export default function DataTable({ minWidth, children, ...props }: DataTableProps) {
    const ref = useRef<HTMLTableElement>(null);

    // After every render, not just the first: the rows are paginated and
    // filtered, and a fresh `<td>` carries no label of its own.
    useEffect(() => {
        const table = ref.current;
        if (!table) return;

        const headers = [...table.querySelectorAll("thead th")].map(th => th.textContent?.trim() ?? "");
        for (const row of table.querySelectorAll("tbody tr")) {
            [...row.children].forEach((cell, index) => {
                // A cell spanning the table is an empty state or a message, and
                // belongs to no column.
                const spans = Number((cell as HTMLTableCellElement).colSpan ?? 1) > 1;
                const label = spans ? "" : headers[index] ?? "";
                if (label) cell.setAttribute("data-label", label);
                else cell.removeAttribute("data-label");
            });
        }
    });

    return (
        <div className={classes.frame}>
            <Table
                ref={ref}
                className={classes.table}
                style={minWidth ? { "--dt-min-width": `${minWidth}px` } as React.CSSProperties : undefined}
                {...props}
            >
                {children}
            </Table>
        </div>
    );
}
