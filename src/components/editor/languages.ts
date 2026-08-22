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
 * It mirrors `AlgoJudge-Runner/crates/aj-standard-io/src/language.rs`, which is
 * the catalogue of record. Where they disagree, the Runner is right and this is
 * out of date.
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
const TOOLCHAINS: Record<string, Toolchain> = {
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

    // `uva@1` forwards to onlinejudge.org and builds nothing here. Three of its
    // six ids are shared with the list above, deliberately, so one label map
    // serves both problem types.
    "cpp98-gcc": { label: "C++98 (GCC)", monaco: "cpp", extension: ".cpp" },
    "java8": { label: "Java 8 (OpenJDK)", monaco: "java", extension: ".java" },
    "pascal-fpc": { label: "Pascal (Free Pascal)", monaco: "pascal", extension: ".pas" },
};

/**
 * What to call a toolchain. **An unknown id is its own label**, not an error and
 * not a blank: a Runner that learned a language yesterday must not produce an
 * empty select today.
 */
export const languageLabel = (id: string): string => TOOLCHAINS[id]?.label ?? id;

/** An unmapped language shows as plain text rather than failing to load. */
export const monacoLanguage = (language: string | undefined): string =>
    (language && TOOLCHAINS[language]?.monaco) ?? "plaintext";

/**
 * What pasted source in this toolchain should be called.
 *
 * `.txt` for an id this build has never seen, which the Runner will refuse —
 * correctly, and with a message naming what it does accept. Guessing an
 * extension for an unknown language would be guessing at somebody's verdict.
 */
export const pastedFileName = (id: string | undefined): string =>
    `main${(id && TOOLCHAINS[id]?.extension) ?? ".txt"}`;

/** Every id this build has a label for. For a manager's editor, never for a gate. */
export const KNOWN_LANGUAGES: string[] = Object.keys(TOOLCHAINS);
