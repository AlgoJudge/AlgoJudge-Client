// The ZawodyWeb converter, against archives built from the documented format.
//
// **Two sources, and the second is optional on purpose.** The fixtures below are
// written here and go through CI. The five real archives live in the workspace's
// `local/exported-packages/`, which is untracked and outside this repository —
// so they are used when present and the run says loudly when they are not,
// rather than skipping in silence.
//
// `convert.ts` is a pure function from unzipped entries to a bundle, which is
// what lets any of this run in Node with no browser and no Server. The import
// that follows is §8's and has its own check.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = ".zawodyweb-check";

execFileSync("npx", ["tsc",
    "src/exchange/zawodyweb/convert.ts", "src/exchange/zawodyweb/statement.ts",
    "--outDir", OUT, "--rootDir", "src",
    "--module", "esnext", "--target", "es2022", "--moduleResolution", "bundler", "--skipLibCheck",
], { stdio: "inherit", shell: process.platform === "win32" });

const addExtensions = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) addExtensions(path);
        else if (entry.name.endsWith(".js")) {
            writeFileSync(path, readFileSync(path, "utf8")
                .replace(/(from\s+")(\.[^"]*?)(")/g, (all, a, specifier, b) =>
                    specifier.endsWith(".js") ? all : `${a}${specifier}.js${b}`));
        }
    }
};
addExtensions(OUT);

const { convertArchive, toNetwork } = await import(`../${OUT}/exchange/zawodyweb/convert.js`);
const { readPackage } = await import(`../${OUT}/package/build.js`);

const fail = (message) => { console.error("FAIL:", message); process.exitCode = 1; };
const ok = (message) => console.log("  ok  ", message);
const check = (condition, message) => condition ? ok(message) : fail(message);

const encode = (text) => new TextEncoder().encode(text);
const said = (lost, fragment) => lost.some(l => l.message.includes(fragment));

// ── 1. An address prefix is converted or refused, never approximated ────────
//
// ZawodyWeb matches `158.75.` with `startsWith`; this Server stores a network.
// A prefix on an octet boundary converts exactly, and anything else must be
// reported — a rule that is nearly right admits or excludes a room of people.

check(toNetwork("192.168.1.0/24") === "192.168.1.0/24", "a CIDR block is carried as it stands");
check(toNetwork("158.75.") === "158.75.0.0/16", `a dotted prefix becomes its network (${toNetwork("158.75.")})`);
check(toNetwork("10.") === "10.0.0.0/8", `and a one-octet prefix too (${toNetwork("10.")})`);
check(toNetwork("158.75.4.3") === "158.75.4.3/32", "a bare address is one host");
check(toNetwork("158.7") === undefined, "a prefix off an octet boundary is refused rather than rounded");
check(toNetwork("2001:db8::/32") === undefined, "and IPv6, which ZawodyWeb never matched anyway");

// ── 2. A whole contest converts ─────────────────────────────────────────────
//
// The fixture states what `FORMAT.md` documents, including the property nothing
// else would catch: **the file counters are global to the archive**, so problem
// B's first test is `in003.txt` rather than `in001.txt`.

