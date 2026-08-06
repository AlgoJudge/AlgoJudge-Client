import { ManagedActivity, ManagedSeries, ManagedSeriesProblem } from "../../ManagerApi";

/**
 * The course's join password.
 *
 * Here rather than in the participant fixtures because this is where the
 * setting is authored: a manager types it, and the participant side only ever
 * checks what somebody typed against it. Shared so the two halves of the fake
 * cannot drift into disagreeing about what the link in the email says.
 */
export const COURSE_JOIN_PASSWORD = "PROG1-LA";

/**
 * Activities as a manager sees them.
 *
 * The same four the grant editor scopes to, so the two screens agree on what
 * exists. Deliberately mixed: a finished contest, a running course, an open
 * practice activity with a single series, and one archived — the states an
 * activity screen has to render before it renders the happy one.
 */

const days = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString();
const hours = (offset: number) => new Date(Date.now() + offset * 3600000).toISOString();

export const CONTEST_ID = "018f2c00-0000-7000-8000-000000000001";
export const COURSE_ID = "018f2c00-0000-7000-8000-000000000002";
export const PRACTICE_ID = "018f2c00-0000-7000-8000-000000000004";
export const WORKSHOP_ID = "018f2c00-0000-7000-8000-000000000005";

/**
 * `participantCount` is a placeholder here: the fake fills it in from the grants,
 * because a grant in an activity **is** the membership and a second number that
 * could disagree with it would be a lie the screens then render.
 */
export interface ActivityRecord {
    activity: ManagedActivity;
    series: ManagedSeries[];
}

const assignment = (
    seriesId: string,
    order: number,
    problem: { id: string; slug: string; name: string; currentVersion: number; hasPackage?: boolean },
    extras: Partial<ManagedSeriesProblem> = {},
): ManagedSeriesProblem => ({
    id: `sp-${seriesId}-${problem.slug}`,
    seriesId,
    problemId: problem.id,
    problemSlug: problem.slug,
    problemName: problem.name,
    slug: problem.slug,
    order,
    currentVersion: problem.currentVersion,
    hasPackage: problem.hasPackage ?? true,
    submissionCount: 0,
    config: {},
    ...extras,
});

const GRAPH = { id: "prob-graf", slug: "spojnosc-grafu", name: "Spójność grafu", currentVersion: 3 };
const DIJKSTRA = { id: "prob-dijkstra", slug: "najkrotsza-sciezka", name: "Najkrótsza ścieżka", currentVersion: 2 };
const TOPO = { id: "prob-topo", slug: "sortowanie-topologiczne", name: "Sortowanie topologiczne", currentVersion: 1, hasPackage: false };
const LOOPS = { id: "prob-petle", slug: "petle-i-sumy", name: "Pętle i sumy", currentVersion: 1 };
const ARRAYS = { id: "prob-tablice", slug: "tablice", name: "Tablice", currentVersion: 2 };

