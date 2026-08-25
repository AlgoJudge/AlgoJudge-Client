import { XMLParser } from "fast-xml-parser";
import { BundleContents } from "../bundle";
import { Bundle, BUNDLE_TYPE, BundledActivity, BundledProblem, BundledSeries } from "../types";
import { buildPackage, buildSampleArchive } from "../../package/build";
import { emptyConfig, PACKAGE_ARCHIVE, SAMPLES_ARCHIVE, TestFile } from "../../package/types";
import { AddressRule } from "../../api/ManagerApi";
import { sha256 } from "../../utils/sha256";
import { toMarkdown } from "./statement";

/**
 * ZawodyWeb's export format, converted into an exchange bundle.
 *
 * **A pure function from an archive to a bundle**, so the import that follows is
 * §8's and not a second one: the plan screen, the matching rule, the compulsory
 * dates and every write all behave exactly as they do for an AlgoJudge archive.
 * That is the whole reason §9 is a converter and not an importer.
 *
 * The source format is reconstructed from ZawodyWeb's own code in
 * `local/exported-packages/zawody-web/przyklady-eksportu/` — `FORMAT.md`,
 * `OGRANICZENIA.md`, `TREE.md`. Three of its properties drive this reader:
 * entries are **flat** and named exactly as the XML says, the XML holds **file
 * names rather than data**, and the file counters are **global to the archive**
 * — problem B's first test is `in004.txt`, not `in001.txt`.
 *
 * ## Everything lost is reported
 *
 * The archive this converts from fails silently: an unknown language is skipped,
 * an unknown checker leaves a null that crashes the judge on the first
 * submission (`OGRANICZENIA.md` §3). This is deliberately the opposite. Every
 * value with no equivalent here produces a line a manager reads **before**
 * importing, and nothing is guessed into a default that looks like a decision.
 */

export interface Loss {
    level: "warning" | "note";
    /** The English sentence and the translation key, as `PackageIssue` does. */
    message: string;
    values?: Record<string, string | number>;
    /** Which problem or round it is about. */
    where?: string;
}

export interface Conversion {
    contents: BundleContents;
    lost: Loss[];
}

/**
 * What each ZawodyWeb language name becomes.
 *
 * **The names are the source instance's own** — the format carries a name and
 * matches it against `languages.name` in the target database — so this maps
 * what the examples use and reports anything else rather than guessing.
 *
 * **`C` and `C++` name no standard**, so a standard is chosen and said out
 * loud. `standard-io@1` offers eighteen toolchains and **none of them is Java
 * or Pascal**, which is the loss most likely to matter and the one ZawodyWeb
 * itself would pass over in silence.
 */
const LANGUAGES: Record<string, string> = {
    "c": "c11-gcc",
    "c++": "cpp17-gcc",
    "cpp": "cpp17-gcc",
    "python": "python3",
    "python3": "python3",
    "pypy": "pypy3",
};

/** Chosen where the source names only the language. Reported as a choice. */
const CHOSEN_STANDARD = new Set(["c", "c++", "cpp", "python"]);

/**
 * The default no part of the format carries.
 *
 * ZawodyWeb writes an offset on each date and never a zone, so an activity has
 * to be given one. Reported, because a contest run anywhere else keeps the
 * wrong hour through every daylight-saving change.
 */
const DEFAULT_ZONE = "Europe/Warsaw";

/** ICPC penalty in `IcpcRanking.tsx`, hard-coded. Seconds, as ZawodyWeb states it. */
const ICPC_PENALTY_SECONDS = 1200;

const BYTES_PER_MIB = 1024 * 1024;

const parser = new XMLParser({
    ignoreAttributes: true,
    // Kept as text: `<order>00</order>` is a string the judge sorts, and a
    // parser that helpfully made it the number 0 would lose the padding the
    // format depends on. Every number here is converted deliberately below.
    parseTagValue: false,
    trimValues: true,
    /**
     * **Both spellings of the namespace, which is not a preference.**
     *
     * `FORMAT.md` §3: *"the prefix does not matter. The default-namespace form
     * and the prefixed form are equivalent; which one appears depends on the
     * JAXB implementation."* Without this, `<ns2:contest>` parses to the key
     * `ns2:contest` and every lookup below misses — an export from one JAXB
     * version converts and from another does not.
     *
     * **The five reference archives would not have caught it**: all five use
     * the default form, so the fixture that does is written here rather than
     * taken from them.
     */
    removeNSPrefix: true,
});

const text = (value: unknown): string | undefined =>
    typeof value === "string" && value.length > 0 ? value : undefined;

