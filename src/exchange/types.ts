import {
    AddressRule, AttachmentRule, FileScope, JoinPolicy, ManagedActivity, ManagedProblem,
    ManagedSeries, ManagedSeriesProblem, ScoreVisibility,
} from "../api/ManagerApi";
import { ActivityDocumentKind } from "../api/ParticipantApi";
import { SeriesImportanceScope } from "../api/seriesImportance";

/**
 * The exchange bundle: a problem, a round or a whole activity, leaving one
 * installation and arriving in another.
 *
 * Specified in `docs/specs/EXCHANGE_FORMAT.md` in the workspace.
 *
 * ## Why it is assembled here and not on the Server
 *
 * **Because the importer is the ordinary manager API.** Every write an import
 * makes — creating a problem, publishing a version, attaching an assignment —
 * goes through an endpoint that already exists and already authorises. A Server
 * that took a bundle would have to re-derive every one of those checks in a
 * second place, which is a second authorisation surface for one feature.
 *
 * It also keeps the Server clear of a problem type's dialect: a package's
 * layout is a property of its type, and the Server is not allowed to know one
 * type from another.
 *
 * ## What a bundle carries
 *
 * **Exactly what a copy carries, minus what belongs to an installation.** The
 * Server states that partition in `CopiedFields`; this file states it again for
 * the wire, and **nothing compares the two**. Two local guards that each fail
 * loudly beats one claim that something is checked — see
 * `scripts/check-exchange.mjs` here and `CopiedFieldsTests` there.
 *
 * Not carried, ever: submissions, results, questions, grants, enrolments,
 * groups, the join password, whether it was published or archived, a round's
 * state, and a problem's owner or share list. None of those is a shape; all of
 * them are this installation's.
 */

export const BUNDLE_TYPE = "algojudge-bundle@1";

/** The manifest's name inside the archive. */
export const MANIFEST_NAME = "bundle.json";

/**
 * Where the bytes live, each named by its own SHA-256.
 *
 * **Content-addressed on purpose.** A figure two problems share is stored once,
 * and the importer's "is this already here" test is a string comparison it
 * already has — the Server exposes the same digest on every stored file.
 */
export const FILES_PREFIX = "files/";

export interface Bundle {
    type: typeof BUNDLE_TYPE;
    exportedAt: string;
    /**
     * Where it came from, for a person reading the manifest.
     *
     * **Never read to decide anything.** An importer that trusted this would be
     * trusting a field the exporting installation wrote about itself.
     */
    source?: { instance?: string; activity?: string };
    kind: BundleKind;
    /**
     * Every problem the bundle needs, whatever its kind — an activity bundle
     * carries the problems its assignments name, flattened and stated once even
     * where two rounds set the same one.
     */
    problems: BundledProblem[];
    /** Present for `activity`; for `series` it carries the one round. */
    activity?: BundledActivity;
}

export type BundleKind = "activity" | "series" | "problem";

export interface BundledFile {
    /** As the version stores it: `content.md`, `package.zip`, `figure.png`. */
    name: string;
    scope: FileScope;
    sha256: string;
}

/**
 * One problem, at its newest version only.
 *
 * **The history does not travel**, for the reason duplication gives: notes
 * about changes that never happened to this copy would be somebody else's past.
 * The importer publishes what arrives as version 1.
 */
export interface BundledProblem {
    slug: string;
    name: string;
    type: string;
    external: boolean;
    note?: string;
    props?: unknown;
    files: BundledFile[];
}

export interface BundledActivity {
    slug: string;
    name: string;
    type: string;
    rankingType: string;
    timeZone: string;
    startDate?: string;
    endDate?: string;
    modules: { questions: boolean };
    scoreVisibility: ScoreVisibility;
    attachmentVisibility: AttachmentRule[];
    props?: unknown;
    joinPolicy: JoinPolicy;
    unlisted: boolean;
    hideEndedSeriesProblems: boolean;
    maxUploadBytes: number;
    maxAttachments: number;
    maxSubmissionsPerProblem?: number;
    runnerTags: string[];
    documents: BundledDocument[];
    series: BundledSeries[];
}

