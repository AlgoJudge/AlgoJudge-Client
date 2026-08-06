import { ForbiddenError } from "../ApiError";
import { ActivityDocumentKind, ActivityDocumentRef, JoinPolicy, SeriesChange } from "../ParticipantApi";
import { COURSE_JOIN_PASSWORD } from "./fixtures/activities";
import { seedActivityDocuments, COURSE_ID, INVITED_COURSE_ID, OPEN_ID } from "./fixtures/activityDocuments";
import { FakeFiles } from "./FileApiFake";
import { Utils } from "./Utils";

interface Enrolment {
    policy: JoinPolicy;
    password?: string;
    unlisted: boolean;
}

/**
 * What a manager did to a series, on its way to the participant side.
 *
 * The two halves of the fake keep their own series — a `ManagedSeries` with its
 * assignments, a `Series` with what a competitor may see — and merging those two
 * fixture sets would be a larger change than this is worth. What has to cross is
 * small and named: which series, what happened, and the fields that moved.
 */
export interface SeriesRelay {
    activityId: string;
    seriesId: string;
    change: SeriesChange;
    startDate?: string;
    endDate?: string;
    isOpen?: boolean;
    /** Null clears it, as JSON has no way to say "remove this field". */
    pausedAt?: string | null;
}

/**
 * What an activity publishes, and how somebody gets into it.
 *
 * Held apart from either API because both need it, exactly as `FakeInstance` is:
 * `ManagerApiFake` publishes a document and `ParticipantApiFake` serves it, and
 * a fake keeping two copies would let the manager screen and the activity page
 * disagree about what exists — which is the one thing this feature is about.
 *
 * Nothing is persisted. These are file references, and the store is rebuilt on
 * every load: a stored id would name bytes this tab has never seen.
 */
export class FakeActivities {
    /** In force now, per activity. */
    private readonly documents: Map<string, ActivityDocumentRef[]>;
    /** Every revision ever published, newest first, keyed `${activityId}/${kind}`. */
    private readonly history = new Map<string, ActivityDocumentRef[]>();
    private readonly enrolment = new Map<string, Enrolment>();
    /** What the reader has joined during this visit, on top of the fixtures. */
    private readonly joined = new Set<string>();
    private readonly seriesListeners: ((relay: SeriesRelay) => void)[] = [];

    constructor(private readonly files: FakeFiles) {
        this.documents = seedActivityDocuments(files);
        for (const [activityId, refs] of this.documents) {
            for (const ref of refs) this.remember(activityId, ref);
        }
        // The two that are joinable at all. Everything else is closed, which is
        // also the default for an activity nobody configured.
        this.enrolment.set(COURSE_ID, { policy: "password", password: COURSE_JOIN_PASSWORD, unlisted: true });
        this.enrolment.set(OPEN_ID, { policy: "open", unlisted: false });
        // Unlisted **and** password-protected: reachable only by the link, which
        // is the state the share link exists for.
        this.enrolment.set(INVITED_COURSE_ID, {
            policy: "password", password: COURSE_JOIN_PASSWORD, unlisted: true,
        });
    }

    documentsOf(activityId: string): ActivityDocumentRef[] {
        return [...(this.documents.get(activityId) ?? [])];
    }

    historyOf(activityId: string, kind: ActivityDocumentKind): ActivityDocumentRef[] {
        return [...(this.history.get(`${activityId}/${kind}`) ?? [])];
    }

    /**
     * Publishes a revision: added, never replacing. The one in force is the
     * newest, because the screen only ever publishes as of now.
     */
    publish(
        activityId: string,
        kind: ActivityDocumentKind,
        statements: { language?: string, fileId: string }[],
    ): ActivityDocumentRef[] {
        if (statements.length === 0) {
            Utils.throwError("A document with no text is a document nobody can read");
        }
        const validFrom = new Date().toISOString();
        const published: ActivityDocumentRef[] = statements.map(statement => {
            const stored = this.files.meta(statement.fileId);
            return {
                kind,
                language: statement.language,
                // Kept from whatever was published before, so republishing does
                // not silently rename a document. The two front pages carry
                // their heading inside the text and have no title of their own.
                title: kind === "rules"
                    ? this.historyOf(activityId, kind).find(ref => ref.language === statement.language)?.title
                    : undefined,
                validFrom,
                fileId: statement.fileId,
                sha256: stored.sha256,
                sizeBytes: stored.sizeBytes,
            };
        });
        for (const ref of published) this.remember(activityId, ref);
        this.documents.set(activityId, [
            ...this.documentsOf(activityId).filter(ref => ref.kind !== kind),
            ...published,
        ]);
        return this.documentsOf(activityId);
    }

    /** Stops publishing one. The revisions stay in the history at their dates. */
    unpublish(activityId: string, kind: ActivityDocumentKind): ActivityDocumentRef[] {
        this.documents.set(activityId, this.documentsOf(activityId).filter(ref => ref.kind !== kind));
        return this.documentsOf(activityId);
    }

    /** The file name a language's text is stored under, for the uploader. */
    static fileName(activityId: string, kind: ActivityDocumentKind, language: string | undefined): string {
        return `${activityId}/${language ? `${kind}-${language}` : kind}.md`;
    }

    enrolmentOf(activityId: string): Enrolment {
        return this.enrolment.get(activityId) ?? { policy: "closed", unlisted: true };
    }

    setEnrolment(activityId: string, policy: JoinPolicy, password: string | undefined, unlisted: boolean): void {
        this.enrolment.set(activityId, {
            policy,
            // Kept only where it means anything, so switching to open and back
            // does not quietly restore a password nobody meant to reinstate.
            password: policy === "password" ? password?.trim() || undefined : undefined,
            // Under `closed` there is no self-enrolment at all, so it is hidden
            // whatever the switch says: the policy already means it.
            unlisted: policy === "closed" ? true : unlisted,
        });
    }

    /**
     * Whether the activity is listed to somebody who is not in it.
     *
     * The Client never asks this — it is what the Server leaves out of the list
     * — but the fake has to leave it out too, or the screens are exercised
     * against a rule nothing enforces.
     */
    isListed(activityId: string, isMember: boolean): boolean {
        if (isMember) return true;
        const { policy, unlisted } = this.enrolmentOf(activityId);
        return policy !== "closed" && !unlisted;
    }

    /** Refuses exactly as the Server will: a wrong password is not an enrolment. */
    join(activityId: string, password: string | undefined): void {
        const settings = this.enrolmentOf(activityId);
        if (settings.policy === "closed") {
            throw new ForbiddenError("Do tej aktywności zapisuje organizator", "enrolment.closed");
        }
        if (settings.policy === "password" && (password ?? "").trim() !== (settings.password ?? "")) {
            throw new ForbiddenError("Hasło zapisu jest nieprawidłowe", "enrolment.password");
        }
        this.joined.add(activityId);
    }

    hasJoined(activityId: string): boolean {
        return this.joined.has(activityId);
    }

    /**
     * The participant side listens; the manager side tells it. The Server needs
     * no such thing — it has one series and one socket — so this exists only so
     * the screens can be watched doing what the Server will make them do.
     */
    onSeriesChanged(listener: (relay: SeriesRelay) => void): void {
        this.seriesListeners.push(listener);
    }

    announceSeries(relay: SeriesRelay): void {
        for (const listener of this.seriesListeners) listener(relay);
    }

    private remember(activityId: string, ref: ActivityDocumentRef): void {
        const key = `${activityId}/${ref.kind}`;
        this.history.set(key, [ref, ...(this.history.get(key) ?? [])]);
    }
}
