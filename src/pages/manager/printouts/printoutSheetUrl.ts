/**
 * Where the sheet lives, as an address a new tab can be opened on.
 *
 * **`BASE_URL` is spliced by hand, and that is not decoration.** The router is
 * created with `basename: import.meta.env.BASE_URL` (`src/App.tsx`), and
 * `window.open` does not go through the router — so an installation served under
 * a sub-path would open a tab on an address that does not exist. The double
 * slash a trailing base leaves is collapsed rather than left, because
 * `//print/...` is a protocol-relative URL to a host called `print`.
 */
export const printoutSheetUrl = (printoutId: string): string =>
    `${import.meta.env.BASE_URL}/print/printouts/${encodeURIComponent(printoutId)}`
        .replace(/\/{2,}/g, "/");
