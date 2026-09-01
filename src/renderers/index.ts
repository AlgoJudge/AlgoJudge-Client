import { ComponentType, lazy } from "react";
import { Attachment } from "../api/ParticipantApi";
import UnsupportedContent from "./UnsupportedContent";
import StandardIoResult from "./results/StandardIoResult";
import UnsupportedResult from "./results/UnsupportedResult";
import UvaResult from "./results/UvaResult";
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
    // A UVa statement is the archive's PDF, copied into the instance at import.
    // `ContentView` renders Markdown, so a manager who later writes one gets it;
    // until then `ProblemPage` hands the PDF straight to the viewer.
    .register("uva@*", ContentView)
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
    .register("output-only@*", StandardIoResult)
    // A different document and a different shape: no per-test table, because the
    // archive discloses none. Sharing `StandardIoResult` here would draw an empty
    // table and call it a result.
    .register("uva@*", UvaResult);

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
    /**
     * What the participant has to be told **before** they submit, as translation
     * keys.
     *
     * Not decoration. A `uva@1` submission leaves the instance for a third party
     * and is stored there for ever; somebody should learn that before sending
     * their work, not afterwards.
     */
    notices?: string[];
}

export const submitRenderers = new TypeRegistry<SubmitRenderer | null>(null)
    .register("standard-io@*", {
        code: true,
        file: { accept: [".cpp", ".cc", ".py", ".txt"], label: "Solution file", description: "" },
        language: true,
    })
    .register("uva@*", {
        code: true,
        // No file: the archive takes source, and only source.
        file: false,
        notices: [
            // §10.2: the most significant property of the type, and not a
            // technical detail. Said before the act, because afterwards it is
            // news rather than a choice.
            "This solution is sent to onlinejudge.org to be judged, and is stored there.",
            // §7.4, measured from the archive's own rules: a genuine surprise for
            // anybody used to a local judge, and one sentence saves a confused
            // runtime error.
            "The program must return 0 to the shell, or the archive reports a runtime error whatever it printed.",
        ],
        // UVa needs one, and the problem's own configuration says which are on
        // offer — a language it does not accept is refused before anything is
        // sent, and again by the Runner if it arrives anyway.
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
    /**
     * **This one arrives by import and never by hand.**
     *
     * The Client still draws it — an imported problem has to be readable — but
     * it is not offered on the New problem form, because that form cannot make a
     * working one. What identifies a `uva@1` problem is
     * `props.uva.problemNumber` and the external mark, both written by the
     * import and neither askable for here; choosing it from the list produced a
     * problem the archive could not be asked about and no Runner would take.
     */
    imported?: true;
}

const PROBLEM_TYPE_CATALOGUE: ProblemTypeOption[] = [
    {
        id: "standard-io@1",
        label: "Standard input and output",
        description: "The solution reads standard input and writes standard output. "
            + "The package carries the tests, the limits and the scoring.",
    },
    {
        id: "uva@1",
        imported: true,
        label: "Judged on UVa Online Judge",
        description: "The statement is a copy of the archive's, and the solution is forwarded to "
            + "onlinejudge.org to be judged there. There are no tests here and no partial credit: "
            + "the verdict is the archive's, and it is accepted or it is not.",
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
 * What a problem type gives a **manager** to edit.
 *
 * **The Server cannot answer this and is forbidden from learning to.**
 * `Problem.External` is a boolean it stores and compares against a Runner's own,
 * and `ProblemVersion.Props` is opaque to it — "it does not read this and must
 * not branch on a problem type". So the shape of the editor is decided here,
 * beside the renderers, where every other type-specific decision already lives.
 *
 * The fallback is the `standard-io@1` answer, because that is what every screen
 * assumed before this existed: a type this build does not know keeps the editor
 * it has always been given rather than losing half of it.
 */
export interface ProblemEditing {
    /**
     * Whether this installation builds the package a solution is judged against.
     *
     * **Not "no package yet".** A `uva@1` problem is judged by the archive
     * against the archive's tests, so a *Missing* badge is a false statement
     * rather than a warning, "package unchanged" describes a thing that never
     * existed, and a trial run has nothing to run — the Server refuses to create
     * one for an external problem, and the request simply times out.
     */
    package: boolean;
    /**
     * Whether the time and memory a solution is judged under are this
     * installation's to set.
     *
     * `false` where somebody else's judge decides them. **Nothing enforces this
     * on either side** — an assignment's `config` is opaque to the Server — so a
     * manager can write limits that are never honoured and then be shown them as
     * though they were. Saying so is the only guard there is.
     */
    limits: boolean;
    /**
     * What identifies this problem outside the installation, read from the
     * version's `props`.
     *
     * **Shown, never edited.** It is written once at import and carried forward
     * by the Server on every later version. Until this existed no screen showed
     * it at all, so nothing told a manager which archive problem an imported
     * entry points at.
     */
    identity?: {
        /** Translation key for the label. */
        label: string;
        /** The value to show, or `undefined` where this version carries none. */
        read: (props: unknown) => string | undefined;
    };
    /**
     * What the manager has to be told about what is absent, as translation keys.
     *
     * A tab that is simply gone is a puzzle; the same tab absent with a sentence
     * is an answer.
     */
    notices?: string[];
}

export const problemEditing = new TypeRegistry<ProblemEditing>({ package: true, limits: true })
    .register("uva@*", {
        package: false,
        limits: false,
        identity: {
            label: "Problem in the archive",
            read: (props) => {
                const number = (props as { uva?: { problemNumber?: unknown } } | null | undefined)
                    ?.uva?.problemNumber;
                return typeof number === "number" ? String(number) : undefined;
            },
        },
        notices: [
            "This problem is judged by onlinejudge.org against its own tests, so it carries no package here.",
            "The time and memory it is judged under are the archive's, and cannot be set here.",
        ],
    });

/**
 * The types a manager may choose from: those this Client can actually draw.
 *
 * Filtered rather than listed, so a type whose statement or result renderer was
 * never registered cannot be offered. Choosing one would produce a problem whose
 * every screen says the type is unsupported — a state a manager can reach by
 * importing, but should not be able to reach by picking from a list.
 *
 * **And the same for a type that only an import can make.** `imported` is the
 * other half of that sentence: `uva@1` is drawn perfectly well and cannot be
 * created, so it is registered and not offered.
 */
export const problemTypes = (): ProblemTypeOption[] => PROBLEM_TYPE_CATALOGUE.filter(type =>
    !type.imported
    && statementRenderers.resolve(type.id).supported && resultRenderers.resolve(type.id).supported);

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
