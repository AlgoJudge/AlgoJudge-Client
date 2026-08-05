// Exercises the statement format through the real validator and parser: every
// fixture must render, and every rule the format claims to enforce must refuse
// the document that breaks it. Run from the Client root after compiling
// src/content into ./.content-check.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = ".content-check";

execFileSync("npx", ["tsc",
    "src/content/types.ts", "src/content/latex.ts", "src/content/markdown.ts", "src/content/validate.ts",
    "src/api/fake/fixtures/content.ts", "src/api/fake/fixtures/instancePages.ts",
    "--outDir", OUT, "--rootDir", "src",
    "--module", "esnext", "--target", "es2022", "--moduleResolution", "bundler", "--skipLibCheck",
], { stdio: "inherit", shell: process.platform === "win32" });

// The application resolves extensionless imports through Vite; Node does not.
// Rewriting them here keeps the sources bundler-shaped and still runnable.
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

const { validateContent, tryValidateContent } = await import(`../${OUT}/content/validate.js`);
const { createMarkdown, toSegments } = await import(`../${OUT}/content/markdown.js`);
const fixtures = await import(`../${OUT}/api/fake/fixtures/content.js`);
const { instancePage } = await import(`../${OUT}/api/fake/fixtures/instancePages.js`);

const fail = (message) => { console.error("FAIL:", message); process.exitCode = 1; };
const ok = (message) => console.log("  ok  ", message);

const refuses = (label, source) => {
    const result = tryValidateContent(source);
    if ("error" in result) ok(`${label} → ${result.error.message}`);
    else fail(`${label} was accepted`);
};

// 1. Every fixture is a document the participant screens will actually receive.
for (const [name, value] of Object.entries(fixtures)) {
    if (typeof value !== "string") continue;
    try {
        validateContent(value);
        ok(`fixture ${name} validates`);
    } catch (error) {
        fail(`fixture ${name}: ${error.message}`);
    }
}

// 2. Raw HTML is escaped rather than passed through. This is the setting the
//    whole format rests on: a statement is written by a manager and rendered in
//    every participant's browser.
const md = createMarkdown();
const html = md.render("<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n");
if (/<(script|img|iframe|object)/.test(html)) fail(`raw HTML survived: ${html}`);
else if (!html.includes("&lt;script&gt;")) fail(`the tag was dropped instead of escaped: ${html}`);
else ok("raw HTML is escaped");

// 3. A sample is a pair, and the paragraph after it is its explanation.
const document = `---
version: 1
---

Tekst przed.

\`\`\`in
4 3
\`\`\`

\`\`\`out
TAK
\`\`\`

Wyjaśnienie przykładu.

Zwykły akapit.
`;
const segments = toSegments(md, validateContent(document).body, []);
const samples = segments.filter(s => s.kind === "sample");
if (samples.length !== 1) fail(`expected one sample, got ${samples.length}`);
else if (samples[0].input !== "4 3\n" || samples[0].output !== "TAK\n") fail("sample content differs");
else if (!samples[0].explanation?.includes("Wyjaśnienie")) fail("explanation was not attached");
else ok("sample pair and explanation");
if (segments.filter(s => s.kind === "html").length !== 2) fail("text around the sample was not kept as two runs");
else ok("text runs around the sample");

// 4. Each refusal the format promises.
const wrap = (body) => `---\nversion: 1\n---\n\n${body}\n`;
refuses("missing front matter", "Bez nagłówka.\n");
refuses("unknown version", "---\nversion: 99\n---\n\nTekst.\n");
refuses("in without out", wrap("```in\n4 3\n```\n\nTekst.\n"));
refuses("out without in", wrap("```out\nTAK\n```\n"));
refuses("LaTeX outside the subset", wrap("$\\newcommand{\\x}{1}$"));
refuses("external image", wrap("![a](https://example.com/a.png)"));
refuses("external link", wrap("[a](https://example.com)"));
refuses("path traversal", wrap("![a](../secret.png)"));
refuses("not a string", { version: 1, blocks: [] });
// The exact failure a screenshot named "Zrzut ekranu 2026-08-03 231251.png"
// produced: CommonMark ends a destination at the first space, so the reference
// never became an image and reached the reader as text.
refuses("image name with a space", wrap("![opis](moja grafika.png)"));

