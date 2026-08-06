import { InstanceDocumentKind, InstanceDocumentRef, LegalDocumentKind } from "./CoreApi";
import { pickDocumentRef as pick, publishedKinds } from "./documentRefs";

/**
 * The order the legal documents are offered in, wherever they are listed.
 *
 * Fixed rather than taken from the answer: the footer must not reshuffle
 * because an operator republished one of them.
 */
const LEGAL_ORDER: LegalDocumentKind[] = ["terms", "privacy", "cookies", "accessibility"];

/**
 * Which legal documents this instance publishes — derived from the references
 * rather than announced separately.
 *
 * There used to be an `InstanceInfo.legalDocuments` beside these, which is two
 * answers to one question: withdrawing a document would remove its text and
 * leave the footer linking to it until somebody remembered the second field.
 * Whether a document exists is whether it has a reference.
 */
export const publishedLegalKinds = (refs: InstanceDocumentRef[]): LegalDocumentKind[] =>
    publishedKinds(refs, LEGAL_ORDER);

/**
 * Every kind an operator may publish, in the order the settings screen lists
 * them: the pages a visitor lands on first, then the documents.
 */
export const DOCUMENT_KINDS: InstanceDocumentKind[] = ["welcome", "home", ...LEGAL_ORDER];

/**
 * The one attachment an instance document may point at: the instance's own
 * mark.
 *
 * A document of the operator's has no attachments of its own — there is no
 * screen to upload one — but every one of them may want to show the mark, so it
 * is offered under a fixed name and resolved to whatever mark is configured.
 */
export const LOGO_ATTACHMENT = "logo.svg";

/**
 * The instance document to show, for one kind and one interface language.
 *
 * A thin naming of the shared rule in `documentRefs.ts`, which an activity's
 * documents use as well: the question is the same one and deserves one answer.
 */
export const pickDocumentRef = (
    refs: InstanceDocumentRef[],
    kind: InstanceDocumentKind,
    language: string,
): InstanceDocumentRef | undefined => pick(refs, kind, language);
