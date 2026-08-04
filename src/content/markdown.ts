import MarkdownIt from "markdown-it";
import anchor from "markdown-it-anchor";
import footnote from "markdown-it-footnote";
import katex from "@vscode/markdown-it-katex";
import { Attachment } from "../api/ParticipantApi";

/**
 * `markdown-it` exports a constructor rather than the instance type, and its
 * type package moves the individual files between releases. Deriving the names
 * from the instance keeps them correct without importing a path.
 */
export type Markdown = ReturnType<typeof MarkdownIt>;

/**
 * A CommonJS plugin arrives as the function under a bundler and as
 * `{ default: fn }` under Node's own interop. The parser is built in both — the
 * browser and `npm run check:content` — so the shape is resolved rather than
 * assumed.
 */
const plugin = <T>(module: T): T =>
    (typeof module === "object" && module !== null && "default" in module
        ? (module as { default: T }).default
        : module);

export type Token = ReturnType<Markdown["parse"]>[number];
export type Renderer = Markdown["renderer"];
export type RenderOptions = Markdown["options"];

/**
 * The parser, configured once.
 *
 * Two settings carry the format's safety rules and neither is decoration:
 *
 * - **`html: false`** escapes a tag instead of passing it through. A statement is
 *   written by a manager and rendered in every participant's browser; raw HTML
 *   would make it an injection surface. This is the setting that answers the
 *   objection which originally made the format JSON.
 * - **`linkify: false`** — automatic linking would turn any pasted address into a
 *   live external link the author never asked for, which is exactly the
 *   reference-outside-the-document that the format refuses.
 */
export const createMarkdown = (): Markdown => {
    const md = new MarkdownIt({
        html: false,
        linkify: false,
        typographer: false,
        breaks: false,
    });

    md.use(plugin(footnote));
    // Headings get an `id` so a table of contents can point at them; no
    // permalink anchor, which is this plugin's default.
    md.use(plugin(anchor));
    md.use(plugin(katex), { enableFencedBlocks: false });

    return md;
};

export interface SampleSegment {
    kind: "sample";
    input: string;
    output: string;
    /** The paragraph directly after the pair, when there is one. */
    explanation?: string;
}

export interface HtmlSegment {
    kind: "html";
    html: string;
}

export type ContentSegment = HtmlSegment | SampleSegment;

const fenceLanguage = (token: Token): string => (token.info ?? "").trim().toLowerCase();

/**
 * Splits a document into runs of ordinary Markdown and the sample pairs.
 *
 * Ordinary runs become one HTML string each, which is the cheap path. A sample is
 * lifted out instead, because it is drawn as a unit — two panes with a copy
 * button each — and a copy button is a component rather than markup.
 */
export const toSegments = (md: Markdown, body: string, attachments: Attachment[]): ContentSegment[] => {
    const env = { attachments };
    const tokens = md.parse(body, env);
    const segments: ContentSegment[] = [];
    let run: Token[] = [];

    const flush = () => {
        if (run.length === 0) return;
        segments.push({ kind: "html", html: md.renderer.render(run, md.options, env) });
        run = [];
    };

    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        if (token.type !== "fence" || fenceLanguage(token) !== "in") {
            run.push(token);
            continue;
        }

        // The output fence must follow immediately. Two independent fences would
        // leave this guessing which output belongs to which input.
        const next = tokens[i + 1];
        if (!next || next.type !== "fence" || fenceLanguage(next) !== "out") {
            run.push(token);
            continue;
        }

        flush();
        const sample: SampleSegment = { kind: "sample", input: token.content, output: next.content };
        i += 1;

        // A paragraph directly after the pair explains it.
        const open = tokens[i + 1];
        const inline = tokens[i + 2];
        const close = tokens[i + 3];
        if (open?.type === "paragraph_open" && inline?.type === "inline" && close?.type === "paragraph_close") {
            sample.explanation = md.renderer.render([open, inline, close], md.options, env);
            i += 3;
        }

        segments.push(sample);
    }

    flush();
    return segments;
};
