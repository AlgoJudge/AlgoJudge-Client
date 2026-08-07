import { ActivityDocumentKind, ActivityDocumentRef } from "./ParticipantApi";
import { pickDocumentRef as pick } from "./documentRefs";

/**
 * The documents an activity owns, and the two questions its screens ask about
 * them.
 *
 * The instance's equivalent is `instanceDocuments.ts`; the picking rule they
 * share lives in `documentRefs.ts`.
 */

/**
 * Every kind, in the order the manager screen lists them: the page somebody
 * outside sees first, then the one they see once they are in, then the rules.
 */
export const ACTIVITY_DOCUMENT_KINDS: ActivityDocumentKind[] = ["welcome", "home", "rules"];

/** Whether the activity publishes this kind at all, in any language. */
export const hasDocument = (
    refs: ActivityDocumentRef[],
    kind: ActivityDocumentKind,
): boolean => refs.some(ref => ref.kind === kind);

/**
 * The activity document to show, for one kind and one interface language.
 *
 * A thin naming of the shared rule, which the instance's documents use as well.
 */
export const pickDocumentRef = (
    refs: ActivityDocumentRef[],
    kind: ActivityDocumentKind,
    language: string,
): ActivityDocumentRef | undefined => pick(refs, kind, language);

/**
 * Where clicking an activity goes.
 *
 * Its own page when whoever runs it wrote one, the problems otherwise — there is
 * no point stopping at a page with nothing on it. Lives here rather than in the
 * two screens that navigate, so the rule cannot come to differ between the list
 * and the front page.
 */
export const activityEntryPath = (
    activity: { slug: string, documents: ActivityDocumentRef[] },
): string => hasDocument(activity.documents, "home")
    ? `/activities/${activity.slug}`
    : `/activities/${activity.slug}/problems`;
