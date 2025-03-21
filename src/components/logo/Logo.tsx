import imageLight from '../../assets/algojudge.svg'
import imageDark from '../../assets/algojudge-dark.svg'
import { Image, useComputedColorScheme } from '@mantine/core';

function Logo(props: any) {
    const colorScheme = useComputedColorScheme();
    return (
        <Image src={colorScheme == 'dark' ? imageDark : imageLight} h="1em" w="auto" {...props} />
    )
}

export default Logo;