export const createActivityLibrary = (): ActivityRecord[] => [
    {
        activity: {
            id: CONTEST_ID,
            slug: "AMMPZ-2019",
            name: "Akademickie Mistrzostwa Polski 2019",
            type: "contest@1",
            rankingType: "icpc",
            timeZone: "Europe/Warsaw",
            startDate: hours(-1),
            endDate: hours(4),
            modules: { questions: true },
            documents: [],
            scoreVisibility: "everyone",
            logVisibility: "managersOnly",
            joinPolicy: "closed",
            unlisted: true,
            maxUploadBytes: 8 * 1024 * 1024,
            maxAttachments: 1,
            maxSubmissionsPerProblem: 20,
            seriesCount: 2,
            problemCount: 3,
            participantCount: 0,
        },
        series: [
            {
                id: "series-r1",
                activityId: CONTEST_ID,
                slug: "runda-1",
                name: "Runda 1",
                order: 1,
                startDate: hours(-1),
                endDate: hours(4),
                revealProblemCount: true,
                // Frozen for the final hour and revealed when the round ends —
                // the ICPC convention, and the case the screen must show.
                rankingFreezeAt: hours(3),
                rankingRevealAt: hours(4),
                problems: [
                    // Pinned: a contest must not have its statement change
                    // underneath it, even though the library moved to v3.
                    assignment("series-r1", 1, GRAPH, { slug: "A", name: "Zadanie A — spójność", pinnedProblemVersionId: "v-graf-2", pinnedVersion: 2, submissionCount: 118 }),
                    assignment("series-r1", 2, DIJKSTRA, { slug: "B", maxSubmissions: 10, submissionCount: 64 }),
                ],
            },
            {
                id: "series-r2",
                activityId: CONTEST_ID,
                slug: "runda-2",
                name: "Runda 2",
                order: 2,
                startDate: days(7),
                endDate: days(7),
                // Closed and not admitting its size: a competitor learns nothing
                // about the round before it opens.
                revealProblemCount: false,
                problems: [
                    // No package: nothing can be judged, and the screen has to
                    // say so before the round opens rather than after.
                    assignment("series-r2", 1, TOPO, { slug: "C" }),
                ],
            },
        ],
    },
    {
        activity: {
            id: COURSE_ID,
            slug: "PROG-1-LA",
            name: "Programowanie 1 — grupa LA",
            type: "course@1",
            rankingType: "points",
            timeZone: "Europe/Warsaw",
            modules: { questions: true },
            documents: [],
            scoreVisibility: "participantOnly",
            logVisibility: "participant",
            joinPolicy: "password",
            unlisted: true,
            joinPassword: COURSE_JOIN_PASSWORD,
            maxUploadBytes: 4 * 1024 * 1024,
            maxAttachments: 3,
            seriesCount: 2,
            problemCount: 3,
            participantCount: 0,
        },
        series: [
            {
                id: "series-w1",
                activityId: COURSE_ID,
                slug: "zajecia-1",
                name: "Zajęcia 1 — podstawy",
                order: 1,
                startDate: days(-21),
                endDate: days(-14),
                revealProblemCount: true,
                problems: [
                    assignment("series-w1", 1, LOOPS, { slug: "petle", submissionCount: 51 }),
                    // Attached from an archived library entry: it keeps working
                    // where it was already used, which is the point of archiving.
                    assignment("series-w1", 2, ARRAYS, { slug: "tablice", maxUploadBytes: 1024 * 1024, submissionCount: 47 }),
                ],
            },
            {
                id: "series-w2",
                activityId: COURSE_ID,
                slug: "zajecia-2",
                name: "Zajęcia 2 — rekurencja",
                order: 2,
                startDate: days(-7),
                endDate: days(3),
                revealProblemCount: true,
                problems: [
                    assignment("series-w2", 1, LOOPS, { slug: "rekurencja", name: "Rekurencja — rozgrzewka", submissionCount: 12 }),
                ],
            },
        ],
    },
    {
        activity: {
            id: PRACTICE_ID,
            slug: "TRENING-OTWARTY",
            name: "Trening otwarty",
            type: "practice@1",
            rankingType: "points",
            timeZone: "Europe/Warsaw",
            modules: { questions: false },
            documents: [],
            scoreVisibility: "everyone",
            logVisibility: "participant",
            joinPolicy: "open",
            unlisted: false,
            maxUploadBytes: 8 * 1024 * 1024,
            maxAttachments: 1,
            seriesCount: 1,
            problemCount: 1,
            participantCount: 0,
        },
        series: [
            {
                id: "series-t1",
                activityId: PRACTICE_ID,
                slug: "zbior",
                name: "Zbiór zadań",
                order: 1,
                // No dates at all: an untimed activity, which the forms must
                // accept rather than demand a start for.
                revealProblemCount: true,
                problems: [assignment("series-t1", 1, GRAPH, { slug: "spojnosc" })],
            },
        ],
    },
    {
        activity: {
            id: WORKSHOP_ID,
            slug: "WARSZTAT-9",
            name: "Warsztat interaktywny",
            type: "contest@1",
            rankingType: "points",
            timeZone: "Europe/Warsaw",
            startDate: days(-120),
            endDate: days(-119),
            modules: { questions: false },
            documents: [],
            scoreVisibility: "managersOnly",
            logVisibility: "managersOnly",
            joinPolicy: "closed",
            unlisted: true,
            maxUploadBytes: 8 * 1024 * 1024,
            maxAttachments: 1,
            archivedAt: days(-100),
            seriesCount: 0,
            problemCount: 0,
            participantCount: 0,
        },
        series: [],
    },
];
