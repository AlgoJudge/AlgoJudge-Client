// The tab icon, drawn from the mark rather than exported by hand.
//
// **Committed output, kept reproducible.** `public/favicon.ico` is in Git
// because the file's *name* is its interface — everything that wants an icon
// without reading the document asks for that exact path — and because an icon
// is artwork: regenerating it should be a deliberate act with a visible diff.
// Run by hand, `node scripts/make-favicon.mjs`, never from `npm run build`.
//
// **Why the mark is blue and not black or white.** An `.ico` carries no media
// query, so one colour has to survive both tab strips. Measured against the two
// grounds a browser actually uses:
//
//   #228be6  on white   3.6:1     on Chrome's dark strip (#202124)  4.6:1
//   #000000  on white  21.0:1     on the same dark strip            1.1:1
//   #ffffff  on white   1.0:1     on the same dark strip           18.4:1
//
// White is what this file used to hold, and 1.0:1 is the reason it was asked
// about: a white gavel on a transparent ground is nothing at all on a light
// tab strip. Black is the mirror image of that fault. The blue is Mantine's
// primary — `blue.6`, the same value the application's own chrome uses.
//
// Four sizes, because a browser picks the nearest and scales what it gets: 16
// for the tab, 32 for the bookmark bar and most link previews, 48 for Windows
// shortcuts, 64 for a high-DPI tab. They are separate renders of the vector
// rather than one image downscaled — a 64 squeezed into 16 is mud.
import { writeFileSync, readFileSync } from "node:fs";

import { chromium } from "@playwright/test";

const SOURCE = "src/assets/algojudge.svg";
const OUT = "public/favicon.ico";
const COLOUR = "#228be6";
const SIZES = [16, 32, 48, 64];

// Room around the gavel so it is not flush with the edge at 16 px, in fractions
// of the mark's longer side.
const MARGIN = 0.06;

const svg = readFileSync(SOURCE, "utf8");

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 400 } });

// **The whole document, with the wordmark hidden**, rather than the gavel group
// lifted out of it: `#gavel` carries a rotation and its parent a translation, so
// an extracted group draws somewhere else entirely.
await page.setContent(`<!doctype html><style>html,body{margin:0;background:#fff}
  #text{display:none} svg{display:block}</style>${svg}`);

const box = await page.evaluate(() => {
    const root = document.querySelector("svg");
    const view = root.viewBox.baseVal;

    // Sized to the viewBox's own aspect ratio, so `preserveAspectRatio` has
    // nothing to letterbox and a client rect maps back by a single factor.
    root.setAttribute("width", String(view.width * 4));
    root.setAttribute("height", String(view.height * 4));

    const outer = root.getBoundingClientRect();
    const mark = document.querySelector("#gavel").getBoundingClientRect();
    const scale = view.width / outer.width;

    return {
        x: view.x + (mark.left - outer.left) * scale,
        y: view.y + (mark.top - outer.top) * scale,
        width: mark.width * scale,
        height: mark.height * scale,
    };
});

// Square, centred, with the margin — a viewBox that is not square would be
// letterboxed into the icon and the gavel would sit off to one side.
const side = Math.max(box.width, box.height) * (1 + MARGIN * 2);
const view = [
    box.x + box.width / 2 - side / 2,
    box.y + box.height / 2 - side / 2,
    side,
    side,
].map((n) => n.toFixed(4)).join(" ");

const images = [];
for (const size of SIZES) {
    const framed = svg
        .replace(/viewBox="[^"]*"/, `viewBox="${view}"`)
        .replace(/width="[\d.]+"\n\s*height="[\d.]+"/, `width="${size}" height="${size}"`)
        .replace(/fill="#000000"/, `fill="${COLOUR}"`);

    await page.setContent(`<!doctype html><style>html,body{margin:0}
      #text{display:none} svg{display:block}</style>${framed}`);

    images.push(await page.locator("svg").screenshot({ omitBackground: true }));
}

await browser.close();

// The ICO container: a six-byte header, one sixteen-byte entry per image, then
// the images themselves. **PNG rather than a DIB**, which every browser since
// Vista reads and which keeps the alpha channel without a second mask.
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(images.length, 4);

let offset = 6 + images.length * 16;
const entries = images.map((png, index) => {
    const entry = Buffer.alloc(16);
    // 0 means 256 here, which none of these are.
    entry.writeUInt8(SIZES[index], 0);
    entry.writeUInt8(SIZES[index], 1);
    entry.writeUInt8(0, 2);              // no colour palette
    entry.writeUInt8(0, 3);              // reserved
    entry.writeUInt16LE(1, 4);           // colour planes
    entry.writeUInt16LE(32, 6);          // bits per pixel
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    return entry;
});

writeFileSync(OUT, Buffer.concat([header, ...entries, ...images]));

console.log(`  ok   ${OUT}: ${SIZES.join(", ")} px in ${COLOUR}, ${offset} bytes`);
console.log(`  ---  from ${SOURCE}, viewBox ${view}`);
