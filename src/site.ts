/**
 * The product's own informational website, which is not this application.
 *
 * `algojudge.pl` describes the software; an installation of it lives somewhere
 * else entirely and is the operator's, not the product's. Named once because two
 * places offer the link — the visitor's footer and the application's navigation
 * — and an address written twice is an address that will one day disagree.
 *
 * It had. `HomeHero.tsx` declared both of these for itself until 2026-09-10,
 * which is exactly what this file exists to stop.
 */
export const PROJECT_SITE = "https://algojudge.pl";

/**
 * Where the source lives.
 *
 * The one address here that a screen is not the only reader of: `index.html`
 * names both of these in the block a crawler without JavaScript reads, and it
 * cannot import — so `npm run check:seo` compares the two files instead.
 */
export const PROJECT_ORGANISATION = "https://github.com/AlgoJudge";
