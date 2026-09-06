import { Box, BoxProps, ElementProps, useComputedColorScheme } from '@mantine/core';
import markLight from '../../assets/algojudge-text.svg?raw';
import markDark from '../../assets/algojudge-text-dark.svg?raw';
import classes from './Logo.module.css';

/**
 * The product's mark.
 *
 * ## Inlined into the document, and that is the whole of why this file changed
 *
 * `algojudge-text.svg` carries the wordmark as a live `<text>` in Inter 600
 * rather than as outlines. An SVG referenced from `<img>` is rendered in a
 * document of its own and **cannot see the embedding page's `@font-face`** —
 * measured, not assumed: through an `<img>` it came out in a system fallback,
 * wider than its own viewBox, with the last letters clipped. Inlining is what
 * puts the mark inside the document that ships Inter.
 *
 * The cost is `dangerouslySetInnerHTML`, and it is safe here for the reason the
 * name warns about: the markup is a file in this repository, copied byte for
 * byte from `AlgoJudge-Assets`, never anything a person supplied. **Keeping it
 * a byte-for-byte copy is why it is injected rather than transcribed into JSX**
 * — a hand-written copy is a divergent variant that stops following the source.
 *
 * ## Two files rather than `currentColor`
 *
 * They differ only in fill, black against white, and that is how Assets ships
 * them. Rewriting the fill here would be the same divergence in a smaller
 * disguise.
 *
 * @param onDark Which ground this mark is being drawn on, when it is not the
 * colour scheme's own. An instance colours its bars, so the foot of a page can
 * be a saturated blue in the *light* scheme — and the mark drawn for paper is
 * then dark ink on dark blue. Absent means the scheme decides, which is what it
 * always did.
 */
function Logo({ onDark, ...props }: BoxProps & ElementProps<'div', keyof BoxProps> & { onDark?: boolean }) {
    const colorScheme = useComputedColorScheme();
    const dark = onDark ?? colorScheme === 'dark';
    return (
        <Box
            className={classes.mark}
            h="1em"
            role="img"
            aria-label="AlgoJudge"
            {...props}
            dangerouslySetInnerHTML={{ __html: dark ? markDark : markLight }}
        />
    );
}

export default Logo;
