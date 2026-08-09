import { ComponentType, lazy } from "react";
import { Attachment } from "../api/ParticipantApi";
import UnsupportedContent from "./UnsupportedContent";
import StandardIoResult from "./results/StandardIoResult";
import UnsupportedResult from "./results/UnsupportedResult";
import IcpcRanking from "./ranking/IcpcRanking";
import PointsRanking from "./ranking/PointsRanking";
import UnsupportedRanking from "./ranking/UnsupportedRanking";
import { RankingProps } from "./ranking/parse";
import { TypeRegistry } from "./TypeRegistry";

// KaTeX and the block renderers are only needed on a statement or the rules
// page, and KaTeX alone is a quarter of a megabyte. Split out so that the
// activity list and the submission screens do not pay for it.
const ContentView = lazy(() => import("../content/ContentView"));

/**
 * The renderer registries.
 *
 * Adding an activity or problem type must not require a Server change, so
 * everything type-specific is resolved here from a discriminator the Server
 * stores and never interprets. Each registry carries a fallback, because an
 * unsupported type has to degrade visibly rather than break the screen.
 */

/**
 * How an activity type presents its sections.
 *
 * Only behaviour lives here. What a section is *called* — "Runda 1", "Zajęcia 3"
 * — is stored on the series, because a manager may rename it; the type only
 * supplies the default at creation time, which is a manager-side concern.
 */
export interface ActivityRenderer {
    /** Count down to a section's start — a contest reveals problems at a moment. */
    showStartCountdown: boolean;
    /** Show the section's end as a deadline — a course cares when work is due. */
    showDeadline: boolean;
}

const genericActivity: ActivityRenderer = {
    showStartCountdown: true,
    showDeadline: true,
};

export const activityRenderers = new TypeRegistry<ActivityRenderer>(genericActivity)
    .register("contest@*", { showStartCountdown: true, showDeadline: false })
    .register("course@*", { showStartCountdown: false, showDeadline: true });

/**
 * Draws a problem statement, or an activity's rules, from its stored document.
 * A renderer may be lazy, so every call site renders it inside a `Suspense`.
 */
export type StatementRenderer = ComponentType<{ content: unknown; attachments: Attachment[] }>;

export const statementRenderers = new TypeRegistry<StatementRenderer>(UnsupportedContent)
    .register("standard-io@*", ContentView)
    // A statement is a statement whatever the type does with the answer.
    .register("output-only@*", ContentView)
    // The rules page has no problem type of its own; it uses the same format.
    .register("rules@*", ContentView);

/**
 * Draws the evaluation document a Runner attached to a result. The Server stores
 * it without parsing, so what a verdict or a per-test row means is settled here,
 * per problem type.
 */
export type ResultRenderer = ComponentType<{ detail: unknown }>;

export const resultRenderers = new TypeRegistry<ResultRenderer>(UnsupportedResult)
    .register("standard-io@*", StandardIoResult)
    // The same document: a per-test table is a per-test table, and the schema
    // differs only in its `kind`. Sharing the renderer is the point — had the
    // model been wrong, it would not have shared.
    .register("output-only@*", StandardIoResult);

/**
 * What a problem type asks a participant for.
 *
 * The Server sends a `submitFields` list too, and it is a **constant** — the
 * same `code` and `file` pair for every type, because the Server is not allowed
 * to understand a type's semantics and so cannot vary it. That leaves the
 * descriptor wrong for at least one type: an `output-only@1` problem wants a
 * file of answers and must not offer an editor to paste source into.
 *
 * So it is resolved here, beside the renderers, which is where every other
 * type-specific decision already lives. The Server's list is the fallback for a
 * type this build does not know, so an unknown type still renders something a
 * participant can use rather than nothing.
 */
export interface SubmitRenderer {
    /** Offer the editor. */
    code: boolean;
    /** Offer a file field, and what it accepts. */
    file: false | { accept: string[]; label: string; description: string };
    /** Whether a language has to be chosen — an answer file is in no language. */
    language: boolean;
}

