import { CreatedCredential } from "../../api/ManagerApi";

/**
 * The sheet a manager prints, cuts up and hands out at the door.
 *
 * A page of its own rather than the browser printing the screen: what was
 * printed before was a modal on top of an application, complete with navigation
 * down the side. What somebody needs on paper is one slip per person, big enough
 * to read at arm's length and cut apart without a ruler.
 *
 * Two columns and 50 mm rows put ten slips on a sheet of A4. Each carries where
 * to go, who to be, and the password — and the name of the activity or the
 * installation above them, so a slip found on a desk still says what it opens.
 */

export interface Handout {
    /** Where the credentials are used: the activity, or the installation itself. */
    url: string;
    /** What that place is called, printed above each pair. */
    title: string;
}

const escape = (text: string) => text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const cell = (credential: CreatedCredential | undefined, handout: Handout): string => {
    // An odd number of accounts leaves the last cell empty rather than
    // stretching the one beside it across the page.
    if (!credential) return `<td class="empty"></td>`;
    return `<td>
        <div class="where">${escape(handout.title)}</div>
        <div class="url">${escape(handout.url)}</div>
        <dl>
            <dt>Login</dt><dd>${escape(credential.username)}</dd>
            <dt>Hasło</dt><dd>${escape(credential.password)}</dd>
        </dl>
    </td>`;
};

export const handoutHtml = (credentials: CreatedCredential[], handout: Handout): string => {
    const rows: string[] = [];
    for (let i = 0; i < credentials.length; i += 2) {
        rows.push(`<tr>${cell(credentials[i], handout)}${cell(credentials[i + 1], handout)}</tr>`);
    }

    return `<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8">
<title>${escape(handout.title)}</title>
<style>
    @page { size: A4; margin: 10mm; }
    * { box-sizing: border-box; }
    body {
        margin: 0;
        font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
        color: #000;
    }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    td {
        width: 50%;
        height: 50mm;
        padding: 6mm;
        border: 1px dashed #999;
        vertical-align: top;
        /* A slip must not be split across two sheets: half a password is worse
           than a second page. */
        page-break-inside: avoid;
    }
    td.empty { border-style: none; }
    .where { font-size: 10pt; color: #444; margin-bottom: 1mm; }
    .url { font-family: ui-monospace, "Cascadia Mono", Consolas, monospace; font-size: 10pt; margin-bottom: 4mm; }
    dl { margin: 0; display: grid; grid-template-columns: auto 1fr; gap: 1mm 4mm; align-items: baseline; }
    dt { font-size: 10pt; color: #444; }
    dd {
        margin: 0;
        font-family: ui-monospace, "Cascadia Mono", Consolas, monospace;
        font-size: 15pt;
        font-weight: 600;
        letter-spacing: 0.02em;
        word-break: break-all;
    }
    @media screen {
        body { background: #f5f5f5; padding: 10mm; }
        table { background: #fff; max-width: 210mm; margin: 0 auto; }
    }
</style>
</head>
<body>
<table>${rows.join("")}</table>
</body>
</html>`;
};

/**
 * Opens the sheet in a tab of its own.
 *
 * Must be called straight out of a click, or a popup blocker eats the window
 * before anything is written to it.
 */
export const openHandout = (credentials: CreatedCredential[], handout: Handout): void => {
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(handoutHtml(credentials, handout));
    win.document.close();
};
