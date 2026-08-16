import { StatementRef } from "../../FileApi";
import { ManagedProblem, ManagedProblemVersion } from "../../ManagerApi";
// Type-only, as the other fixtures do it: they say what is stored and are handed
// the store rather than reaching for one of their own.
import type { FakeFiles } from "../FileApiFake";
import {
    arraysStatement,
    graphConnectivityStatement,
    graphConnectivityStatementEn,
    loopsStatement,
    shortestPathStatement,
    topologicalSortStatement,
} from "./content";

/**
 * The problem library, as a manager sees it.
 *
 * Deliberately mixed: problems owned by the signed-in manager and by others,
 * private and shared and instance-wide, one archived and one attached — so the
 * screen has to render every case rather than the happy one.
 */

const ago = (days: number) => new Date(Date.now() - days * 86400000).toISOString();

/**
 * A stand-in checksum, derived from the name so it is stable across reloads.
 * The real one is computed from the bytes; the fake has no bytes to hash, and a
 * random value per render would make every list look like it had changed.
 */
export const fakeSha = (seed: string): string => {
    let hash = 0x811c9dc5;
    let hex = "";
    for (let i = 0; hex.length < 64; i++) {
        for (const character of `${seed}#${i}`) {
            hash = Math.imul(hash ^ character.charCodeAt(0), 0x01000193) >>> 0;
        }
        hex += hash.toString(16).padStart(8, "0");
    }
    return hex.slice(0, 64);
};

export const ME = "user-me";

/**
 * Limits and scoring for a version. Opaque to the Server; the shape is the
 * type's.
 *
 * **The package's shape, and deliberately so.** The chain decided 2026-08-04 is
 * "the defaults inside the package, then `ProblemVersion.config`, then
 * `SeriesProblem.config`, each overriding the one before" — and a layer that
 * overrides another has to name the same fields, or there is nothing to
 * override. This stated `kind`, `limits.memoryBytes` and `scoring.groups` against
 * `docs/specs/PACKAGE_FORMAT.md`'s `format`, `limits.memoryBytes` and top-level
 * `groups` until 2026-08-08, and a hand-written translation in
 * `ManagerApiFake` stood between them.
 *
 * Kibibytes rather than megabytes because that is what the format speaks; a
 * screen showing megabytes divides where it shows them.
 */
const standardIoConfig = (timeMs: number, memoryMib: number, groups: number[]) => ({
    format: "standard-io",
    version: 1,
    limits: { timeMs, memoryBytes: memoryMib * 1024 * 1024 },
    groups: groups.map((points, i) => ({ group: i + 1, points })),
});

export interface ProblemRecord {
    problem: ManagedProblem;
    versions: ManagedProblemVersion[];
    /**
     * Every statement of each version — the default and its translations, as
     * **references**. The text is in the file store, which is where it is on the
     * Server: the editor reads it back with `fileApi.getText`, exactly as it
     * uploaded it.
     */
    content: Map<string, StatementRef[]>;
}

const record = (
    files: FakeFiles,
    problem: ManagedProblem,
    versions: {
        id: string; version: number; note?: string; days: number; config: unknown; hasPackage: boolean;
        content?: string;
        /** Keyed by language subtag, stored as `content-<language>.md`. */
        translations?: Record<string, string>;
    }[],
): ProblemRecord => ({
    problem,
    versions: versions.map(v => ({
        id: v.id,
        version: v.version,
        createdAt: ago(v.days),
        createdByName: problem.ownerName,
        note: v.note,
        config: v.config,
        hasPackage: v.hasPackage,
        files: [
            ...(v.content ? [{
                name: "content.md", scope: "participant" as const, mimeType: "text/markdown",
                sizeBytes: 2048, sha256: fakeSha(`${v.id}/content.md`),
            }] : []),
            ...Object.keys(v.translations ?? {}).map(language => ({
                name: `content-${language}.md`, scope: "participant" as const, mimeType: "text/markdown",
                sizeBytes: 2048, sha256: fakeSha(`${v.id}/content-${language}.md`),
            })),
            ...(v.hasPackage ? [{
                name: "package.zip", scope: "runner" as const, mimeType: "application/zip",
                sizeBytes: 1_450_000, sha256: fakeSha(`${v.id}/package.zip`),
            }] : []),
            ...(v.hasPackage ? [{
                name: "model.cpp", scope: "manager" as const, mimeType: "text/x-c++src",
                sizeBytes: 1200, sha256: fakeSha(`${v.id}/model.cpp`),
            }] : []),
        ],
    })).sort((a, b) => b.version - a.version),
    content: new Map(versions.filter(v => v.content).map(v => [v.id, [
        statementRef(files, v.id, undefined, v.content!),
        ...Object.entries(v.translations ?? {}).map(([language, text]) =>
            statementRef(files, v.id, language, text)),
    ]])),
});