// And the form that works, which the editor now writes for such a name.
const bracketed = validateContent(wrap("![opis](<moja grafika.png>)"));
if (md.render(bracketed.body).includes("<img")) ok("a bracketed name is an image");
else fail("the angle-bracket form did not parse as an image");

// 4b. A name with a space survives the round trip: the editor writes the angle
//     bracket form, markdown-it percent-encodes it, and the renderer has to
//     decode it back to the file it names.
const { canEmbed, embedReference, linkReference, referenceName } = await import(`../${OUT}/content/reference.js`);
const spaced = "Zrzut ekranu 2026-08-03 231251.png";
const rendered = md.render(validateContent(wrap(embedReference(spaced))).body);
const src = /src="([^"]+)"/.exec(rendered)?.[1];
if (!src) fail("a bracketed name did not render as an image");
else if (referenceName(src) !== spaced) fail(`the name did not survive: ${referenceName(src)}`);
else ok("a name with spaces round-trips");

// 4c. The two forms are two different things, and both are legal for the same
//     file: `![…]` shows it, `[…]` points at it. The note beside the file list
//     says exactly this, so it has to stay true.
{
    const shown = md.render(validateContent(wrap(embedReference("tresc.pdf"))).body);
    const pointed = md.render(validateContent(wrap(linkReference("tresc.pdf"))).body);
    if (!/<img|<object/.test(shown)) fail("the embed form of a PDF did not render as an embed");
    else if (!/<a[^>]+href="tresc\.pdf"/.test(pointed)) fail("the link form of a PDF did not render as a link");
    else ok("a PDF can be embedded and linked, and the two differ");

    // A `.txt` has no rendering, so the editor must not offer to embed one.
    if (canEmbed("application/pdf") && canEmbed("image/png") && !canEmbed("text/plain") && !canEmbed("text/markdown")) {
        ok("only images and PDFs are offered as embeds");
    } else {
        fail("canEmbed admits a file that cannot be shown");
    }
}

// 4d. The front pages an instance ships with are documents like any other, and
//      an operator meets them before anything else. One that failed our own
//      validator would be a poor advertisement for the format they are being
//      asked to write in — and the only picture they may reference is the one
//      the screen supplies.
for (const kind of ["welcome", "home"]) {
    const page = instancePage(kind);
    let document;
    try {
        document = validateContent(page.content);
        ok(`the ${kind} page validates`);
    } catch (error) {
        fail(`the ${kind} page: ${error.message}`);
        continue;
    }

    const images = [];
    const collect = (tokens) => {
        for (const token of tokens) {
            if (token.type === "image") images.push(String(token.attrGet("src") ?? ""));
            if (token.children) collect(token.children);
        }
    };
    collect(md.parse(document.body, {}));
    if (images.length === 0) fail(`the ${kind} page shows no logo, so it never exercises the syntax`);
    else if (images.some(src => src !== "logo.svg")) fail(`the ${kind} page names a picture nobody supplies: ${images.join(", ")}`);
    else ok(`the ${kind} page shows the instance logo and nothing else`);
}

// 5. Extended syntax the format promises is actually parsed.
const extended = wrap("| a | b |\n|---|---|\n| 1 | 2 |\n\nTekst[^n] ~~skreślony~~.\n\n[^n]: Przypis.\n");
const extendedHtml = md.render(validateContent(extended).body);
for (const [what, needle] of [["table", "<table>"], ["footnote", "footnote-item"], ["strikethrough", "<s>"]]) {
    if (extendedHtml.includes(needle)) ok(`extended syntax: ${what}`);
    else fail(`extended syntax missing: ${what}`);
}

// 6. Mathematics reaches KaTeX rather than staying literal.
const maths = md.render(validateContent(wrap("$n \\le 10^5$\n\n$$\\sum_{i=1}^{n} i$$")).body);
if (maths.includes("katex")) ok("mathematics is rendered by KaTeX");
else fail("mathematics was not rendered");

if (!process.exitCode) console.log("\ncontent check passed");
