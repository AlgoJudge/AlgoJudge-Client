// The application icons, rasterised from the mark this repository already ships.
//
//     node scripts/make-icons.mjs
//
// **Committed output, kept reproducible.** The four PNGs under `public/` are in
// Git because `public/` is copied verbatim into the image and a manifest needs
// its icons at a stable URL — `src/assets/` is content-hashed and cannot be
// named by one. This script is committed beside them so the export can be
// repeated rather than remembered.
//
// **Playwright rather than a rasteriser.** It is already a devDependency, and
// the alternative was a new image dependency in a repository that keeps
// `npm audit` at zero. The browser is also the thing that will draw the mark
// everywhere else, so what comes out is what a user sees.
//
// Source: `src/assets/algojudge.svg`, recoloured to Mantine's `blue.6` — the
// same drawing in the same colour as the tab icon, so the mark is one mark
// wherever it is shown. The wordmark is hidden and only `#gavel` is framed: a
// home screen gives an icon a square, and 255x38 of wordmark in one is
// illegible.
//
// **Two of the four cannot be transparent, and that is the platforms talking.**
// iOS composites an `apple-touch-icon` onto black, so a transparent one arrives
// as a mark on a black tile. A maskable icon is cropped to whatever shape the
// launcher prefers and has to fill the square it was given. Both get white,
// which is also the manifest's `background_color` — so the splash screen and
// the icon stand on the same ground. The two `any` icons keep their
// transparency.
//
// Sizes, and why each exists:
//   icon-192.png          192  any       the installability floor
//   icon-512.png          512  any       splash screens and app listings
//   icon-512-maskable.png 512  maskable  28% safe-zone margin, so a launcher
//                                        may crop it to a circle and keep the mark
//   apple-touch-icon.png  180  -         iOS, which reads no manifest icon
//
// Written 2026-09-09.
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const MARK = "#228be6";

// `ground: null` is a transparent icon. See the header for the two that may not
// have one.
const ICONS = [
    { file: "icon-192.png", size: 192, margin: 0.12, ground: null },
    { file: "icon-512.png", size: 512, margin: 0.12, ground: null },
    // The safe zone a maskable icon must keep clear: a launcher may crop to a
    // circle inscribed in the square, which takes the corners with it.
    { file: "icon-512-maskable.png", size: 512, margin: 0.28, ground: "#ffffff" },
    { file: "apple-touch-icon.png", size: 180, margin: 0.12, ground: "#ffffff" },
];

const svg = readFileSync(join(root, "src/assets/algojudge.svg"), "utf8")
    .replace('fill="#000000"', 'fill="' + MARK + '"');

const browser = await chromium.launch();
const page = await browser.newPage();

for (const icon of ICONS) {
    await page.setViewportSize({ width: icon.size, height: icon.size });
    await page.setContent(
        "<style>html,body{margin:0;padding:0;"
        + (icon.ground ? "background:" + icon.ground + ";" : "")
        + "}svg{display:block;width:100%;height:100%;}</style>" + svg);

    // The frame, computed rather than typed. `getBBox` on the group would
    // answer in its own user space and miss its `rotate(30)`, so the rectangle
    // is measured on screen and mapped back into viewBox units.
    await page.evaluate(({ margin }) => {
        const root = document.querySelector("svg");
        const text = document.getElementById("text");
        if (text) text.style.display = "none";

        const box = document.getElementById("gavel").getBoundingClientRect();
        const frame = root.getBoundingClientRect();
        const view = root.viewBox.baseVal;

        const toUser = (px, axis) => axis === "x"
            ? view.x + (px - frame.left) / frame.width * view.width
            : view.y + (px - frame.top) / frame.height * view.height;

        const left = toUser(box.left, "x");
        const top = toUser(box.top, "y");
        const width = box.width / frame.width * view.width;
        const height = box.height / frame.height * view.height;

        // Square, centred, with the margin outside the mark on every side.
        const side = Math.max(width, height) * (1 + 2 * margin);
        const x = left + width / 2 - side / 2;
        const y = top + height / 2 - side / 2;

        root.setAttribute("viewBox", [x, y, side, side].join(" "));
        root.setAttribute("preserveAspectRatio", "xMidYMid meet");
        return true;
    }, { margin: icon.margin });

    await page.screenshot({
        path: join(root, "public", icon.file),
        omitBackground: icon.ground === null,
    });
    console.log(icon.file + "  " + icon.size + "x" + icon.size
        + "  " + (icon.ground ?? "transparent"));
}

await browser.close();
