import imageLight from '../../assets/algojudge.svg'
import imageDark from '../../assets/algojudge-dark.svg'
import { Image, ImageProps, useComputedColorScheme } from '@mantine/core';

/**
 * @param onDark Which ground this mark is being drawn on, when it is not the
 * colour scheme's own. An instance colours its bars, so the foot of a page can
 * be a saturated blue in the *light* scheme — and the mark drawn for paper is
 * then dark ink on dark blue. Absent means the scheme decides, which is what it
 * always did.
 */
function Logo({ onDark, ...props }: ImageProps & { onDark?: boolean }) {
    const colorScheme = useComputedColorScheme();
    const dark = onDark ?? colorScheme === 'dark';
    return (
        <Image src={dark ? imageDark : imageLight} h="1em" w="auto" {...props} />
    )
}

export default Logo;
