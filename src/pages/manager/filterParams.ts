/**
 * A multi-valued filter in the address bar.
 *
 * **The URL and the wire spell a list differently, and that is deliberate.** A
 * URL is read and pasted by people, so `?state=queued,running` is what belongs
 * there; the wire uses repeated keys, because one of the values it carries is a
 * verdict — free text the Server never parses — and any separator chosen for it
 * would eventually be inside a value. The screen converts between the two, and
 * neither side has to know about the other's spelling.
 *
 * The comma also keeps every address anybody has already pasted into a message
 * working: a single value reads the same either way.
 */

/** What the address says, as a list. An absent or empty key is every value. */
export function listed(value: string | null | undefined): string[] {
    return value ? value.split(",").map(one => one.trim()).filter(Boolean) : [];
}

/** And back. An empty selection removes the key rather than leaving it blank. */
export function joined(values: string[]): string | undefined {
    return values.length > 0 ? values.join(",") : undefined;
}

/**
 * The exception, and it is the same one the wire makes.
 *
 * A **verdict** is free text the Server never parses, so it may contain the
 * comma the rule above separates on — `Wrong answer, test 3` is one of them.
 * That one filter is repeated in the address instead: uglier to read, and the
 * only spelling that cannot turn one value into two.
 */
export function repeated(query: URLSearchParams, key: string): string[] {
    return query.getAll(key).filter(Boolean);
}
