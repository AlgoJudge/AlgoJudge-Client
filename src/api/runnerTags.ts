/**
 * Which Runners judge which work.
 *
 * The Server owns the rule; this states it here so a screen can say what a tag
 * will do before anybody saves, and so the fake can answer the same numbers the
 * Server would. `docs/specs/RUNNER_ROUTING.md` in the workspace is the rule
 * itself.
 *
 * A Runner carries tags and so does the work, and they are paired when the two
 * lists **share at least one** — unlike GitLab, whose runner must hold every tag
 * a job asks for. Here a tag is a place rather than a requirement: what a Runner
 * is *able* to do is already answered by its problem types.
 */

/**
 * The pool an untagged Runner serves and untagged work belongs to.
 *
 * Ordinary text anybody may type, and typing it means exactly what leaving the
 * field empty means — which is what lets one round be pulled back out of a
 * course otherwise pinned to a laboratory.
 */
export const DEFAULT_RUNNER_TAG = "default";

export const MAX_RUNNER_TAGS = 16;

/** Trimmed, lowercased, de-duplicated, blanks dropped — as the Server stores them. */
export const normaliseRunnerTags = (tags: readonly string[] | undefined): string[] =>
    [...new Set((tags ?? []).map(tag => tag.trim().toLowerCase()).filter(tag => tag.length > 0))];

/**
 * What is matched against, once the empty case is spelled out.
 *
 * **This one line is the whole of the exclusivity.** A Runner given a tag leaves
 * the general pool, because it no longer shares one with untagged work; work
 * given a tag leaves the general Runners, for the same reason.
 */
export const effectiveRunnerTags = (tags: readonly string[] | undefined): string[] => {
    const normalised = normaliseRunnerTags(tags);
    return normalised.length === 0 ? [DEFAULT_RUNNER_TAG] : normalised;
};

/** Whether a Runner in these pools may be handed work tagged that way. */
export const runnerReaches = (
    runner: readonly string[] | undefined, work: readonly string[] | undefined,
): boolean => {
    const pools = new Set(effectiveRunnerTags(work));
    return effectiveRunnerTags(runner).some(tag => pools.has(tag));
};

/**
 * The tags in force for one round: its own where it has any, otherwise its
 * activity's. Absent on a round means inherit, and there is no third state.
 */
export const tagsInForce = (
    round: readonly string[] | undefined, activity: readonly string[] | undefined,
): string[] => (round && round.length > 0 ? [...round] : [...(activity ?? [])]);
