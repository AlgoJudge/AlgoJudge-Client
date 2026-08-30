import {
    CSSVariablesResolver, MantineColorsTuple, MantineThemeOverride, mergeThemeOverrides,
    virtualColor,
} from "@mantine/core";
import { generateColors, generateColorsMap } from "@mantine/colors-generator";
import { InstanceTheme, ThemeColours } from "./api/CoreApi";
import { theme as testIds } from "./theme";

/**
 * An installation's own colours and typeface, turned into a Mantine theme.
 *
 * ## Absent means untouched, and that is the whole safety argument
 *
 * Nothing here writes a default. A key the installation did not set produces
 * **no variable at all**, so `buildTheme(undefined)` is byte for byte the theme
 * that was on screen before any of this existed — not a table of values that
 * happen to match it today and drift from Mantine's tomorrow. The shell's own
 * CSS carries the old value as a `var(--aj-…, <what it always was>)` fallback
 * for the same reason.
 *
 * ## Where each token lands
 *
 * Four brand colours, each generating the ten shades Mantine wants — which is
 * why one field reaches a pale tile (`-0`), a rule (`-6`) and dark text on it
 * (`-9`). Five surface and text tokens onto Mantine's own semantic variables.
 * Six shell tokens onto `--aj-*`, because the navigation and the header have no
 * Mantine variable of their own and were hard-wired to `blue` until this. The
 * hover and quiet steps beside them are blended from the values that were set,
 * so an operator states four colours and the ladder follows.
 *
 * **`surface` is `--mantine-color-body`, not `--mantine-color-default`.** Read
 * in Mantine's stylesheet rather than assumed: `Paper` — and so every `Card`,
 * `Modal` panel and the rest — draws its background from `--mantine-color-body`,
 * which is also what the `body` element uses. So the two are one variable there,
 * and an installation wanting a page ground that differs from its panels needs a
 * second one: `--aj-page-bg`, applied to `body` in `index.css`.
 *
 * ## What is deliberately not configurable
 *
 * Radius, spacing, shadow and font size: those are the product's, and a palette
 * and a typeface is a promise that can be kept legible where arbitrary CSS
 * cannot. The status colours — `red`, `orange`, `teal`, `green`, `yellow`,
 * `grape` — stay ours too, and that is a decision rather than an oversight: a
 * green *wrong answer* is a defect, not a preference, and no validation could
 * catch it because every hex is formally valid.
 */

/** Mantine's own default primary, and so what an unset `primary` must stay. */
const MANTINE_PRIMARY = "blue";

/**
 * What a named face falls back to. Mantine's own default stack, restated: a
 * theme naming a family whose file has not loaded yet must not land on Times.
 */
const FALLBACK_STACK =
    "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif";

type Colours = Record<string, MantineColorsTuple>;

/**
 * The theme the provider is given: the test ids, plus whatever the installation
 * set. One call, so a screen never sees a theme that has one half and not the
 * other.
 */
export function buildTheme(branding: InstanceTheme | undefined): MantineThemeOverride {
    return mergeThemeOverrides(testIds, brandOverride(branding));
}

function brandOverride(branding: InstanceTheme | undefined): MantineThemeOverride {
    if (!branding) return {};

    const light = branding.light ?? {};
    const dark = branding.dark ?? {};
    const colors: Colours = {};

    // `primary` falls back to Mantine's blue in the scheme that did not state
    // one, because that is what the screens looked like. The other three have no
    // yesterday to fall back to, so a scheme with no value of its own borrows the
    // one that was stated rather than inventing a second colour.
    const primary = brand(colors, "primary", light.primary, dark.primary, MANTINE_PRIMARY);

    // **The shade the operator's own colour landed on.** A ramp is generated
    // *around* a colour, so the value they typed is rarely index 6 — and index 6
    // is what Mantine paints a button with. Without this, an installation that
    // sets `#0050aa` gets buttons in a lighter blue it never chose, which is not
    // a theme so much as a suggestion. Each scheme keeps its own, because the
    // two colours land in different places.
    const primaryShade = {
        light: shadeOf(light.primary) ?? 6,
        dark: shadeOf(dark.primary) ?? 8,
    };

    const family = quoted(branding.fontFamily);
    const headings = quoted(branding.fontFamilyHeadings);

    // A `Divider` with no colour of its own draws the instance's second brand
    // colour. It is a rule and carries no text, so it is somewhere a second
    // colour can land without a contrast question attached.
    const secondary = brand(colors, "secondary", light.secondary, dark.secondary);
    brand(colors, "accent", light.accent, dark.accent);

    return {
        ...(Object.keys(colors).length > 0 ? { colors } : {}),
        ...(primary ? { primaryColor: primary, primaryShade } : {}),
        ...(secondary ? { components: { Divider: { defaultProps: { color: secondary } } } } : {}),
        ...(family ? { fontFamily: family } : {}),
        ...(headings ? { headings: { fontFamily: headings } } : {}),
    };
}

