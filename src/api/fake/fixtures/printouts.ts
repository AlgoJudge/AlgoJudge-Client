import { Printout, PrintoutState } from "../../ParticipantApi";

/**
 * A print request as the fake stores it.
 *
 * **One row serves both screens**, because the fake has no user table to join
 * to: the requester's name and their group are written on the row rather than
 * resolved, which is also what the Server does — a group is stamped when the
 * request is made, so moving somebody between groups moves nothing already
 * sent.
 */
export interface FakePrintout extends Printout {
    requestedByName: string;
    requestedByUserId: string;
    groupName?: string;
    sha256: string;
    resolvedByName?: string;
    sourceDisposedAt?: string;
    /** What the sheet renders. Gone once the request is resolved. */
    source?: string;
    /** Provenance, when the request came from a submission's source view. */
    problemSlug?: string;
    problemName?: string;
}

/** Sixty-four hex characters that are stable per fixture, so a sheet matches a row. */
const digest = (seed: string): string => {
    let a = 0x811c9dc5;
    const out: string[] = [];
    for (let i = 0; i < 32; i++) {
        for (const ch of `${seed}:${i}`) {
            a = Math.imul(a ^ ch.charCodeAt(0), 0x01000193) >>> 0;
        }
        out.push((a & 0xff).toString(16).padStart(2, "0"));
    }
    return out.join("");
};

const minutesAgo = (n: number) => new Date(Date.now() - n * 60000).toISOString();

const SAMPLE = `#include <bits/stdc++.h>
using namespace std;

int main() {
    int n;
    if (!(cin >> n)) return 0;
    vector<long long> a(n);
    for (auto &x : a) cin >> x;
    sort(a.begin(), a.end());
    cout << a[n / 2] << "\\n";
}
`;

/**
 * The queue an operator sees on the contest.
 *
 * Three rows on purpose, so the screen has every state it can draw: one waiting
 * that came from a submission, one waiting that was pasted, and one already
 * printed whose source has gone — which is the row that proves the sheet still
 * opens after disposal.
 */
export const printoutsFor = (activityId: string, hasPrintouts: boolean): FakePrintout[] => {
    if (!hasPrintouts) return [];

    return [
        {
            id: `po-${activityId.slice(-4)}-1`,
            fileName: "A.cpp",
            title: "Zadanie A — mediana",
            sizeBytes: SAMPLE.length,
            state: "requested" as PrintoutState,
            requestedAt: minutesAgo(24),
            requestedByName: "Jan Kowalski",
            requestedByUserId: "user-jan",
            groupName: "Zespół Alfa",
            sha256: digest(`${activityId}-1`),
            source: SAMPLE,
            problemSlug: "A",
            problemName: "Mediana",
        },
        {
            id: `po-${activityId.slice(-4)}-2`,
            fileName: "notatka.py",
            sizeBytes: 96,
            state: "requested" as PrintoutState,
            requestedAt: minutesAgo(9),
            requestedByName: "Amy Horsefighter",
            requestedByUserId: "user-amy",
            sha256: digest(`${activityId}-2`),
            source: "for i in range(10):\n    print(i * i)\n",
        },
        {
            id: `po-${activityId.slice(-4)}-3`,
            fileName: "B.cpp",
            sizeBytes: 412,
            state: "printed" as PrintoutState,
            requestedAt: minutesAgo(96),
            resolvedAt: minutesAgo(91),
            requestedByName: "Marta Nowak",
            requestedByUserId: "user-marta",
            groupName: "Zespół Beta",
            sha256: digest(`${activityId}-3`),
            resolvedByName: "Piotr Drukarz",
            sourceDisposedAt: minutesAgo(91),
        },
    ];
};
