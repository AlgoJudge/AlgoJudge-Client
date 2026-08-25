import { Bundle, BundledProblem } from "./types";

/**
 * What an import would do, worked out before it does anything.
 *
 * **The first step writes nothing**, and that is the design rather than a
 * nicety. An import creates problems in a shared library and rounds in a live
 * activity; the manager sees which of those are new, which are already here,
 * and which the bundle and the library disagree about — and answers the third
 * before a single call is made.
 */

/**
 * How a problem in the bundle is matched against the library, decided
 * 2026-08-25.
 *
 * **Slug and content, never slug alone.** A slug is unique per installation, so
 * it is what "already here" can be asked of at all; the bundle carries a
 * SHA-256 for every file and the Server exposes the same digest for every
 * stored one, so the second half costs a string comparison.
 *
 * The case that decides the shape is the third one: **a slug that matches with
 * different bytes is a question, never a silent substitution.** Attaching
 * somebody else's `zadanie-1` to an imported round would set the wrong work to
 * a whole cohort, and nothing on any screen would say so.
 */
export type Resolution =
    /** Not in the library. Create it. */
    | "create"
    /** In the library, byte for byte. Attach that one and create nothing. */
    | "reuse"
    /** The slug is taken by something else. Import beside it, under a free slug. */
    | "beside";

export interface LibraryProblem {
    id: string;
    slug: string;
    name: string;
    /**
     * Retired: out of the attach picker, still working wherever it was used.
     *
     * **The listing must include these**, and finding that out cost a browser
     * check: the library screen hides them by default, so a plan built from that
     * listing proposed *creating* a problem whose slug the database already
     * held — refused at the first write, half way through an import.
     */
    archived: boolean;
    /** Every SHA-256 of the newest version, in any order. */
    sha256: string[];
}

export interface ProblemPlan {
    /** As the bundle names it. */
    slug: string;
    name: string;
    /** What the library holds under that slug, where anything does. */
    found?: { id: string; name: string; archived?: boolean };
    /** True where the slug matched and the bytes did not: the manager decides. */
    asks: boolean;
    /** The proposal, which the screen may change for an `asks` row. */
    action: Resolution;
    /** Where `beside` is chosen, the slug it would take. */
    besideSlug?: string;
}

export interface ImportPlan {
    problems: ProblemPlan[];
    /** Slugs an assignment names that the bundle carries no problem for. */
    dangling: string[];
}

const sameBytes = (problem: BundledProblem, found: LibraryProblem): boolean => {
    const mine = new Set(problem.files.map(f => f.sha256));
    const theirs = new Set(found.sha256);
    return mine.size === theirs.size && [...mine].every(sha256 => theirs.has(sha256));
};

/**
 * A slug nothing in the library holds, derived from one it does.
 *
 * The same suffix rule the Server uses for a duplicated problem, so a manager
 * who has seen one has seen both. Exported because the screen shows it before
 * anything is created.
 */
export const freeSlug = (basis: string, taken: Set<string>): string => {
    if (!taken.has(basis.toLowerCase())) return basis;
    for (let suffix = 2; suffix < 100; suffix++) {
        const candidate = `${basis}-${suffix}`;
        if (!taken.has(candidate.toLowerCase())) return candidate;
    }
    throw new Error(`Could not find a free slug beside ${basis}`);
};

export const planImport = (bundle: Bundle, library: LibraryProblem[]): ImportPlan => {
    const bySlug = new Map(library.map(p => [p.slug.toLowerCase(), p]));
    const taken = new Set(library.map(p => p.slug.toLowerCase()));

    const problems = bundle.problems.map((problem): ProblemPlan => {
        const found = bySlug.get(problem.slug.toLowerCase());
        if (!found) return { slug: problem.slug, name: problem.name, asks: false, action: "create" };

        // **An archived match is a question, whatever the bytes say.** The
        // Server refuses to attach an archived problem, so reusing one would
        // fail at the assignment rather than at the plan — and un-archiving
        // somebody's retired problem to make an import work is a decision, not
        // a step. `beside` is proposed: it leaves the retirement alone.
        if (found.archived) {
            return {
                slug: problem.slug,
                name: problem.name,
                found: { id: found.id, name: found.name, archived: true },
                asks: true,
                action: "beside",
                besideSlug: freeSlug(problem.slug, taken),
            };
        }

        if (sameBytes(problem, found)) {
            return {
                slug: problem.slug,
                name: problem.name,
                found: { id: found.id, name: found.name },
                asks: false,
                action: "reuse",
            };
        }

        // **The slug is taken by something that is not this.** Proposed as
        // `beside` rather than `reuse`: of the two wrong answers, importing a
        // second problem is visible and undoable, and attaching the wrong one to
        // a round is neither.
        return {
            slug: problem.slug,
            name: problem.name,
            found: { id: found.id, name: found.name },
            asks: true,
            action: "beside",
            besideSlug: freeSlug(problem.slug, taken),
        };
    });

    const known = new Set(bundle.problems.map(p => p.slug));
    const dangling = [...new Set(
        (bundle.activity?.series ?? [])
            .flatMap(series => series.assignments.map(a => a.problemSlug))
            .filter(slug => !known.has(slug)))];

    return { problems, dangling };
};

/** What the plan will do, in a sentence a screen can count from. */
export const summarise = (plan: ImportPlan) => ({
    create: plan.problems.filter(p => p.action === "create").length,
    reuse: plan.problems.filter(p => p.action === "reuse").length,
    beside: plan.problems.filter(p => p.action === "beside").length,
    asking: plan.problems.filter(p => p.asks).length,
});