const number = (value: unknown, fallback: number): number => {
    const parsed = Number(text(value));
    return Number.isFinite(parsed) ? parsed : fallback;
};

const boolean = (value: unknown, fallback: boolean): boolean => {
    const raw = text(value);
    return raw === undefined ? fallback : raw === "true" || raw === "1";
};

/** One element, a list of them, or none — JAXB writes a lone child unwrapped. */
const many = (value: unknown): Record<string, unknown>[] => {
    if (Array.isArray(value)) return value as Record<string, unknown>[];
    if (value && typeof value === "object") return [value as Record<string, unknown>];
    return [];
};

/**
 * The `<language>` values a problem declares.
 *
 * JAXB writes a lone child unwrapped, so this is one element, a list of them,
 * or nothing at all — the shape every repeated element in this format has.
 */
const declaredLanguages = (node: Record<string, unknown>): string[] => {
    const declared = (node.languages as Record<string, unknown> | undefined)?.language;
    if (Array.isArray(declared)) return declared.map(String);
    return declared === undefined ? [] : [String(declared)];
};

const slugify = (name: string, fallback: string): string => {
    const slug = name
        .normalize("NFD").replace(/[̀-ͯ]/g, "")
        .replace(/ł/gi, "l")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 32);
    return slug.length > 0 ? slug : fallback;
};

/**
 * One `openips` entry as a network.
 *
 * ZawodyWeb accepts a CIDR block **or** a textual prefix it matches with
 * `startsWith` — `158.75.` means every address beginning with those characters.
 * A prefix on an octet boundary converts exactly; anything else cannot, and is
 * reported rather than approximated, because an address rule that is nearly
 * right admits or excludes a room full of people.
 */
export const toNetwork = (entry: string): string | undefined => {
    const value = entry.trim();
    if (/^\d{1,3}(\.\d{1,3}){3}\/\d{1,2}$/.test(value)) return value;
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) return `${value}/32`;

    const prefix = /^(\d{1,3}(?:\.\d{1,3})*)\.$/.exec(value);
    if (prefix) {
        const octets = prefix[1].split(".");
        if (octets.length >= 1 && octets.length <= 3) {
            return `${[...octets, ...Array(4 - octets.length).fill("0")].join(".")}/${octets.length * 8}`;
        }
    }
    return undefined;
};

const instant = (value: unknown): string | undefined => {
    const raw = text(value);
    if (!raw) return undefined;
    const at = new Date(raw);
    return Number.isNaN(at.valueOf()) ? undefined : at.toISOString();
};

interface Entries {
    [name: string]: Uint8Array;
}

const decoder = new TextDecoder();

const fileIn = (entries: Entries, name: string | undefined, about: string): Uint8Array => {
    if (!name) throw new Error(`${about}: the descriptor names no file`);
    const bytes = entries[name];
    if (!bytes) throw new Error(`${about}: the archive holds no ${name}`);
    return bytes;
};

/**
 * One `<problem>`, with its tests turned into a package.
 *
 * **One group per test, which is the faithful reading rather than a shortcut.**
 * ZawodyWeb scores per test; `PACKAGE_FORMAT.md` awards a group's points only
 * when every test in it passes. One test per group makes the two identical.
 * Tests worth nothing become **group 0**, which is that format's own convention
 * for the examples shown in the statement.
 */