/**
 * One revision of one activity document, in one language.
 *
 * Carried because a course's rules page is part of its shape, and because §7
 * left one lesson above the others: what a copy drops silently is what nobody
 * finds out about until it matters.
 */
export interface BundledDocument {
    kind: ActivityDocumentKind;
    language?: string;
    title?: string;
    sha256: string;
}

export interface BundledSeries {
    slug: string;
    name: string;
    order: number;
    startDate?: string;
    endDate?: string;
    revealProblemCount: boolean;
    rankingFreezeAt?: string;
    rankingRevealAt?: string;
    rankingVisibleFrom?: string;
    rankingVisibleTo?: string;
    importance: number;
    importanceScope: SeriesImportanceScope;
    addressRules: AddressRule[];
    restrictionsEnabled: boolean;
    runnerTags?: string[];
    assignments: BundledAssignment[];
}

/**
 * One problem's place in one round.
 *
 * **`problemSlug` names a problem in this bundle**, never an id: an id means
 * nothing in another installation, which is the whole reason nothing here is
 * referenced by one.
 *
 * **The pin cannot travel and is not pretended to.** A pinned version id is
 * this installation's, and the bundle carries one version anyway, so the
 * importer pins to the version it publishes. Stated here because a field that
 * silently means something else on the other side is worse than an absent one.
 */
export interface BundledAssignment {
    problemSlug: string;
    slug: string;
    name?: string;
    order: number;
    config?: unknown;
    spec?: unknown;
    props?: unknown;
    maxPoints?: number;
    maxUploadBytes?: number;
    maxAttachments?: number;
    maxSubmissions?: number;
}

/**
 * What each shape carries, named rather than inferred.
 *
 * **This is the Client's half of the partition `CopiedFields` states on the
 * Server**, and `check:exchange` asserts a round trip against it field for
 * field. A field added to `ManagedSeries` and not to the list here rides out of
 * one installation and silently does not arrive in the next — which is the
 * defect §7 found on the Server, one repository over.
 */
export const CARRIED = {
    activity: [
        "slug", "name", "type", "rankingType", "timeZone", "startDate", "endDate",
        "modules", "scoreVisibility", "attachmentVisibility", "props", "joinPolicy",
        "unlisted", "hideEndedSeriesProblems", "maxUploadBytes", "maxAttachments",
        "maxSubmissionsPerProblem", "runnerTags",
    ],
    series: [
        "slug", "name", "order", "startDate", "endDate", "revealProblemCount",
        "rankingFreezeAt", "rankingRevealAt", "rankingVisibleFrom", "rankingVisibleTo",
        "importance", "importanceScope", "addressRules", "restrictionsEnabled", "runnerTags",
    ],
    assignment: [
        // `problemSlug` **is** carried, and means something slightly different
        // on the other side: here it is the library problem's slug, in the
        // bundle it names a problem the bundle itself carries. The two agree by
        // construction, which is why one name serves.
        "problemSlug",
        "slug", "name", "order", "config", "spec", "props",
        "maxPoints", "maxUploadBytes", "maxAttachments", "maxSubmissions",
    ],
    // `note` and `props` ride too and are **not** here: they belong to the
    // version, not to the problem, and this list is partitioned against
    // `ManagedProblem` alone.
    problem: ["slug", "name", "type", "external"],
} as const;

/**
 * What an activity holds that a bundle deliberately leaves behind.
 *
 * Listed so a reader can tell an omission from a decision, and so the check can
 * assert that every field of `ManagedActivity` is in one list or the other.
 */
