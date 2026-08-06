/**
 * A language subtag written out in the reader's own language.
 *
 * `Intl.DisplayNames` knows every subtag the browser knows, which is more than
 * any table we would keep here, and it answers in the interface language — so a
 * Polish interface says "angielski" and an English one says "English". Where it
 * is unavailable or does not recognise the tag, the tag itself is the answer:
 * `uk` is worse than "ukraiński" and better than nothing.
 */
export const languageName = (tag: string, inLanguage: string): string => {
    try {
        return new Intl.DisplayNames([inLanguage], { type: "language" }).of(tag) ?? tag;
    } catch {
        return tag;
    }
};

/**
 * Picks the statement a reader should see: an exact match on the interface
 * language, then a match on its base subtag, then the default.
 *
 * `en-GB` reading an `en` statement is right; `en` reading `en-GB` is right too.
 * Neither is worth a separate translation, and refusing to match would show the
 * default to someone who has the language they asked for sitting right there.
 */
export const pickLanguage = (available: string[], preferred: string): string | undefined => {
    const wanted = preferred.toLowerCase();
    const base = wanted.split("-")[0];
    return available.find(tag => tag.toLowerCase() === wanted)
        ?? available.find(tag => tag.toLowerCase().split("-")[0] === base);
};

/**
 * The translation a reader should see, or undefined for the default.
 *
 * The same rule as above, returning the entry rather than its tag, because every
 * caller wants the thing and not the name of it: a statement, a legal document, a
 * front page, an instance's mark. Undefined is the answer that means "use what
 * the document ships with", which is a real answer and not a failure.
 */
export const pickTranslation = <T extends { language: string }>(
    items: T[] | undefined,
    preferred: string,
): T | undefined => {
    if (!items || items.length === 0) return undefined;
    const tag = pickLanguage(items.map(item => item.language), preferred);
    return tag === undefined ? undefined : items.find(item => item.language === tag);
};
