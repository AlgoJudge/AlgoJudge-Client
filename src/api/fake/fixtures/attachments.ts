import {
    SubmissionFile, SUBMISSION_DETAILS, SUBMISSION_LOG, SUBMISSION_SOURCE,
} from "../../ParticipantApi";
import { AttachmentRule, AttachmentVisibility } from "../../ManagerApi";
import type { FakeFiles } from "../FileApiFake";
import { SeedAttempt, SeedSeries, attemptId } from "./world";

/**
 * What a Runner attaches, stored as files.
 *
 * The per-test table, the log and the source used to be three differently shaped
 * things on three different fields — an opaque document, a string, and a list of
 * names with no bytes behind them. They are one shape now: a named file with a
 * checksum, fetched by id like every other stored document.
 *
 * Which of them a participant may read is the activity's answer, not this
 * module's — see `visibleTo`.
 */

const EXTENSION: Record<string, string> = { cpp: "cpp", python: "py", java: "java" };

const SOURCE: Record<string, string> = {
    cpp: "#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    int n, m;\n    cin >> n >> m;\n    // ...\n    return 0;\n}\n",
    python: "import sys\n\ndef main():\n    data = sys.stdin.read().split()\n    # ...\n\nmain()\n",
    java: "public class Main {\n    public static void main(String[] args) {\n        // ...\n    }\n}\n",
};

export const sourceText = (language: string | undefined): string => SOURCE[language ?? ""] ?? "";

export const sourceName = (language: string | undefined): string =>
    `solution.${EXTENSION[language ?? ""] ?? "txt"}`;

/**
 * The document the Runner attaches, in the shape `PACKAGE_FORMAT.md` states.
 *
 * One shape, where the fixtures used to carry two that disagreed: a four-test
 * table on the participant's side and a grouped one on the manager's, for the
 * same submission.
 */
const resultDocument = (score: number, verdict: string) => ({
    kind: "standard-io",
    version: 1,
    limits: { timeMs: 1000, memoryBytes: 256 * 1024 * 1024 },
    compilation: { status: verdict === "Compilation error" ? "ERROR" : "OK", log: "" },
    groups: [
        { group: 1, points: score >= 30 ? 30 : 0, maxPoints: 30, status: score >= 30 ? "OK" : "ERROR" },
        { group: 2, points: score >= 60 ? 30 : 0, maxPoints: 30, status: score >= 60 ? "OK" : "ERROR" },
        { group: 3, points: score >= 100 ? 40 : 0, maxPoints: 40, status: score >= 100 ? "OK" : "ERROR" },
    ],
    tests: [
        { no: "1a", group: 1, status: "OK", timeMs: 120, memoryBytes: 12 * 1024 * 1024, score: 30, maxScore: 30, note: "" },
        {
            no: "2a", group: 2,
            status: score >= 60 ? "OK" : "ERROR",
            timeMs: score >= 60 ? 340 : 1000, memoryBytes: 24 * 1024 * 1024,
            score: score >= 60 ? 30 : 0, maxScore: 30,
            // The Runner's own words travel verbatim; the reason is the value
            // beside them. Absent on a pass, as the format states.
            note: verdict === "Time limit exceeded" ? "Time limit exceeded" : "",
            reason: score >= 60 ? undefined : "timeLimit",
        },
        {
            no: "3a", group: 3,
            status: score >= 100 ? "OK" : "ERROR",
            timeMs: 620, memoryBytes: 48 * 1024 * 1024,
            score: score >= 100 ? 40 : 0, maxScore: 40,
            note: score >= 100 ? "" : "token 2 differs: expected 30, got 0",
            reason: score >= 100 ? undefined : "wrongAnswer",
        },
    ],
});

const store = (
    files: FakeFiles,
    key: string,
    name: string,
    fileName: string,
    mimeType: string,
    text: string,
    language?: string,
): SubmissionFile => {
    const stored = files.seedText(`${key}/${fileName}`, mimeType, text);
    return {
        name,
        fileName,
        language,
        fileId: stored.id,
        sha256: stored.sha256,
        sizeBytes: stored.sizeBytes,
    };
};

/** What was sent. One per submission, and every rejudge reads the same bytes. */
export const sourceFiles = (
    files: FakeFiles,
    series: SeedSeries,
    attempt: SeedAttempt,
): SubmissionFile[] => {
    const id = attemptId(series.id, attempt);
    const fileName = sourceName(attempt.language);
    return [store(files, id, SUBMISSION_SOURCE, fileName, "text/plain",
        sourceText(attempt.language), attempt.language)];
};

/**
 * What one evaluation produced.
 *
 * Nothing until it has been judged: a queued attempt has no log and no table,
 * and an empty document standing in for one says a result with nothing in it.
 */
export const attemptFiles = (
    files: FakeFiles,
    series: SeedSeries,
    attempt: SeedAttempt,
    job = 1,
): SubmissionFile[] => {
    const finished = attempt.state === "completed" || attempt.state === "failed";
    if (!finished) return [];

    const key = `${attemptId(series.id, attempt)}/job-${job}`;
    const out: SubmissionFile[] = [];

    if (attempt.state === "completed") {
        out.push(store(files, key, SUBMISSION_DETAILS, "details.json", "application/json",
            JSON.stringify(resultDocument(attempt.score ?? 0, attempt.verdict ?? ""), null, 2)));
    }
    // A log where there is something to say. An infrastructure failure has one
    // and no result document at all, which is the case worth keeping: the run
    // says why it broke and scores nothing.
    const log = attempt.log
        ?? (attempt.verdict === "Compilation error" ? "solution.cpp: error: compilation failed" : undefined);
    if (log) {
        out.push(store(files, key, SUBMISSION_LOG, "log.txt", "text/plain", log));
    }
    return out;
};

/**
 * Who may read one attachment, from the activity's table.
 *
 * **A name with no rule is `managersOnly`.** A Runner that starts attaching
 * something new must not publish it by arriving.
 */
export const visibleTo = (rules: AttachmentRule[], name: string): AttachmentVisibility =>
    rules.find(rule => rule.name === name)?.visibility ?? "managersOnly";

/** What leaves for a participant: their own submission, minus what is withheld. */
export const readableBy = (
    rules: AttachmentRule[],
    files: SubmissionFile[],
    isManager: boolean,
): SubmissionFile[] =>
    isManager ? files : files.filter(file => visibleTo(rules, file.name) === "participant");
