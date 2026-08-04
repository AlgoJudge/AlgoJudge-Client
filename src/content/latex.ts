import { ContentError } from "./types";

/**
 * The LaTeX subset, enforced before KaTeX sees the string.
 *
 * KaTeX's own settings do not define a subset. With `strict: "warn"` its
 * defaults quietly become the specification, which is how "simplified LaTeX"
 * turns into "whatever the library happens to accept". The list below is closed:
 * a command outside it is refused, not passed through.
 *
 * Mirrors `docs/specs/CONTENT_FORMAT.md`; changing one means changing both.
 */

const ALLOWED = new Set<string>([
    // structure and spacing
    "left", "right", "quad", "qquad",
    // fractions and roots
    "frac", "dfrac", "tfrac", "binom", "sqrt",
    // operators
    "sum", "prod", "int", "lim", "max", "min", "log", "ln", "gcd", "lcm", "bmod", "pmod",
    // relations
    "le", "ge", "ne", "neq", "leq", "geq", "approx", "equiv", "sim", "propto", "mid",
    // arithmetic
    "cdot", "times", "div", "pm", "mp",
    // sets
    "in", "notin", "subset", "subseteq", "supset", "supseteq", "cup", "cap", "setminus", "emptyset",
    // logic
    "land", "lor", "neg", "implies", "iff", "forall", "exists",
    // arrows
    "to", "rightarrow", "leftarrow", "Rightarrow", "Leftarrow", "leftrightarrow",
    // misc symbols
    "infty", "partial", "nabla",
    // dots
    "ldots", "cdots", "vdots", "ddots", "dots",
    // accents
    "overline", "underline", "hat", "bar", "vec", "tilde",
    // fonts
    "mathbb", "mathcal", "mathrm", "mathbf", "mathit", "text",
    // environments
    "begin", "end",
    // lowercase Greek
    "alpha", "beta", "gamma", "delta", "epsilon", "varepsilon", "zeta", "eta", "theta",
    "vartheta", "iota", "kappa", "lambda", "mu", "nu", "xi", "pi", "rho", "sigma", "tau",
    "upsilon", "phi", "varphi", "chi", "psi", "omega",
    // uppercase Greek
    "Gamma", "Delta", "Theta", "Lambda", "Xi", "Pi", "Sigma", "Upsilon", "Phi", "Psi", "Omega",
]);

/** Refused with a reason of their own, because the reason is worth stating. */
const REFUSED: Record<string, string> = {
    newcommand: "definiowanie makr",
    renewcommand: "definiowanie makr",
    def: "definiowanie makr",
    let: "definiowanie makr",
    gdef: "definiowanie makr",
    href: "odwołania poza dokument",
    url: "odwołania poza dokument",
    htmlClass: "wstrzykiwanie HTML",
    htmlId: "wstrzykiwanie HTML",
    htmlStyle: "wstrzykiwanie HTML",
    includegraphics: "osadzanie plików — użyj bloku embed",
    usepackage: "strukturę dokumentu LaTeX",
    input: "strukturę dokumentu LaTeX",
    include: "strukturę dokumentu LaTeX",
    rule: "sztuczki z odstępami",
    raisebox: "sztuczki z odstępami",
    hspace: "sztuczki z odstępami",
    vspace: "sztuczki z odstępami",
};

const ALLOWED_ENVIRONMENTS = new Set(["cases", "matrix", "pmatrix", "bmatrix", "vmatrix", "array"]);

const COMMAND = /\\([a-zA-Z]+)/g;
const ENVIRONMENT = /\\(?:begin|end)\{([a-zA-Z*]+)\}/g;

/**
 * Throws a {@link ContentError} naming the first command outside the subset.
 * Escaped punctuation such as `\,` or `\{` carries no letters and is unaffected.
 */
export const assertLatexSubset = (source: string, blockIndex?: number): void => {
    for (const match of source.matchAll(ENVIRONMENT)) {
        const name = match[1].replace(/\*$/, "");
        if (!ALLOWED_ENVIRONMENTS.has(name)) {
            throw new ContentError(`Środowisko \\begin{${name}} nie jest dozwolone`, blockIndex);
        }
    }

    for (const match of source.matchAll(COMMAND)) {
        const name = match[1];
        const refusedFor = REFUSED[name];
        if (refusedFor) {
            throw new ContentError(`Polecenie \\${name} jest niedozwolone: ${refusedFor}`, blockIndex);
        }
        if (!ALLOWED.has(name)) {
            throw new ContentError(`Polecenie \\${name} jest spoza dozwolonego podzbioru LaTeX-a`, blockIndex);
        }
    }
};