/** Where in its own generated ramp a colour sits. Mantine's default otherwise. */
function shadeOf(hex: string | undefined): 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | undefined {
    if (!hex) return undefined;
    const index = generateColorsMap(hex).baseColorIndex;
    return index >= 0 && index <= 9
        ? index as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9
        : undefined;
}

/**
 * Registers one brand colour as a pair of ramps and a virtual colour over them.
 *
 * A virtual colour is Mantine's own way of saying "this name means that ramp in
 * the light scheme and this one in the dark". Two ramps rather than one because
 * both schemes are stated in full — a dark scheme worked out from a light one
 * fails a contrast floor unpredictably, and `verify-theme.mjs` asserts one.
 */
function brand(
    colors: Colours,
    name: string,
    lightHex: string | undefined,
    darkHex: string | undefined,
    fallback?: string,
): string | undefined {
    if (!lightHex && !darkHex) return undefined;

    // A scheme with no value of its own borrows the other's, unless the caller
    // named what the product already used there.
    const forLight = lightHex ?? (fallback ? undefined : darkHex);
    const forDark = darkHex ?? (fallback ? undefined : lightHex);

    if (forLight) colors[`${name}Light`] = generateColors(forLight);
    if (forDark) colors[`${name}Dark`] = generateColors(forDark);

    colors[name] = virtualColor({
        name,
        light: forLight ? `${name}Light` : fallback!,
        dark: forDark ? `${name}Dark` : fallback!,
    });

    return name;
}

/**
 * The variables the shell and Mantine's own semantics read.
 *
 * Split by scheme, which is the whole reason this is a resolver rather than a
 * block of CSS: `light` and `dark` land under Mantine's own selectors, so
 * `light-dark()` and `[data-mantine-color-scheme]` keep agreeing with each
 * other. A key nobody set contributes nothing, and the CSS falls through to the
 * value it always had.
 */
export function brandingVariables(branding: InstanceTheme | undefined): CSSVariablesResolver {
    return () => ({
        variables: {},
        light: scheme(branding?.light, "#000000"),
        dark: scheme(branding?.dark, "#ffffff"),
    });
}

/**
 * @param contrast Black in the light scheme and white in the dark — the
 * direction Mantine's own `default-hover` moves in each, and what a surface is
 * stepped towards when the theme has named nothing better.
 */
function scheme(colours: ThemeColours | undefined, contrast: string): Record<string, string> {
    const set: Record<string, string> = {};
    if (!colours) return set;

    // **The theme's own text, where it has one.** Stepping a surface towards
    // plain black turns a white panel into a plain grey one, which is what the
    // first photographs of these themes showed: an installation whose brand is
    // blue got grey rows. Text is the colour that has to be legible on that
    // surface anyway, so moving towards it both separates the row and carries
    // the hue.
    const towards = colours.text ?? contrast;

    const put = (name: string, value: string | undefined) => {
        if (value) set[name] = value;
    };

    // Mantine's own semantics. `surface` is `--mantine-color-body` because that
    // is what `Paper` reads; the page ground is a variable of ours.
    put("--aj-page-bg", colours.body);
    put("--mantine-color-body", colours.surface);
    put("--mantine-color-default", colours.surface);
    put("--mantine-color-text", colours.text);
    put("--mantine-color-dimmed", colours.dimmed);
    put("--mantine-color-default-border", colours.border);
    put("--mantine-color-anchor", colours.link);

    if (colours.surface) {
        set["--mantine-color-default-hover"] = mix(colours.surface, 94, towards);

        // **The list rows, which Mantine has no variable for.** The activity list
        // and the problem list are the two screens a participant meets first, and
        // their rows are our own CSS on fixed palette shades — so a theme that
        // did not reach them left those two screens grey while everything around
        // them changed. It looked half-applied because it was.
        //
        // **Three steps away from the surface, never equal to it.** The working
        // area is the surface, so a row painted `surface` is a row nobody can
        // see — which is what happened the first time these were wired. 96, 92
        // and 88 per cent stand where `gray-0`, `gray-1` and `gray-2` stood
        // against white.
        set["--aj-row"] = mix(colours.surface, 96, towards);
        set["--aj-row-hover"] = mix(colours.surface, 92, towards);
        set["--aj-row-active"] = mix(colours.surface, 88, towards);
    }

    // The rows' own text, for the same reason: grey on somebody else's panel is
    // a contrast this side cannot answer for.
    put("--aj-text", colours.text);
    put("--aj-dimmed", colours.dimmed);

    // The shell. Four values are asked for and four more are blended from them,
    // so the states follow whatever the operator set and the form stays short.
    put("--aj-nav-bg", colours.navBackground);
    put("--aj-nav-text", colours.navText);
    put("--aj-nav-active-bg", colours.navActiveBackground);
    put("--aj-nav-active-text", colours.navActiveText);
    put("--aj-header-bg", colours.headerBackground);
    put("--aj-header-text", colours.headerText);
    // The public bar's rule follows the instance's border rather than asking for
    // one of its own: nobody has two opinions about a hairline.
    put("--aj-header-border", colours.border);

    if (colours.navBackground) {
        // Darker than the ground it sits on, as `blue-7` was against `blue-6`.
        set["--aj-nav-hover"] = mix(colours.navBackground, 88, "#000000");
    }

    // **The accent, and the one thing it is asked to do.** An accent is a small
    // highlight, so it lights a navigation entry under the pointer — which is
    // what the coloured bars it is borrowed from do — and nothing that carries
    // text of its own. A key that reaches nothing is a promise without cover;
    // a key that reaches a filled button is a contrast this side cannot answer
    // for, because the text on it is not the operator's to choose.
    put("--aj-nav-accent", colours.accent);
    // And the second brand colour, on rules. It draws no text either.
    put("--aj-secondary", colours.secondary);

    // The signed-out shell's foot is the navigation's bar in another place, so
    // it is the navigation's colours rather than a second pair of keys.
    put("--aj-footer-bg", colours.navBackground);
    put("--aj-footer-text", colours.navText);
    put("--aj-footer-border", colours.navBackground);

    if (colours.navBackground && colours.navText) {
        // The quiet steps: the icons, the document links at the foot of the
        // navigation, its divider and its scrollbar. All of them were tints of
        // the navigation's own blue, so all of them are the text colour let down
        // towards the ground it is on.
        set["--aj-nav-muted"] = mix(colours.navText, 72, colours.navBackground);
        set["--aj-nav-divider"] = mix(colours.navText, 40, colours.navBackground);
        set["--aj-nav-scrollbar"] = mix(colours.navText, 55, colours.navBackground);
    }

    if (colours.navBackground) {
        set["--aj-footer-hover"] = mix(colours.navBackground, 88, "#000000");
    }

    if (colours.navBackground && colours.navText) {
        // The documents at the foot were the *page's* quiet colour, which is
        // unreadable the moment the foot is a saturated bar.
        set["--aj-footer-muted"] = mix(colours.navText, 72, colours.navBackground);
    }

    return set;
}

