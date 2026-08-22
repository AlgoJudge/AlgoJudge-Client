/**
 * The toolchains a solution may be written in, as the product names them.
 *
 * **Two levels, and the id carries both.** `cpp17-gcc` is the C++17 *standard*
 * built by the *GCC* toolchain, because a course teaching a standard and a
 * compiler that occasionally disagrees with another are two different facts. A
 * problem's header shows the standard; this form offers the toolchain.
 *
 * ## This list is labels, not permission
 *
 * **What may be submitted is the assignment's, not this file's.** The select is
 * drawn from `spec.languages` on the assignment and the Runner refuses anything
 * outside `config.languages`; this map only says what each id is *called* and
 * which Monaco grammar colours it.
 *
 * That is deliberate. A Server release per language was what the old
 * arrangement cost, and a Client release per language would be the same mistake
 * one floor up: an id this file has never seen still submits, still judges, and
 * shows as its own id with plain-text highlighting until somebody adds a row.
 *
 * ## One catalogue per problem type
 *
 * **The type defines what it offers, and what each is called.** `standard-io@1`
 * builds and runs eighteen toolchains here; `uva@1` forwards to
 * onlinejudge.org and offers the six that archive accepts.
 *
 * Three ids are shared — `c89-gcc`, `cpp11-gcc`, `python3` — because they mean
 * the same language, and sharing them lets one screen resolve a label whichever
 * type produced a submission. **The labels differ, and must**: the compilers
 * under `uva@1` are the archive's, pinned at the archive's versions. `cpp11-gcc`
 * is GCC 14 with our flags in one and GCC 5.3.0 with UVa's in the other, and
 * showing "C++11 (GCC)" in both would say the two were built by the same
 * compiler.
 *
 * It mirrors `AlgoJudge-Runner/crates/aj-standard-io/src/language.rs` and
 * `AlgoJudge-Runner-UVa/src/language.rs`, which are the catalogues of record.
 * Where they disagree, the Runner is right and this is out of date.
 */

interface Toolchain {
    /** What a person reads. Never derived from the id. */
    label: string,
    /** Monaco's name for the grammar, which is per language and not per toolchain. */
    monaco: string,
    /**
     * What pasted source is called when it is sent — the first one.
     *
     * The Server used to name it, from a table of seven languages compiled into
     * a controller; it cannot any more, because it does not read the language.
     * The name has to be right: the Runner refuses a file whose extension its
     * toolchain does not accept.
     */
    extension: string,
}

/**
 * The eighteen, in the order a form should offer them.
 *
 * Monaco is told the *language*, so every C++ row says `cpp` and every C row
 * says `c` — the standard changes what a compiler accepts, not what a tokenizer
 * highlights. Monaco's `cpp` definition registers `c` alongside it, sharing one
 * tokenizer, so nine registrations serve all sixteen native rows.
 */
const STANDARD_IO: Record<string, Toolchain> = {
    "c89-gcc": { label: "C89 / ANSI C (GCC)", monaco: "c", extension: ".c" },
    "c89-clang": { label: "C89 / ANSI C (Clang)", monaco: "c", extension: ".c" },
    "c99-gcc": { label: "C99 (GCC)", monaco: "c", extension: ".c" },
    "c99-clang": { label: "C99 (Clang)", monaco: "c", extension: ".c" },
    "c11-gcc": { label: "C11 (GCC)", monaco: "c", extension: ".c" },
    "c11-clang": { label: "C11 (Clang)", monaco: "c", extension: ".c" },
    "c23-gcc": { label: "C23 (GCC)", monaco: "c", extension: ".c" },
    "c23-clang": { label: "C23 (Clang)", monaco: "c", extension: ".c" },
    "cpp11-gcc": { label: "C++11 (GCC)", monaco: "cpp", extension: ".cpp" },
    "cpp11-clang": { label: "C++11 (Clang)", monaco: "cpp", extension: ".cpp" },
    "cpp17-gcc": { label: "C++17 (GCC)", monaco: "cpp", extension: ".cpp" },
    "cpp17-clang": { label: "C++17 (Clang)", monaco: "cpp", extension: ".cpp" },
    "cpp20-gcc": { label: "C++20 (GCC)", monaco: "cpp", extension: ".cpp" },
    "cpp20-clang": { label: "C++20 (Clang)", monaco: "cpp", extension: ".cpp" },
    "cpp23-gcc": { label: "C++23 (GCC)", monaco: "cpp", extension: ".cpp" },
    "cpp23-clang": { label: "C++23 (Clang)", monaco: "cpp", extension: ".cpp" },
    "python3": { label: "Python 3 (CPython)", monaco: "python", extension: ".py" },
    "pypy3": { label: "Python 3 (PyPy)", monaco: "python", extension: ".py" },

    // The ids every package written before the catalogue uses, and which the
    // Runner still resolves — to `cpp20-gcc` and `python3`. Carried here so an
    // older assignment's select reads as words rather than as `cpp`.
    "cpp": { label: "C++20 (GCC)", monaco: "cpp", extension: ".cpp" },
    "python": { label: "Python 3 (CPython)", monaco: "python", extension: ".py" },

};

