/**
 * Picking a document out of a list of references.
 *
 * An instance publishes documents and so does an activity. The references differ
 * in what they point at and in who may write them, but the question a screen
 * asks of them is the same one — *which of these do I draw for this reader* — and
 * it has the same answer. This is that answer, written once.
 *
 * Deliberately structural rather than tied to either reference type: everything
 * the rule needs is a kind and an optional language, so anything carrying those
 * two can be asked.
 */

export interface DocumentRef<K extends string> {
    kind: K;
    /** BCP-47 subtag. Absent on the one written first, which is the fallback. */
    language?: string;
}

/**
 * The document to show, for one kind and one interface language.
 *
 * The reader's language where the author wrote it, and what they wrote first
 * otherwise — a policy nobody translated is still the policy, and a missing
 * translation is a fallback rather than an error. `en-GB` resolves against `en`,
 * as it does for a problem statement.
 */
export const pickDocumentRef = <K extends string, R extends DocumentRef<K>>(
    refs: R[],
    kind: K,
    language: string,
): R | undefined => {
    const forKind = refs.filter(ref => ref.kind === kind);
    const base = language.split("-")[0].toLowerCase();
    return forKind.find(ref => ref.language?.toLowerCase() === language.toLowerCase())
        ?? forKind.find(ref => ref.language?.split("-")[0].toLowerCase() === base)
        ?? forKind.find(ref => !ref.language);
};

/**
 * Which kinds are published at all, in a fixed order.
 *
 * Fixed rather than taken from the answer: a menu must not reshuffle because
 * somebody republished one of its entries.
 */
export const publishedKinds = <K extends string>(refs: DocumentRef<string>[], order: readonly K[]): K[] =>
    order.filter(kind => refs.some(ref => ref.kind === kind));