const contest = {
    "contest.xml": encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<contest xmlns="http://zawodyweb.mat.umk.pl/">
    <name>Konkurs Informatyczny</name>
    <type>2</type>
    <subtype>1</subtype>
    <startdate>2026-03-02T09:00:00.000+01:00</startdate>
    <about>Konkurs wydziałowy.</about>
    <rules>Kara 20 minut za błędne zgłoszenie.</rules>
    <tech>Rozwiązania kompilowane automatycznie.</tech>
    <email>kontakt@example.edu.pl</email>
    <refreshrate>60</refreshrate>
    <visible>true</visible>
    <series>
        <serie>
            <name>Etap I</name>
            <startdate>2026-03-02T09:00:00.000+01:00</startdate>
            <enddate>2026-03-02T14:00:00.000+01:00</enddate>
            <freezedate>2026-03-02T13:00:00.000+01:00</freezedate>
            <unfreezedate>2026-03-02T14:30:00.000+01:00</unfreezedate>
            <penaltytime>1200</penaltytime>
            <visible>true</visible>
            <openips>192.168.1.0/24, 158.75.</openips>
            <hiddenblocked>false</hiddenblocked>
            <problems>
                <problem>
                    <name>Suma dwóch liczb</name>
                    <abbrev>A</abbrev>
                    <text>problem001.html</text>
                    <memlimit>64</memlimit>
                    <codesize>64</codesize>
                    <diff>NormalDiff</diff>
                    <visible>true</visible>
                    <viewpdf>false</viewpdf>
                    <languages>
                        <language>C</language>
                        <language>C++</language>
                        <language>Java</language>
                    </languages>
                    <tests>
                        <test><input>in001.txt</input><output>out001.txt</output><maxpoints>0</maxpoints><timelimit>1000</timelimit><order>00</order></test>
                        <test><input>in002.txt</input><output>out002.txt</output><maxpoints>50</maxpoints><timelimit>2000</timelimit><order>01</order></test>
                    </tests>
                    <config>gcc.args=-O2 -std=c11</config>
                    <files>
                        <bytes>problem001.files</bytes>
                        <filename>suma-dwoch-liczb</filename>
                        <extension>pdf</extension>
                    </files>
                </problem>
                <problem>
                    <name>Odwrócenie napisu</name>
                    <abbrev>B</abbrev>
                    <text>problem002.html</text>
                    <memlimit>128</memlimit>
                    <codesize>64</codesize>
                    <diff>ExactDiff</diff>
                    <visible>true</visible>
                    <viewpdf>false</viewpdf>
                    <languages><language>Python</language></languages>
                    <tests>
                        <test><input>in003.txt</input><output>out003.txt</output><maxpoints>100</maxpoints><timelimit>3000</timelimit><order>00</order></test>
                    </tests>
                </problem>
            </problems>
        </serie>
        <serie>
            <name>Etap II</name>
            <startdate>2026-04-13T10:00:00.000+02:00</startdate>
            <enddate>2026-04-13T13:00:00.000+02:00</enddate>
            <penaltytime>1200</penaltytime>
            <visible>true</visible>
            <openips>158.75.</openips>
            <hiddenblocked>true</hiddenblocked>
            <problems>
                <problem>
                    <name>Najwiekszy wspolny dzielnik</name>
                    <abbrev>C</abbrev>
                    <text>problem003.html</text>
                    <memlimit>64</memlimit>
                    <codesize>64</codesize>
                    <diff>NormalDiff</diff>
                    <visible>true</visible>
                    <viewpdf>false</viewpdf>
                    <languages><language>C++</language></languages>
                    <tests>
                        <test><input>in004.txt</input><output>out004.txt</output><maxpoints>100</maxpoints><timelimit>1000</timelimit><order>00</order></test>
                    </tests>
                </problem>
            </problems>
        </serie>
    </series>
</contest>`),
    "problem001.html": encode("<h2>Suma</h2><p>Wczytaj <b>dwie</b> liczby.</p><pre>2 3\n5</pre>"),
    "problem002.html": encode("<p>Odwróć napis.</p><table><tr><td>x</td></tr></table>"),
    "in001.txt": encode("2 3"), "out001.txt": encode("5"),
    "in002.txt": encode("-1000000000 1000000000"), "out002.txt": encode("0"),
    "in003.txt": encode("kajak"), "out003.txt": encode("kajak"),
    "problem003.html": encode("<p>Policz NWD.</p>"),
    "in004.txt": encode("48 18"), "out004.txt": encode("6"),
    // A PDF only in the sense that matters here: the converter carries bytes it
    // never opens, under the name `CONTENT_FORMAT.md` reserves for a statement
    // that is one.
    "problem001.files": encode("%PDF-1.4 minimal, and never opened"),
};

const { contents, lost } = await convertArchive(contest);
const bundle = contents.bundle;

check(bundle.kind === "activity", `a contest becomes an activity bundle (${bundle.kind})`);
check(bundle.problems.length === 3, `with all three problems (${bundle.problems.length})`);
check(bundle.activity.series.length === 2, `and both rounds (${bundle.activity.series.length})`);

// **KI is not ICPC.** `type` 2 is a points board, and calling it ICPC would
// score the whole contest by a rule it was not run under.
check(bundle.activity.rankingType === "points",
    `type 2 becomes the points board (${bundle.activity.rankingType})`);

const round = bundle.activity.series[0];
check(round.assignments.length === 2, "the first round holds both its assignments");

// **A second round, because the counters run across the whole archive.** With
// one round nothing distinguishes a converter that numbers per problem from one
// that numbers per archive — and the second round's problem is the one whose
// files come last.
const second = bundle.activity.series[1];
check(second.assignments.length === 1 && second.assignments[0].slug === "C",
    `the second round holds its own (${second.assignments.map(a => a.slug).join()})`);
check(second.order === 2, `and comes after the first (${second.order})`);
check(second.addressRules.map(r => r.network).join() === "158.75.0.0/16",
    `with an address rule of its own (${second.addressRules.map(r => r.network).join()})`);
check(round.assignments.map(a => a.slug).join() === "A,B",
    `and the abbrevs become the assignment slugs (${round.assignments.map(a => a.slug).join()})`);
check(round.addressRules.map(r => r.network).join() === "192.168.1.0/24,158.75.0.0/16",
    `openips becomes address rules (${round.addressRules.map(r => r.network).join()})`);
check(round.rankingFreezeAt === "2026-03-02T12:00:00.000Z",
    `the freeze keeps its instant (${round.rankingFreezeAt})`);

// ── 3. The package: one group per test, and group 0 is the examples ─────────

const first = bundle.problems[0];
const archive = contents.files.get(first.files.find(f => f.name === "package.zip").sha256);
const read = await readPackage(new Blob([archive]));

check(read.tests.length === 2, `both tests are in the package (${read.tests.length})`);
check(read.tests.map(t => t.name).join() === "0a,1a",
    `the unscored one is group 0 and the scored one group 1 (${read.tests.map(t => t.name).join()})`);
check(read.config.groups.find(g => g.group === 0)?.examples === true,
    "group 0 is marked as the examples, which is what the statement shows");
check(read.config.groups.find(g => g.group === 1)?.points === 50,
    `and the scored group carries its points (${read.config.groups.find(g => g.group === 1)?.points})`);
check(read.config.groups.find(g => g.group === 1)?.limits?.timeMs === 2000,
    `with its own time limit (${read.config.groups.find(g => g.group === 1)?.limits?.timeMs})`);
check(read.config.limits.memoryBytes === 64 * 1024 * 1024,
    `memlimit is megabytes and becomes bytes (${read.config.limits.memoryBytes})`);

// **The tests are paired by the names the XML gives, not by position.** The
// counters run across the whole archive, so problem B's only test is `in003`.
check(read.tests[0].input === "2 3" && read.tests[1].input === "-1000000000 1000000000",
    "the first problem's tests are its own");

const middle = bundle.problems[1];
const middleArchive = contents.files.get(middle.files.find(f => f.name === "package.zip").sha256);
const middleRead = await readPackage(new Blob([middleArchive]));
check(middleRead.tests.length === 1 && middleRead.tests[0].input === "kajak",
    `and the second problem's are in003, not in001 (${JSON.stringify(middleRead.tests[0]?.input)})`);

const last = bundle.problems[2];
const lastArchive = contents.files.get(last.files.find(f => f.name === "package.zip").sha256);
const lastRead = await readPackage(new Blob([lastArchive]));
check(lastRead.tests[0]?.input === "48 18",
    `and the third round's problem takes in004, across the round boundary (${JSON.stringify(lastRead.tests[0]?.input)})`);

// ── 3.1 The attachment ──────────────────────────────────────────────────────
//
// `<files><bytes>` names an entry holding a PDF. It becomes `content.pdf`,
// which is the name `CONTENT_FORMAT.md` reserves for a statement that is one —
// and the converter never opens it.

const pdf = first.files.find(f => f.name === "content.pdf");
check(pdf !== undefined, `the PDF attachment is carried as content.pdf (${pdf?.name})`);
check(pdf?.scope === "participant", `and reaches the participant (${pdf?.scope})`);
check(new TextDecoder().decode(contents.files.get(pdf.sha256)).startsWith("%PDF"),
    "byte for byte, unopened");

// ── 4. The statement ────────────────────────────────────────────────────────

const statement = new TextDecoder().decode(
    contents.files.get(first.files.find(f => f.name === "content.md").sha256));

check(statement.startsWith("---\nversion: 1\n---"), "the statement carries the front matter");
check(/## Suma/.test(statement), `a heading becomes Markdown (${/##[^\n]*/.exec(statement)?.[0]})`);
check(/\*\*dwie\*\*/.test(statement), "and bold text with it");
// A `<pre>` without a `<code>` inside is what ZawodyWeb writes, and turndown's
// own rule only fences the pair — so an example came out as loose text whose
// line breaks the renderer collapses.
check(/```\n2 3\n5\n```/.test(statement), `an example block becomes a fence\n${statement.slice(-40)}`);
check(!/<[a-z]/i.test(statement), "and no tag survives, because Markdown here refuses raw HTML");

// ── 5. Everything with no equivalent is reported ────────────────────────────
//
// The archive this converts from fails silently — an unknown language is
// skipped, an unknown checker leaves a null that crashes the judge on the first
// submission. Each of these is the opposite of that.

check(said(lost, "standard-io@1 builds C, C++ and Python"),
    "Java is reported, because standard-io@1 has none");
check(lost.some(l => l.values?.language === "Java"), "and named");
check(said(lost, "names no standard"), "C without a standard is reported as a choice");
check(lost.some(l => l.values?.diff === "ExactDiff"),
    "a checker with no equivalent is reported");
check(!lost.some(l => l.values?.diff === "NormalDiff"),
    "and NormalDiff is not, because token comparison is exactly what it means");
check(said(lost, "`config` has no reader"), "the problem's compiler flags are reported rather than dropped");
check(said(lost, "Markdown cannot carry"), "a table in a statement is reported");
check(said(lost, "sub-ranking"), "the sub-ranking is reported");
check(said(lost, "refreshrate"), "so is the refresh rate");
check(said(lost, "carries no time zone"), "and the time zone this format never had");
check(said(lost, "converted from HTML and is worth reading"),
    "every converted statement is flagged for review");
check(!said(lost, "penalty is"), "a 1200 s penalty is exactly twenty minutes, so nothing is said");

// The penalty that is *not* twenty minutes must be said, because the board
// counts twenty regardless and nothing else would mention it.
const other = structuredClone(contest);
other["contest.xml"] = encode(new TextDecoder().decode(contest["contest.xml"])
    .replace("<penaltytime>1200</penaltytime>", "<penaltytime>600</penaltytime>"));
const penalised = await convertArchive(other);
check(said(penalised.lost, "counts twenty minutes"),
    "a penalty that is not twenty minutes is reported");

// ── 6. The contest's prose becomes the rules page ───────────────────────────

check(bundle.activity.documents.length === 1, "the contest's prose becomes one document");
const rules = new TextDecoder().decode(contents.files.get(bundle.activity.documents[0].sha256));
check(/## Regulamin/.test(rules) && /## Informacje techniczne/.test(rules) && /mailto:/.test(rules),
    "holding the regulations, the technical notes and the contact address");

// ── 7. A duplicate order is carried here and lost there ─────────────────────
//
// `OGRANICZENIA.md` §4: ZawodyWeb collects tests into a `TreeSet` whose
// comparator returns 0 for equal orders, so a repeated `<order>` silently keeps
// one of them. This carries both and says so.

const repeated = structuredClone(contest);
repeated["contest.xml"] = encode(new TextDecoder().decode(contest["contest.xml"])
    .replace("<order>01</order>", "<order>00</order>"));
const both = await convertArchive(repeated);
check(said(both.lost, "share an `order`"), "a repeated order is reported");
check(both.contents.bundle.problems[0].files.some(f => f.name === "package.zip"),
    "and the problem still converts, with both tests");

// ── 8. What the reader refuses ──────────────────────────────────────────────

const refuses = async (what, entries) => {
    try {
        await convertArchive(entries);
        fail(`${what} was accepted`);
    } catch (e) {
        ok(`${what} is refused (${e.message.slice(0, 70)})`);
    }
};

await refuses("an archive with no descriptor", { "in001.txt": encode("2 3") });
await refuses("a descriptor naming a statement the archive lacks", {
    ...contest,
    "contest.xml": encode(new TextDecoder().decode(contest["contest.xml"])
        .replace("problem001.html", "nie-ma.html")),
});

// ── 9. A single problem, and a single round ─────────────────────────────────

const single = {
    "problem.xml": encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<problem xmlns="http://zawodyweb.mat.umk.pl/">
    <name>Suma dwóch liczb</name><abbrev>A</abbrev><text>problem001.html</text>
    <memlimit>64</memlimit><codesize>0</codesize><diff>NormalDiff</diff>
    <visible>true</visible><viewpdf>false</viewpdf>
    <languages><language>C++</language></languages>
    <tests><test><input>in001.txt</input><output>out001.txt</output><maxpoints>100</maxpoints><timelimit>1000</timelimit><order>00</order></test></tests>
</problem>`),
    "problem001.html": encode("<p>Zsumuj.</p>"),
    "in001.txt": encode("2 3"), "out001.txt": encode("5"),
};
const alone = await convertArchive(single);
check(alone.contents.bundle.kind === "problem", `problem.xml becomes a problem bundle (${alone.contents.bundle.kind})`);
check(alone.contents.bundle.activity === undefined, "with no activity around it");

// **A problem on its own still carries its languages**, in the package — there
// is no assignment to put them on, and a problem imported without them accepts
// whatever the Runner can build.
const aloneArchive = alone.contents.files.get(
    alone.contents.bundle.problems[0].files.find(f => f.name === "package.zip").sha256);
const aloneRead = await readPackage(new Blob([aloneArchive]));
check(aloneRead.config.languages?.join() === "cpp17-gcc",
    `and states them in config.yml (${aloneRead.config.languages?.join()})`);

// ── 10. The five real archives, when the workspace is checked out ───────────

const REAL = "../local/exported-packages/zawody-web/przyklady-eksportu";

if (!existsSync(REAL)) {
    console.log(`\n  note   ${REAL} is not here, so the five real archives were not converted.`);
    console.log("         They live in the workspace's untracked `local/`, which CI does not have.");
} else {
    const { readdirSync: read } = await import("node:fs");
    for (const variant of ["contest", "serie", "problem", "tests", "test"]) {
        const directory = join(REAL, variant);
        if (!existsSync(directory)) continue;

        const entries = {};
        for (const name of read(directory)) entries[name] = new Uint8Array(readFileSync(join(directory, name)));

        if (!entries["contest.xml"] && !entries["serie.xml"] && !entries["problem.xml"]) {
            ok(`${variant}/ carries no descriptor this reads, which is what the format says`);
            continue;
        }

        try {
            const real = await convertArchive(entries);
            check(real.contents.bundle.problems.length > 0,
                `${variant}/ converts (${real.contents.bundle.problems.length} problem(s), ${real.lost.length} reported)`);
        } catch (e) {
            fail(`${variant}/ did not convert: ${e.message}`);
        }
    }
}

// ── 11. Every message the converter can produce is translated ───────────────
//
// **`check:i18n` cannot see these.** It reads the literal `t("…")` form, and a
// loss travels as data — `t(loss.message, loss.values)` — so a missing key
// renders the English sentence on a Polish screen with nothing else noticing.
// That is the one defect `check:i18n` exists to catch, and this is the corner it
// structurally cannot reach.
//
// The same shape as `PackageIssue`, whose messages have the same hole. This
// closes it for the converter's; the builder's are still maintained by hand.

const source = ["src/exchange/zawodyweb/convert.ts"]
    .map(path => readFileSync(path, "utf8")).join("\n");
// No escaped quote appears in any of them, so a plain run of non-quotes is the
// whole pattern — and a message that ever needs one will trip the count below.
const messages = [...source.matchAll(/message: "([^"]*)"/g)].map(m => m[1]);

check(messages.length >= 10, `the converter's messages were found (${messages.length})`);

for (const language of ["en", "pl"]) {
    const table = JSON.parse(readFileSync(`public/locales/${language}/translation.json`, "utf8"));
    const missing = messages.filter(message => !(message in table));
    check(missing.length === 0,
        `every one is a key in ${language}${missing.length ? `: ${missing[0]}` : ""}`);
}

// ── 12. Both spellings of the namespace ─────────────────────────────────────
//
// `FORMAT.md` §3: *"the prefix does not matter. The default-namespace form and
// the prefixed form are equivalent; which one appears depends on the JAXB
// implementation."*
//
// **The five reference archives all use the default form**, so converting them
// proves nothing about the other — this was found by reading the format rather
// than by running the samples, and it is the reason those samples are not the
// fixture. Without `removeNSPrefix`, `<ns2:contest>` parses to the key
// `ns2:contest`, every lookup misses, and an export from one JAXB version
// converts while an export from another does not.

const prefixed = Object.fromEntries(Object.entries(contest).map(([name, bytes]) => {
    if (!name.endsWith(".xml")) return [name, bytes];
    const xml = new TextDecoder().decode(bytes)
        .replace(/xmlns="http:\/\/zawodyweb\.mat\.umk\.pl\/"/, 'xmlns:ns2="http://zawodyweb.mat.umk.pl/"')
        // Every element, opening and closing. **Look-ahead, not a captured
        // terminator**: `<contest xmlns=…>` carries attributes, so a pattern
        // ending at `>` rewrote only the bare tags — and the two comparisons
        // below then passed on a fixture nothing had changed. The assertion
        // above exists because they did.
        .replace(/<(\/?)([a-z]+)(?=[\s>/])/g, "<$1ns2:$2");
    return [name, encode(xml)];
}));

check(new TextDecoder().decode(prefixed["contest.xml"]).includes("<ns2:contest"),
    "the fixture really was rewritten into the prefixed form");

// Caught rather than allowed to end the run: a converter that cannot read this
// form should be one red line among the rest, not a stack trace where the
// remaining checks were going to be.
const strip = (b) => JSON.stringify({ ...b, exportedAt: null });
try {
    const either = await convertArchive(prefixed);
    check(strip(either.contents.bundle) === strip(bundle),
        "and it converts to the same bundle, element for element");
    check(either.lost.length === lost.length,
        `reporting the same losses (${either.lost.length} against ${lost.length})`);
} catch (e) {
    fail(`the prefixed form did not convert: ${e.message}`);
}

if (process.exitCode) console.error("\nZawodyWeb check failed");
else console.log("\nZawodyWeb check passed");