const convertProblem = async (
    node: Record<string, unknown>, entries: Entries, files: Map<string, Uint8Array>, lost: Loss[],
): Promise<BundledProblem> => {
    const name = text(node.name) ?? "Bez nazwy";
    const abbrev = text(node.abbrev) ?? "";
    const where = abbrev ? `${abbrev} — ${name}` : name;

    const statement = await toMarkdown(decoder.decode(
        fileIn(entries, text(node.text), where)));
    for (const tag of statement.lost) {
        lost.push({
            level: "warning", where,
            message: "The statement holds a <{{tag}}> that Markdown cannot carry. Check it before publishing.",
            values: { tag },
        });
    }

    // **Every converted statement says so**, so a manager knows which problems
    // were machine-translated and which were written.
    lost.push({
        level: "note", where,
        message: "The statement was converted from HTML and is worth reading before it is published.",
    });

    const languages: string[] = [];
    for (const raw of declaredLanguages(node)) {
        const key = String(raw).trim().toLowerCase();
        const mapped = LANGUAGES[key];
        if (!mapped) {
            lost.push({
                level: "warning", where,
                message: "`{{language}}` has no equivalent here: standard-io@1 builds C, C++ and Python and nothing else.",
                values: { language: String(raw) },
            });
            continue;
        }
        if (CHOSEN_STANDARD.has(key)) {
            lost.push({
                level: "note", where,
                message: "`{{language}}` names no standard, so `{{chosen}}` was chosen.",
                values: { language: String(raw), chosen: mapped },
            });
        }
        if (!languages.includes(mapped)) languages.push(mapped);
    }

    const diff = text(node.diff);
    if (diff && diff !== "NormalDiff") {
        lost.push({
            level: "warning", where,
            message: "The checker `{{diff}}` has no equivalent, so the expected output decides. Add a checker if it needs one.",
            values: { diff },
        });
    }

    const config = text(node.config);
    if (config) {
        lost.push({
            level: "warning", where,
            message: "The problem's `config` has no reader in standard-io@1 and is not carried: {{config}}",
            values: { config: config.replace(/\s+/g, " ").slice(0, 200) },
        });
    }

    if (boolean(node.viewpdf, false)) {
        lost.push({ level: "note", where, message: "`viewpdf` has no equivalent and is not carried." });
    }

    // ── the tests, as groups ────────────────────────────────────────────────
    const raw = (node.tests as Record<string, unknown> | undefined)?.test;
    const tests = many(Array.isArray(raw) ? raw : raw);
    const config_ = emptyConfig();
    const built: TestFile[] = [];

    const orders = tests.map(t => text(t.order));
    if (new Set(orders).size !== orders.length) {
        lost.push({
            level: "warning", where,
            message: "Two tests share an `order`. ZawodyWeb loses all but one of them; every one is carried here.",
        });
    }

    let group = 0;
    let exampleLetter = 0;
    for (const test of tests) {
        const points = number(test.maxpoints, 0);
        const timeMs = number(test.timelimit, 1000);
        const input = decoder.decode(fileIn(entries, text(test.input), where));
        const output = decoder.decode(fileIn(entries, text(test.output), where));

        if (points === 0) {
            built.push({
                name: `0${String.fromCharCode(97 + exampleLetter)}`,
                group: 0, letter: String.fromCharCode(97 + exampleLetter),
                input, output,
            });
            exampleLetter += 1;
            if (!config_.groups.some(g => g.group === 0)) {
                config_.groups.push({ group: 0, points: 0, examples: true, limits: { timeMs } });
            }
            continue;
        }

        group += 1;
        built.push({ name: `${group}a`, group, letter: "a", input, output });
        config_.groups.push({ group, points, limits: { timeMs } });
    }

    config_.limits = {
        timeMs: number(tests[0]?.timelimit, 1000),
        memoryBytes: number(node.memlimit, 256) * BYTES_PER_MIB,
    };
    if (languages.length > 0) config_.languages = languages;

    const files_: BundledProblem["files"] = [];
    const add = async (fileName: string, scope: "participant" | "manager" | "runner", bytes: Uint8Array) => {
        const digest = await sha256(bytes);
        files.set(digest, bytes);
        files_.push({ name: fileName, scope, sha256: digest });
    };

    await add("content.md", "participant", new TextEncoder().encode(statement.markdown));

    // The PDF attachment, where the source carried one. `content.pdf` is the
    // name `CONTENT_FORMAT.md` reserves for a statement that is one.
    const attachment = node.files as Record<string, unknown> | undefined;
    if (attachment) {
        await add("content.pdf", "participant", fileIn(entries, text(attachment.bytes), where));
    }

    await add(PACKAGE_ARCHIVE, "runner",
        new Uint8Array(await (await buildPackage({ config: config_, tests: built })).arrayBuffer()));

    const samples = built.filter(t => t.group === 0);
    if (samples.length > 0) {
        await add(SAMPLES_ARCHIVE, "participant",
            new Uint8Array(await (await buildSampleArchive(samples)).arrayBuffer()));
    }

    return {
        slug: slugify(`${abbrev}-${name}`, "zadanie"),
        name,
        type: "standard-io@1",
        external: false,
        note: "Converted from a ZawodyWeb archive",
        files: files_,
    };
};

/**
 * One `<serie>` as a round, with an assignment per problem.
 *
 * The languages ride on the **assignment** as well as in the package, because
 * that is where the Runner enforces them (`config`) and where the submit form
 * reads them (`spec`).
 */
