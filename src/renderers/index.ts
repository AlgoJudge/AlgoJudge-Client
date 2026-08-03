import { ComponentType, lazy } from "react";
import { Attachment } from "../api/ParticipantApi";
import UnsupportedContent from "./UnsupportedContent";
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
    // The rules page has no problem type of its own; it uses the same format.
    .register("rules@*", ContentView);

export { TypeRegistry, typeName } from "./TypeRegistry";
export type { Resolved } from "./TypeRegistry";