/**
 * What onlinejudge.org accepts, in the order its own form lists them.
 *
 * Nothing here is built by this project — a `uva@1` submission is forwarded and
 * the archive's verdict is reported back — which is why the labels name the
 * archive's compilers and its versions.
 */
const UVA: Record<string, Toolchain> = {
    "c89-gcc": { label: "C89 / ANSI C (GCC 5.3.0)", monaco: "c", extension: ".c" },
    "java8": { label: "Java 8 (OpenJDK 1.8.0)", monaco: "java", extension: ".java" },
    "cpp98-gcc": { label: "C++98 (GCC 5.3.0)", monaco: "cpp", extension: ".cpp" },
    "pascal-fpc": { label: "Pascal (Free Pascal 3.0.0)", monaco: "pascal", extension: ".pas" },
    "cpp11-gcc": { label: "C++11 (GCC 5.3.0)", monaco: "cpp", extension: ".cpp" },
    "python3": { label: "Python 3 (CPython 3.5.1)", monaco: "python", extension: ".py" },
};

const CATALOGUES: Record<string, Record<string, Toolchain>> = {
    "standard-io@1": STANDARD_IO,
    "output-only@1": STANDARD_IO,
    "uva@1": UVA,
};

/**
 * The catalogue for a problem type.
 *
 * **A type this build has never heard of falls back to `standard-io@1`'s**,
 * which is the largest and the one every shared id is in. That is a label being
 * approximately right rather than a screen going blank, and it is the same
 * choice the rest of this file makes: a Runner may know a type this Client does
 * not, and a participant should still read words.
 */
const catalogueFor = (type: string | undefined): Record<string, Toolchain> =>
    (type === undefined ? undefined : CATALOGUES[type]) ?? STANDARD_IO;

/**
 * What to call a toolchain. **An unknown id is its own label**, not an error and
 * not a blank: a Runner that learned a language yesterday must not produce an
 * empty select today.
 */
export const languageLabel = (type: string | undefined, id: string): string =>
    catalogueFor(type)[id]?.label ?? id;

/** An unmapped language shows as plain text rather than failing to load. */
export const monacoLanguage = (type: string | undefined, language: string | undefined): string =>
    (language && catalogueFor(type)[language]?.monaco) ?? "plaintext";

/**
 * What pasted source in this toolchain should be called.
 *
 * `.txt` for an id this build has never seen, which the Runner will refuse —
 * correctly, and with a message naming what it does accept. Guessing an
 * extension for an unknown language would be guessing at somebody's verdict.
 */
export const pastedFileName = (type: string | undefined, id: string | undefined): string =>
    `main${(id && catalogueFor(type)[id]?.extension) ?? ".txt"}`;

/**
 * Every id this build has a label for, under one type. For a manager's editor
 * and for a form with nothing else to offer — never for a gate.
 */
export const knownLanguages = (type: string | undefined): string[] =>
    Object.keys(catalogueFor(type));