/** Stores one language's text and answers with the reference the editor reads. */
const statementRef = (
    files: FakeFiles,
    versionId: string,
    language: string | undefined,
    text: string,
): StatementRef => {
    const name = language ? `content-${language}.md` : "content.md";
    const stored = files.seedText(`${versionId}/${name}`, "text/markdown", text);
    return { name, language, fileId: stored.id, sha256: stored.sha256, sizeBytes: stored.sizeBytes };
};

export const createProblemLibrary = (files: FakeFiles): ProblemRecord[] => [
    record(
        files,
        {
            id: "prob-graf", slug: "spojnosc-grafu", name: "Spójność grafu", type: "standard-io@1",
            ownerUserId: ME, ownerName: "Amy Horsefighter",
            visibility: "instance", sharedWith: [], external: false,
            currentVersion: 3, versionCount: 3, createdAt: ago(120),
            // Attached to a running contest: deletion is refused, archiving is not.
            attachedCount: 2,
        },
        [
            { id: "v-graf-1", version: 1, days: 120, note: "Pierwsza wersja", config: standardIoConfig(1000, 256, [30, 30, 40]), hasPackage: true, content: graphConnectivityStatement },
            { id: "v-graf-2", version: 2, days: 60, note: "Poprawiona literówka w treści", config: standardIoConfig(1000, 256, [30, 30, 40]), hasPackage: true, content: graphConnectivityStatement },
            { id: "v-graf-3", version: 3, days: 10, note: "Dwa dodatkowe testy w grupie 3", config: standardIoConfig(1000, 256, [30, 30, 40]), hasPackage: true, content: graphConnectivityStatement, translations: { en: graphConnectivityStatementEn } },
        ],
    ),
    record(
        files,
        {
            id: "prob-dijkstra", slug: "najkrotsza-sciezka", name: "Najkrótsza ścieżka", type: "standard-io@1",
            ownerUserId: ME, ownerName: "Amy Horsefighter",
            visibility: "shared", sharedWith: ["user-kowalski", "user-wisniewski"], external: false,
            currentVersion: 2, versionCount: 2, createdAt: ago(90),
            attachedCount: 1,
        },
        [
            { id: "v-dij-1", version: 1, days: 90, note: "Pierwsza wersja", config: standardIoConfig(2000, 512, [50, 50]), hasPackage: true, content: shortestPathStatement },
            { id: "v-dij-2", version: 2, days: 20, note: "Limit czasu 2 s po pomiarze wzorcówki", config: standardIoConfig(2000, 512, [50, 50]), hasPackage: true, content: shortestPathStatement },
        ],
    ),
    record(
        files,
        {
            // A draft: private, one version, no package yet. The common state of
            // something being written, and the one the editor is for.
            id: "prob-topo", slug: "sortowanie-topologiczne", name: "Sortowanie topologiczne", type: "standard-io@1",
            ownerUserId: ME, ownerName: "Amy Horsefighter",
            visibility: "private", sharedWith: [], external: false,
            currentVersion: 1, versionCount: 1, createdAt: ago(4),
            attachedCount: 0,
        },
        [
            { id: "v-topo-1", version: 1, days: 4, note: "Szkic", config: standardIoConfig(1000, 256, [100]), hasPackage: false, content: topologicalSortStatement },
        ],
    ),
    record(
        files,
        {
            id: "prob-petle", slug: "petle-i-sumy", name: "Pętle i sumy", type: "standard-io@1",
            ownerUserId: "user-kowalski", ownerName: "Jan Kowalski",
            visibility: "instance", sharedWith: [], external: false,
            currentVersion: 1, versionCount: 1, createdAt: ago(300),
            attachedCount: 1,
        },
        [
            { id: "v-petle-1", version: 1, days: 300, config: standardIoConfig(1000, 128, [100]), hasPackage: true, content: loopsStatement },
        ],
    ),
    record(
        files,
        {
            // Retired: out of the picker, still working wherever it was used.
            id: "prob-tablice", slug: "tablice", name: "Tablice", type: "standard-io@1",
            ownerUserId: "user-kowalski", ownerName: "Jan Kowalski",
            visibility: "instance", sharedWith: [], external: false,
            archivedAt: ago(15),
            currentVersion: 2, versionCount: 2, createdAt: ago(280),
            attachedCount: 1,
        },
        [
            { id: "v-tab-1", version: 1, days: 280, config: standardIoConfig(1000, 128, [100]), hasPackage: true, content: arraysStatement },
            { id: "v-tab-2", version: 2, days: 200, note: "Zastąpione przez nowsze zadanie", config: standardIoConfig(1000, 128, [100]), hasPackage: true, content: arraysStatement },
        ],
    ),
];