export const submitRenderers = new TypeRegistry<SubmitRenderer | null>(null)
    .register("standard-io@*", {
        code: true,
        file: { accept: [".cpp", ".cc", ".py", ".txt"], label: "Solution file", description: "" },
        language: true,
    })
    .register("output-only@*", {
        code: false,
        file: {
            accept: [".zip", ".out", ".txt"],
            label: "Answer file",
            description: "One archive with an answer per test, or a single file for a problem with one test",
        },
        // Nothing is compiled and nothing is run, so there is no language to
        // choose and asking for one would be asking about a program that does
        // not exist.
        language: false,
    });

/**
 * Draws the ranking. Keyed by `Activity.rankingType`, **not** by the activity
 * type: which ranking an activity uses is independent of what kind of activity
 * it is, and ICPC is a different table from the points board rather than a
 * different sort of the same one.
 */
export type RankingRenderer = ComponentType<RankingProps>;

export const rankingRenderers = new TypeRegistry<RankingRenderer>(UnsupportedRanking)
    .register("icpc", IcpcRanking)
    .register("icpc@*", IcpcRanking)
    .register("points", PointsRanking)
    .register("points@*", PointsRanking);

/**
 * A problem type a manager may create, as the Client knows it.
 *
 * The Server stores the discriminator and never reads it, so what types exist is
 * a property of this Client — which is exactly why the list lives beside the
 * registries that draw them. Adding a type is a Client change and nothing else.
 */
export interface ProblemTypeOption {
    /** The stored discriminator, `name@version`. */
    id: string;
    /** English label, and the translation key the screens use. */
    label: string;
    description: string;
}

const PROBLEM_TYPE_CATALOGUE: ProblemTypeOption[] = [
    {
        id: "standard-io@1",
        label: "Standard input and output",
        description: "The solution reads standard input and writes standard output. "
            + "The package carries the tests, the limits and the scoring.",
    },
    {
        id: "output-only@1",
        label: "Answers only",
        description: "The participant sends the answers rather than a program — one archive with "
            + "a file per test. Nothing is compiled and nothing is run, so a solution may be "
            + "worked out by any means at all.",
    },
];

/**
 * The types a manager may choose from: those this Client can actually draw.
 *
 * Filtered rather than listed, so a type whose statement or result renderer was
 * never registered cannot be offered. Choosing one would produce a problem whose
 * every screen says the type is unsupported — a state a manager can reach by
 * importing, but should not be able to reach by picking from a list.
 */
export const problemTypes = (): ProblemTypeOption[] => PROBLEM_TYPE_CATALOGUE.filter(type =>
    statementRenderers.resolve(type.id).supported && resultRenderers.resolve(type.id).supported);

/**
 * An activity type a manager may create, on the same terms as a problem type.
 *
 * The same argument applies for the same reason: the Server stores the
 * discriminator and never reads it, so what kinds of activity exist is a
 * property of this Client and belongs beside the registry that gives them their
 * behaviour.
 */
export interface ActivityTypeOption {
    /** The stored discriminator, `name@version`. */
    id: string;
    /** English label, and the translation key the screens use. */
    label: string;
    description: string;
}

const ACTIVITY_TYPE_CATALOGUE: ActivityTypeOption[] = [
    {
        id: "contest@1",
        label: "Contest",
        description: "Problems open at a moment and the clock counts down to it. "
            + "A series is a round.",
    },
    {
        id: "course@1",
        label: "Course",
        description: "Work is due by a date and the deadline is what is shown. "
            + "A series is a week or a class.",
    },
];

/**
 * The activity types a manager may choose from: those this Client has behaviour
 * for.
 *
 * Filtered against the registry rather than listed, exactly as the problem types
 * are. An unregistered discriminator still draws — `activityRenderers` falls
 * back to something generic rather than to a refusal — but offering one from a
 * list would be offering a kind of activity nobody decided how to present.
 */
export const activityTypes = (): ActivityTypeOption[] =>
    ACTIVITY_TYPE_CATALOGUE.filter(type => activityRenderers.resolve(type.id).supported);

export { TypeRegistry, typeName } from "./TypeRegistry";
export type { Resolved } from "./TypeRegistry";
