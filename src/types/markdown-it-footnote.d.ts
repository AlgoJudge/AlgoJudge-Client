declare module "markdown-it-footnote" {
    import type MarkdownIt from "markdown-it";

    /** The package ships no types; it is a plain plugin with no options. */
    const footnote: MarkdownIt.PluginSimple;
    export default footnote;
}
