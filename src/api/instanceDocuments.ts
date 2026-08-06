import { InstanceDocumentKind, InstanceDocumentRef } from "./CoreApi";

/**
 * The document to show, for one kind and one interface language.
 *
 * The reader's language where the operator wrote it, and what they wrote first
 * otherwise — a policy nobody translated is still the policy, and a missing
 * translation is a fallback rather than an error. `en-GB` resolves against `en`,
 * as it does for a problem statement.
 *
 * Lives beside the API rather than in a screen because three of them ask the
 * same question, and beside the API rather than in the fake because the answer
 * is the same whichever implementation supplied the references.
 */
export const pickDocumentRef = (
    refs: InstanceDocumentRef[],
    kind: InstanceDocumentKind,
    language: string,
): InstanceDocumentRef | undefined => {
    const forKind = refs.filter(ref => ref.kind === kind);
    const base = language.split("-")[0].toLowerCase();
    return forKind.find(ref => ref.language?.toLowerCase() === language.toLowerCase())
        ?? forKind.find(ref => ref.language?.split("-")[0].toLowerCase() === base)
        ?? forKind.find(ref => !ref.language);
};
