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
    "src/api/fake/fixtures/content.ts",
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
