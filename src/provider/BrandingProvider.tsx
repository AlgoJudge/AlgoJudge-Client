import { MantineProvider } from "@mantine/core";
import { FC, ReactNode, useMemo } from "react";
import { brandingVariables, buildTheme, fontFaces } from "../branding";
import { useInstance } from "./instanceContext";

/**
 * The Mantine provider, wearing the installation's colours.
 *
 * ## Why this sits below `InstanceProvider` rather than above everything
 *
 * `MantineProvider` used to be the outermost provider and the instance was
 * fetched four levels under it, so the theme it was handed could never depend on
 * the installation. Moving it below `ApiProvider` and `InstanceProvider` is what
 * makes branding possible at all, and it costs nothing: neither of those renders
 * a Mantine component — `ApiProvider` is a context and nine lines.
 *
 * It buys one thing beyond the obvious. `MaintenanceProvider` is now **inside**
 * the branded provider, so a Server that has withdrawn shows the operator's page
 * rather than ours.
 *
 * ## Why the theme object rather than a stylesheet of our own
 *
 * Mantine derives a great deal from a palette — the filled, light, outline and
 * hover variants of every shade, with their alphas — and it does that from the
 * theme. A block of CSS overriding the variables afterwards would have to
 * recompute all of it, and would be wrong in whichever place nobody checked.
 * Handing Mantine the theme means Mantine does the derivation.
 *
 * ## The faces
 *
 * `@font-face` has nowhere to live in a theme object, so it is a stylesheet.
 * Rendered rather than pushed into `document.head` by hand: React owns it, so it
 * goes when the instance stops declaring it, and there is no listener to leak.
 */
export const BrandingProvider: FC<{ children: ReactNode }> = ({ children }) => {
    const { instance } = useInstance();
    const branding = instance.theme;

    // Rebuilt only when the instance actually changes its theme. Mantine
    // regenerates every CSS variable from a new theme object, so handing it a
    // fresh one on each render would repaint the whole document on every
    // keystroke of every form.
    const theme = useMemo(() => buildTheme(branding), [branding]);
    const cssVariablesResolver = useMemo(() => brandingVariables(branding), [branding]);
    const faces = useMemo(() => fontFaces(branding), [branding]);

    return (
        <MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver}>
            {faces && <style>{faces}</style>}
            {children}
        </MantineProvider>
    );
};
