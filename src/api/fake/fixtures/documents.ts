import { InstanceDocumentKind, InstanceDocumentRef } from "../../CoreApi";
// Type-only, so this module carries no runtime dependency on the file store —
// `check:content` compiles the fixtures on their own and must not have to drag
// the whole fake along to read a document.
import type { FakeFiles } from "../FileApiFake";
import { legalDocuments } from "./legal";
import { instancePage } from "./instancePages";

/**
 * What an operator writes, as the fixtures hold it.
 *
 * Not an API type any more: the API carries **references**, and the text lives
 * in a file like every other stored byte. This is the shape the fixtures are
 * written in and the shape `check:content` validates, which is why it is one
 * declaration rather than one per fixture file.
 */
export interface FixtureDocument {
    kind: InstanceDocumentKind;
    /** Absent on the front pages: their heading is inside the document. */
    title?: string;
    content: string;
    translations?: { language: string; title?: string; content: string }[];
    isTemplate: boolean;
}

/**
 * Puts every shipped document into the file store and answers with its
 * references — which is what an operator's first publish does on the Server.
 *
 * One file per kind per language, named as a statement's are: `privacy.md`,
 * `privacy-en.md`. Nothing carries a `validFrom`, because a template is in
 * force over nothing.
 */
export const seedInstanceDocuments = (files: FakeFiles): InstanceDocumentRef[] => {
    const refs: InstanceDocumentRef[] = [];

    const add = (document: FixtureDocument, language: string | undefined, title: string | undefined, content: string) => {
        const name = language ? `${document.kind}-${language}.md` : `${document.kind}.md`;
        const stored = files.seedText(name, "text/markdown", content);
        refs.push({
            kind: document.kind,
            language,
            title,
            isTemplate: document.isTemplate,
            fileId: stored.id,
            sha256: stored.sha256,
            sizeBytes: stored.sizeBytes,
        });
    };

    for (const document of [...legalDocuments(), instancePage("welcome"), instancePage("home")]) {
        add(document, undefined, document.title, document.content);
        for (const translation of document.translations ?? []) {
            add(document, translation.language, translation.title ?? document.title, translation.content);
        }
    }

    return refs;
};