const convertSeries = (
    node: Record<string, unknown>, order: number, problems: BundledProblem[],
    abbrevs: string[], languages: Map<string, string[]>, lost: Loss[],
): BundledSeries => {
    const name = text(node.name) ?? `Seria ${order}`;

    const penalty = number(node.penaltytime, ICPC_PENALTY_SECONDS);
    if (penalty !== ICPC_PENALTY_SECONDS) {
        lost.push({
            level: "warning", where: name,
            message: "The penalty is {{seconds}} s and this board counts twenty minutes, which is not configurable.",
            values: { seconds: penalty },
        });
    }

    const rules: AddressRule[] = [];
    for (const entry of (text(node.openips) ?? "").split(/[;,\s]+/).filter(Boolean)) {
        const network = toNetwork(entry);
        if (network) rules.push({ network, note: "ZawodyWeb openips" });
        else {
            lost.push({
                level: "warning", where: name,
                message: "`{{entry}}` is not an address range this Server can store, and is not carried.",
                values: { entry },
            });
        }
    }

    return {
        slug: slugify(name, `seria-${order}`),
        name,
        order,
        startDate: instant(node.startdate),
        endDate: instant(node.enddate),
        revealProblemCount: true,
        rankingFreezeAt: instant(node.freezedate),
        rankingRevealAt: instant(node.unfreezedate),
        rankingVisibleFrom: undefined,
        rankingVisibleTo: undefined,
        importance: 0,
        importanceScope: "activity",
        addressRules: rules,
        // `hiddenblocked` says a series is hidden rather than locked outside the
        // allowed addresses, which is what an address rule already does here.
        restrictionsEnabled: true,
        runnerTags: undefined,
        assignments: problems.map((problem, index) => ({
            problemSlug: problem.slug,
            slug: abbrevs[index] || problem.slug,
            name: problem.name,
            order: index + 1,
            spec: { languages: languages.get(problem.slug) ?? [] },
            config: { languages: languages.get(problem.slug) ?? [] },
            props: undefined,
            maxPoints: undefined,
            maxUploadBytes: undefined,
            maxAttachments: undefined,
            maxSubmissions: undefined,
        })),
    };
};



const RANKING = ["icpc", "points", "points"];

export const convertArchive = async (entries: Entries): Promise<Conversion> => {
    const lost: Loss[] = [];
    const files = new Map<string, Uint8Array>();
    const languages = new Map<string, string[]>();

    const descriptor = ["contest.xml", "serie.xml", "problem.xml"].find(name => entries[name]);
    if (!descriptor) {
        throw new Error("The archive holds no contest.xml, serie.xml or problem.xml");
    }

    const parsed = parser.parse(decoder.decode(entries[descriptor])) as Record<string, unknown>;

    /**
     * The root element the descriptor is named after.
     *
     * **Checked rather than assumed**, because the failure without it is a
     * `TypeError` on `undefined` several functions deeper — which is what a
     * reader gets today for a document this cannot read, and tells them
     * nothing. The one case that reached it was a namespace prefix the parser
     * was keeping; the guard outlives that fix, because the next surprise in
     * somebody else's format will not be the same one.
     */
    const root = descriptor.replace(/\.xml$/, "");
    if (!parsed[root] || typeof parsed[root] !== "object") {
        throw new Error(
            `${descriptor} has no <${root}> this reader can find. `
            + "It may be a variant of the format this does not know.");
    }

    const bundle: Bundle = {
        type: BUNDLE_TYPE,
        exportedAt: new Date().toISOString(),
        source: { instance: "ZawodyWeb" },
        kind: "problem",
        problems: [],
    };

    /** Converts one problem node and remembers what its assignment should offer. */
    const one = async (node: Record<string, unknown>): Promise<BundledProblem> => {
        const problem = await convertProblem(node, entries, files, lost);
        const mapped = declaredLanguages(node)
            .map(raw => LANGUAGES[raw.trim().toLowerCase()])
            .filter((id): id is string => Boolean(id));
        languages.set(problem.slug, [...new Set(mapped)]);
        bundle.problems.push(problem);
        return problem;
    };

    if (descriptor === "problem.xml") {
        await one(parsed.problem as Record<string, unknown>);
        return { contents: { bundle, files }, lost };
    }

    const rounds: BundledSeries[] = [];

    const convertRound = async (node: Record<string, unknown>, order: number) => {
        const raw = (node.problems as Record<string, unknown> | undefined)?.problem;
        const nodes = many(Array.isArray(raw) ? raw : raw);
        const made: BundledProblem[] = [];
        const abbrevs: string[] = [];
        for (const problemNode of nodes) {
            made.push(await one(problemNode));
            abbrevs.push(text(problemNode.abbrev) ?? "");
        }
        rounds.push(convertSeries(node, order, made, abbrevs, languages, lost));
    };

    let activityName: string;
    let ranking = "icpc";

    if (descriptor === "serie.xml") {
        bundle.kind = "series";
        const node = parsed.serie as Record<string, unknown>;
        activityName = text(node.name) ?? "Seria";
        await convertRound(node, 1);
    } else {
        bundle.kind = "activity";
        const contest = parsed.contest as Record<string, unknown>;
        activityName = text(contest.name) ?? "Zawody";

        const type = number(contest.type, 0);
        ranking = RANKING[type] ?? "icpc";
        if (type > 2) {
            lost.push({
                level: "warning",
                message: "`type` is {{type}}, which ZawodyWeb itself rejects; the ICPC board was used.",
                values: { type },
            });
        }

        if (text(contest.subtype) && number(contest.subtype, 0) !== 0) {
            lost.push({ level: "note", message: "`subtype` — the sub-ranking — has no equivalent and is not carried." });
        }
        if (text(contest.refreshrate)) {
            lost.push({ level: "note", message: "`refreshrate` has no equivalent: this Client is told when a board changes." });
        }

        const raw = (contest.series as Record<string, unknown> | undefined)?.serie;
        const nodes = many(Array.isArray(raw) ? raw : raw);
        for (const [index, node] of nodes.entries()) await convertRound(node, index + 1);
    }

    const activity: BundledActivity = {
        slug: slugify(activityName, "zawody"),
        name: activityName,
        type: "contest@1",
        rankingType: ranking,
        // The format writes an offset on each date and never a zone.
        timeZone: DEFAULT_ZONE,
        startDate: instant((parsed.contest as Record<string, unknown> | undefined)?.startdate),
        endDate: undefined,
        modules: { questions: true },
        scoreVisibility: "everyone",
        attachmentVisibility: [{ name: "source", visibility: "participant" }],
        props: undefined,
        joinPolicy: "closed",
        unlisted: !boolean((parsed.contest as Record<string, unknown> | undefined)?.visible, true),
        hideEndedSeriesProblems: false,
        // ZawodyWeb has no equivalent — it has no groups — so this is a choice
        // rather than a conversion, and it is the one that discloses nothing.
        showGroupMembers: false,
        maxUploadBytes: codeSizeOf(parsed) ?? 8 * BYTES_PER_MIB,
        maxAttachments: 1,
        maxSubmissionsPerProblem: undefined,
        runnerTags: [],
        documents: await activityDocuments(parsed, files),
        series: rounds,
    };

    lost.push({
        level: "note",
        message: "The format carries no time zone, so `{{zone}}` was used. Change it before publishing if it is wrong.",
        values: { zone: DEFAULT_ZONE },
    });

    bundle.activity = activity;
    return { contents: { bundle, files }, lost };
};