export const NOT_CARRIED = {
    activity: [
        // This installation's identifiers and its record of what happened.
        "id", "documents", "archivedAt", "publishedAt",
        "seriesCount", "problemCount", "participantCount", "matchingRunners",
        // Known by everybody who took the original. A new cohort joinable by the
        // previous one is a leak, not a setting.
        "joinPassword",
    ],
    series: [
        "id", "activityId", "problems", "matchingRunners",
        // A bundle has never opened, never paused and never announced anything.
        "isOpen", "pausedAt", "hideProblemsWhilePaused",
    ],
    assignment: [
        "id", "seriesId", "problemId", "problemName",
        "currentVersion", "hasPackage", "submissionCount",
        // The pin is this installation's; the importer sets its own.
        "pinnedProblemVersionId", "pinnedVersion",
    ],
    problem: [
        "id", "currentVersion", "versionCount", "createdAt", "attachedCount",
        "archivedAt", "publishedAt",
        // Ownership and sharing are per installation: an account here is not an
        // account there, and a share list would name people who do not exist.
        "ownerUserId", "ownerName", "visibility", "sharedWith",
    ],
} as const;

/**
 * Every key each shape has, and **the compiler will not let this be short**.
 *
 * `Record<keyof T, true>` admits no missing key and no invented one, so a field
 * added to `ManagedSeries` reddens `npm run typecheck` — which is a gate — until
 * somebody puts it in `CARRIED` or `NOT_CARRIED` below.
 *
 * This is the Client's answer to the reflection `CopiedFieldsTests` uses on the
 * Server. Neither can see the other; each fails loudly where it stands.
 */
const keysOf = <T,>(keys: Record<keyof T, true>): string[] => Object.keys(keys);

export const FIELDS = {
    activity: keysOf<ManagedActivity>({
        id: true, slug: true, name: true, type: true, rankingType: true, timeZone: true,
        startDate: true, endDate: true, modules: true, documents: true, scoreVisibility: true,
        attachmentVisibility: true, props: true, joinPolicy: true, unlisted: true,
        joinPassword: true, hideEndedSeriesProblems: true, maxUploadBytes: true,
        maxAttachments: true, maxSubmissionsPerProblem: true, archivedAt: true,
        publishedAt: true, seriesCount: true, problemCount: true, participantCount: true,
        runnerTags: true, matchingRunners: true,
    }),
    series: keysOf<ManagedSeries>({
        id: true, activityId: true, slug: true, name: true, order: true, startDate: true,
        endDate: true, isOpen: true, pausedAt: true, hideProblemsWhilePaused: true,
        revealProblemCount: true, rankingFreezeAt: true, rankingRevealAt: true,
        rankingVisibleFrom: true, rankingVisibleTo: true, importance: true,
        importanceScope: true, addressRules: true, restrictionsEnabled: true,
        runnerTags: true, matchingRunners: true, problems: true,
    }),
    assignment: keysOf<ManagedSeriesProblem>({
        id: true, seriesId: true, problemId: true, problemSlug: true, problemName: true,
        slug: true, name: true, order: true, pinnedProblemVersionId: true, pinnedVersion: true,
        currentVersion: true, hasPackage: true, submissionCount: true, config: true,
        spec: true, props: true, maxPoints: true, maxUploadBytes: true, maxAttachments: true,
        maxSubmissions: true,
    }),
    problem: keysOf<ManagedProblem>({
        id: true, slug: true, name: true, type: true, ownerUserId: true, ownerName: true,
        visibility: true, sharedWith: true, archivedAt: true, publishedAt: true,
        currentVersion: true, versionCount: true, createdAt: true, attachedCount: true,
        external: true,
    }),
} as const;

/** `content.md`, or `content-<language>.md` for a translation. */
export const statementLanguage = (name: string): string | undefined | false => {
    if (name === "content.md") return undefined;
    const match = /^content-([A-Za-z0-9-]+)\.md$/.exec(name);
    return match ? match[1] : false;
};

/** Whether a stored file is a statement rather than material beside one. */
export const isStatement = (name: string): boolean => statementLanguage(name) !== false;
