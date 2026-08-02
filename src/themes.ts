import {
  defaultVariantColorsResolver,
  VariantColorsResolver,
  parseThemeColor,
  rgba,
  darken,
} from "@mantine/core";

export const lightBorder: VariantColorsResolver = (input) => {
  const defaultResolvedColors = defaultVariantColorsResolver(input);
  const parsedColor = parseThemeColor({
    color: input.color || input.theme.primaryColor,
    theme: input.theme,
  });

  // Add new variants support
  if (input.variant === "light-border") {
    return {
      background: rgba(parsedColor.value, 0.1),
      hover: rgba(parsedColor.value, 0.15),
      border: `1px solid ${parsedColor.value}`,
      color: darken(parsedColor.value, 0.1),
    };
  }

  return defaultResolvedColors;
};