/** The largest `codesize` any problem declares, in bytes. ZawodyWeb states kB. */
const codeSizeOf = (parsed: Record<string, unknown>): number | undefined => {
    const sizes: number[] = [];
    const walk = (value: unknown) => {
        if (Array.isArray(value)) { value.forEach(walk); return; }
        if (!value || typeof value !== "object") return;
        const node = value as Record<string, unknown>;
        if (node.codesize !== undefined) {
            const kb = Number(node.codesize);
            // `0` means no limit in ZawodyWeb, which is not a size.
            if (Number.isFinite(kb) && kb > 0) sizes.push(kb * 1024);
        }
        Object.values(node).forEach(walk);
    };
    walk(parsed);
    return sizes.length > 0 ? Math.max(...sizes) : undefined;
};

/**
 * The contest's prose, as the activity's rules page.
 *
 * `about`, `rules`, `tech` and `email` are four text columns with no equivalent
 * of their own, and dropping them would lose the regulations a contest is run
 * under. They become one Markdown document under the headings they had.
 */
const activityDocuments = async (
    parsed: Record<string, unknown>, files: Map<string, Uint8Array>,
): Promise<BundledActivity["documents"]> => {
    const contest = parsed.contest as Record<string, unknown> | undefined;
    if (!contest) return [];

    const sections: string[] = [];
    const section = (heading: string, value: unknown) => {
        const body = text(value);
        if (body) sections.push(`## ${heading}\n\n${body}`);
    };
    section("O zawodach", contest.about);
    section("Regulamin", contest.rules);
    section("Informacje techniczne", contest.tech);
    const email = text(contest.email);
    if (email) sections.push(`## Kontakt\n\n[${email}](mailto:${email})`);

    if (sections.length === 0) return [];

    const markdown = `---\nversion: 1\n---\n\n${sections.join("\n\n")}\n`;
    const bytes = new TextEncoder().encode(markdown);
    const digest = await sha256(bytes);
    files.set(digest, bytes);

    return [{ kind: "rules", language: undefined, title: "Regulamin", sha256: digest }];
};
