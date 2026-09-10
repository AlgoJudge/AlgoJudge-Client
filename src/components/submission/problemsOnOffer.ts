import { Series } from "../../api/ParticipantApi";
import { maySubmit } from "../../api/seriesState";

/**
 * Every problem that may be submitted to right now, grouped by its round.
 *
 * **`maySubmit` rather than `isOpen` alone**, because that is the rule the Server
 * applies: a round that has ended or been paused is still readable and takes
 * nothing, so offering its problems is offering a form that is refused.
 *
 * Shaped the way Mantine's `Select` expects — `{ group, items }`. A flat option
 * carrying a `group` key is read as a group whose `items` are missing, and the
 * component crashes mapping over them.
 *
 * In a file of its own so `ProblemChoice` exports nothing but its component;
 * a module that mixes the two loses fast refresh, and lint says so.
 */
export const offeredProblems = (series: Series[]) => series
    .filter(s => maySubmit(s))
    .map(s => ({
        group: s.name,
        items: (s.problems ?? []).map(p => ({
            value: p.slug,
            label: `[${p.slug}] ${p.name}`,
        })),
    }))
    .filter(g => g.items.length > 0);

/**
 * Whether the list above holds this slug.
 *
 * Asked before a problem is fetched: an address typed by hand, or a round that
 * closed while somebody had the form open, names a problem that is no longer on
 * offer — and drawing a form for it would be drawing a form the Server refuses.
 */
export const offers = (series: Series[], slug: string | null | undefined): boolean =>
    slug !== null && slug !== undefined
    && offeredProblems(series).some(g => g.items.some(i => i.value === slug));