/**
 * Whether a colour is dark enough that what sits on it should be drawn for a
 * dark ground.
 *
 * An instance colours its bars, so the foot of a page can be a saturated blue in
 * the **light** scheme — and a mark drawn for paper is then dark ink on dark
 * blue. The scheme cannot answer this; only the colour underneath can.
 */
export function isDarkGround(colour: string): boolean {
    const channel = (at: number) => {
        const value = parseInt(colour.slice(at, at + 2), 16) / 255;
        return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5) < 0.35;
}

/**
 * Blends two `#rrggbb` and answers a third.
 *
 * **Worked out here rather than left to `color-mix()`**, and that was measured
 * rather than preferred: a `color-mix()` in a background computes to
 * `color(srgb …)` in Chrome, not to `rgb(…)`, and the contrast probe in
 * `verify-theme.mjs` read `NaN` off it. Every variable this file emits is a
 * plain hex, so anything reading one back — a check, or somebody with the
 * inspector open — gets a colour it can compare.
 *
 * Both operands passed the Server's six-hexadecimal-digits rule, so there is
 * nothing here that can compose a value which is not a colour.
 */
function mix(colour: string, percent: number, towards: string): string {
    const channel = (at: number) => {
        const a = parseInt(colour.slice(at, at + 2), 16);
        const b = parseInt(towards.slice(at, at + 2), 16);
        return Math.round((a * percent + b * (100 - percent)) / 100)
            .toString(16).padStart(2, "0");
    };
    return `#${channel(1)}${channel(3)}${channel(5)}`;
}

/**
 * A family name, quoted, with the stack behind it.
 *
 * The name passed the Server's `[A-Za-z0-9 _-]` rule, so there is nothing in it
 * a quote could be escaped by — this composes a font stack rather than trusting
 * one.
 */
function quoted(family: string | undefined): string | undefined {
    return family ? `"${family}", ${FALLBACK_STACK}` : undefined;
}

/**
 * The `@font-face` rules for the faces an installation stored.
 *
 * Written as a stylesheet because there is nowhere else for an `@font-face` to
 * go: a theme object has no room for one. Every part of it is either a value the
 * Server validated or an address the Server built — the operator never writes a
 * URL, which is what keeps this from being a way to make somebody else's browser
 * fetch from anywhere.
 *
 * `swap` deliberately: text drawn in the fallback and then re-drawn is better
 * than a screen with no text on it while a face loads.
 */
export function fontFaces(branding: InstanceTheme | undefined): string {
    return (branding?.fonts ?? [])
        .map(face => [
            "@font-face {",
            `  font-family: "${face.family}";`,
            `  src: url("${face.url}") format("woff2");`,
            `  font-weight: ${face.weight};`,
            `  font-style: ${face.style};`,
            "  font-display: swap;",
            "}",
        ].join("\n"))
        .join("\n\n");
}
