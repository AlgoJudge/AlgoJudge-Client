import { ScopedApi } from "../../../api/ScopedApi";

/**
 * Importing problems from the UVa archive.
 *
 * **Two ways in, one way through.** The picker hands back everything needed —
 * number, title and the statement's address — so nothing is asked of anybody
 * else. A pasted list of numbers carries neither a title nor an address, so
 * those are looked up in the public catalogue, which is the only reason this
 * talks to `uhunt.onlinejudge.org` at all.
 *
 * Both paths meet in {@link importOne}, so a problem imported by clicking and
 * one imported by typing its number are the same problem.
 *
 * **Whether the statement still exists is settled by fetching it**, not by
 * reading a field. A problem withdrawn from the archive has no document, the
 * fetch fails, and the refusal says so — which is a measurement rather than a
 * guess about what somebody else's `status` column means.
 */

/** What the catalogue answers about one problem. */
export interface UvaProblem {
    number: number;
    title: string;
    statementUrl: string;
}

/** Why one number did not become a problem, or that it did. */
export type ImportOutcome =
    | { number: number; ok: true; slug: string; name: string }
    | { number: number; ok: false; reason: ImportRefusal; detail?: string };

export type ImportRefusal = "unknown" | "duplicate" | "statement" | "failed";

/** `UVa-100`. Reserved on the Server, so nobody hand-makes one beside an import. */
export const slugOf = (number: number) => `UVa-${number}`;

/**
 * The statement's address, from the number alone.
 *
 * The archive files statements by hundred — problem 100 lives under `1`, 1234
 * under `12`. Used only on the pasted path; the picker states the address
 * itself and is believed over this.
 *
 * **Measured, not inferred** (2026-08-16):
 * `https://onlinejudge.org/external/1/100.pdf` answers `200 application/pdf`,
 * 32 039 bytes.
 */
export const statementUrlOf = (number: number) =>
    `https://onlinejudge.org/external/${Math.floor(number / 100)}/${number}.pdf`;

/**
 * The numbers in something a person typed.
 *
 * Separated by commas or whitespace, because both are what people paste.
 * Anything that is not a positive whole number is dropped rather than refused:
 * a trailing comma is not a mistake worth a message.
 */
export const numbersIn = (text: string): number[] => {
    const seen = new Set<number>();
    for (const piece of text.split(/[,\s]+/)) {
        const number = Number(piece);
        if (Number.isInteger(number) && number > 0) seen.add(number);
    }
    return [...seen];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Reads what the catalogue said, and refuses to guess.
 *
 * **The shape here is not something this product controls**, so it is read
 * defensively: a title is a non-empty string or there is no answer. Anything
 * else means the catalogue changed, and inventing a title from a changed shape
 * would create a problem named after a bug.
 *
 * **What it answers today** (measured 2026-08-16, `/api/p/num/100`):
 * `{"pid":36,"num":100,"title":"The 3n + 1 problem",…,"status":1,…}`. So
 * `title` is the right field — which was an assumption until it was read.
 */
export const titleIn = (answer: unknown): string | undefined => {
    if (!isRecord(answer)) return undefined;
    const title = answer.title;
    return typeof title === "string" && title.trim().length > 0 ? title.trim() : undefined;
};

/**
 * Asks the public catalogue about one number.
 *
 * `uhunt.onlinejudge.org` answers `Access-Control-Allow-Origin: *`, measured
 * rather than assumed, which is why this is a call from the browser and not one
 * more thing for the Server to do on somebody's say-so.
 */
export const lookUp = async (number: number): Promise<UvaProblem | undefined> => {
    const response = await fetch(`https://uhunt.onlinejudge.org/api/p/num/${number}`);
    if (!response.ok) return undefined;

    const title = titleIn(await response.json());
    return title === undefined
        ? undefined
        : { number, title, statementUrl: statementUrlOf(number) };
};

/**
 * Creates one problem, or says why it could not.
 *
 * The order matters and is the same one the manager's own screens use: the
 * problem, then its statement, then the version that names it, then the
 * visibility. A failure part-way leaves a problem with no version, which the
 * library shows as a draft rather than as something a participant can reach.
 */
export const importOne = async (
    api: ScopedApi,
    problem: UvaProblem,
): Promise<ImportOutcome> => {
    const slug = slugOf(problem.number);
    let statement;
    try {
        // **The existence check.** A problem withdrawn from the archive has no
        // document, and this is where that becomes known.
        statement = await api.managerApi.fetchFile(problem.statementUrl);
    } catch (e) {
        return {
            number: problem.number,
            ok: false,
            reason: "statement",
            detail: e instanceof Error ? e.message : undefined,
        };
    }

    try {
        const created = await api.managerApi.createProblem({
            slug,
            name: problem.title,
            type: "uva@1",
            // Permanent, and the whole reason the Server refuses to hand this
            // work to a Runner that judges here.
            external: true,
        });

        await api.managerApi.createProblemVersion(created.id, {
            note: `Imported from onlinejudge.org, problem ${problem.number}`,
            statements: [{ fileId: statement.id }],
            config: {
                uva: { problemNumber: problem.number },
                // **Without this the problem cannot be submitted at all.** The
                // Runner reads a language name and sends the archive its own
                // numeric id; an imported problem with no map is refused before
                // anything leaves, which an end-to-end run on 2026-08-16 showed
                // as "the problem's configuration cannot be read".
                //
                // One entry, and only the one whose id has been seen accepted.
                // Guessing the rest of the archive's table would put numbers in
                // here that nobody has watched work.
                languages: { cpp: 5 },
            },
        });

        // Visible to the whole installation: an imported problem is a library
        // entry, not somebody's draft.
        await api.managerApi.setProblemVisibility(created.id, "instance", []);

        return { number: problem.number, ok: true, slug, name: problem.title };
    } catch (e) {
        // **Duplication is the Server's answer, not a guess made beforehand.**
        // Reading the library first and deciding from it races anybody else
        // importing the same number, and the slug is unique in the database
        // whatever this screen believed a moment earlier.
        const taken = e instanceof Error && /slug/i.test(e.message) && /taken|exist/i.test(e.message);
        return {
            number: problem.number,
            ok: false,
            reason: taken ? "duplicate" : "failed",
            detail: taken ? slug : e instanceof Error ? e.message : undefined,
        };
    }
};
