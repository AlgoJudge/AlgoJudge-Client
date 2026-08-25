/**
 * A ZawodyWeb statement, which is a fragment of HTML, as `content.md`.
 *
 * **Converting is the only honest route.** `src/content/markdown.ts` is
 * configured `html: false` — *"a statement is written by a manager and rendered
 * in every participant's browser; raw HTML would make it an injection
 * surface"* — so passing the fragment through is not available, and neither is
 * turning that setting off for imported problems.
 *
 * `turndown` is imported dynamically, as `yaml` and `fflate` are: only a
 * manager converting an archive pays for it.
 *
 * **A `<pre>` block becomes an ordinary fence and nothing more.** Promoting one
 * to a sample pair — the `in` fence immediately followed by an `out` fence that
 * `CONTENT_FORMAT.md` defines — is a judgement about which block is input and
 * which is output, and a wrong guess puts one where the other belongs. A
 * manager makes it in the editor, on a statement that already reads correctly.
 */

export interface ConvertedStatement {
    markdown: string;
    /** What the conversion could not represent, for the report. */
    lost: string[];
}

/** The front matter every statement carries. See `CONTENT_FORMAT.md`. */
const FRONT_MATTER = "---\nversion: 1\n---\n\n";

/**
 * Tags that carry meaning this conversion drops.
 *
 * Reported rather than silently flattened: a statement whose table became four
 * unrelated paragraphs still reads like a statement, which is exactly why
 * nobody would look at it again.
 */
const WATCHED = ["table", "img", "iframe", "script", "style", "object", "embed"];

export const toMarkdown = async (html: string): Promise<ConvertedStatement> => {
    const { default: TurndownService } = await import("turndown");

    const service = new TurndownService({
        headingStyle: "atx",
        codeBlockStyle: "fenced",
        bulletListMarker: "-",
    });

    // **`<pre>` without a `<code>` inside is what ZawodyWeb writes**, and
    // turndown's default rule only fences the pair — so an example block came
    // out as loose text with its line breaks collapsed by the renderer.
    service.addRule("preformatted", {
        filter: node => node.nodeName === "PRE",
        replacement: (_content, node) => {
            const text = (node as HTMLElement).textContent ?? "";
            return `\n\n\`\`\`\n${text.replace(/\n+$/, "")}\n\`\`\`\n\n`;
        },
    });

    const lost: string[] = [];
    for (const tag of WATCHED) {
        if (new RegExp(`<${tag}[\\s>]`, "i").test(html)) lost.push(tag);
    }

    const markdown = service.turndown(html).trim();
    return { markdown: FRONT_MATTER + markdown + "\n", lost };
};
