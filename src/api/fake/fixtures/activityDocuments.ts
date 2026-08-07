import { ActivityDocumentKind, ActivityDocumentRef } from "../../ParticipantApi";
// Type-only, as `documents.ts` does it: the fixtures say what is stored and are
// handed the store rather than reaching for one of their own.
import type { FakeFiles } from "../FileApiFake";
import {
    contestRules, courseHome, courseHomeEn, courseRules, courseRulesEn,
    courseWelcome, courseWelcomeEn, practiceWelcome,
} from "./content";

/**
 * What the activities in the fake publish before anybody edits them.
 *
 * Deliberately uneven, because the screens have to render every one of these:
 * a contest with rules and no page of its own, a course with all three in two
 * languages, an open activity with a page for outsiders and none for
 * participants, and activities publishing nothing at all.
 */

// Re-exported from the seed rather than repeated: which activities exist is
// stated once, in `world.ts`, and an id written out again here is an id that can
// come to name something else.
export { CONTEST_ID, COURSE_ID, FINISHED_ID, INVITED_COURSE_ID } from "./world";
import { CONTEST_ID, COURSE_ID, FINISHED_ID, INVITED_COURSE_ID, PRACTICE_ID } from "./world";

/** The one anybody may join, which publishes a page for outsiders. */
export const OPEN_ID = PRACTICE_ID;

interface Written {
    kind: ActivityDocumentKind;
    language?: string;
    title?: string;
    content: string;
}

const LIBRARY: Record<string, Written[]> = {
    // Rules and nothing else: the sidebar entry comes from a reference while the
    // activity has no page of its own, which is the case where clicking the
    // activity has to go straight to its problems.
    [CONTEST_ID]: [
        { kind: "rules", title: "Regulamin zawodów", content: contestRules },
    ],
    // All three, in two languages — the activity that exercises everything.
    [COURSE_ID]: [
        { kind: "welcome", content: courseWelcome },
        { kind: "welcome", language: "en", content: courseWelcomeEn },
        { kind: "home", content: courseHome },
        { kind: "home", language: "en", content: courseHomeEn },
        { kind: "rules", title: "Zasady zaliczenia", content: courseRules },
        { kind: "rules", language: "en", title: "Terms of assessment", content: courseRulesEn },
    ],
    [FINISHED_ID]: [
        { kind: "rules", title: "Regulamin zawodów", content: contestRules },
    ],
    // A page for outsiders and none for participants: enrolling here lands on
    // the problems, because there is nowhere else to land.
    [OPEN_ID]: [
        { kind: "welcome", content: practiceWelcome },
    ],
    // All three again, on the activity somebody is **not** in: the page an
    // outsider reads, the rules they have to accept, and the page that replaces
    // both the moment they are in.
    [INVITED_COURSE_ID]: [
        { kind: "welcome", content: courseWelcome },
        { kind: "welcome", language: "en", content: courseWelcomeEn },
        { kind: "home", content: courseHome },
        { kind: "rules", title: "Zasady zaliczenia", content: courseRules },
    ],
};

/**
 * Puts every shipped activity document into the file store and answers with the
 * references, keyed by activity — which is what publishing does on the Server.
 *
 * `validFrom` is set on all of them, unlike the instance's templates: what an
 * activity publishes, somebody published. Nothing here came with the software.
 */
export const seedActivityDocuments = (files: FakeFiles): Map<string, ActivityDocumentRef[]> => {
    const seeded = new Map<string, ActivityDocumentRef[]>();
    const validFrom = new Date(Date.now() - 30 * 86400000).toISOString();

    for (const [activityId, written] of Object.entries(LIBRARY)) {
        seeded.set(activityId, written.map(document => {
            const name = document.language
                ? `${document.kind}-${document.language}.md`
                : `${document.kind}.md`;
            const stored = files.seedText(`${activityId}/${name}`, "text/markdown", document.content);
            return {
                kind: document.kind,
                language: document.language,
                title: document.title,
                validFrom,
                fileId: stored.id,
                sha256: stored.sha256,
                sizeBytes: stored.sizeBytes,
            };
        }));
    }

    return seeded;
};
