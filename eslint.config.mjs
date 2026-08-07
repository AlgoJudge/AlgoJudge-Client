import js from "@eslint/js";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

// Flat configuration for ESLint 9. It replaces the legacy .eslintrc.cjs and
// keeps the same rule set: eslint:recommended, @typescript-eslint/recommended,
// react-hooks/recommended and the react-refresh component-export warning.
export default [
    {
        // `scripts/verify/out` holds what `npm run check:ui` leaves behind —
        // screenshots and a Chrome profile. The profile carries whole bundled
        // extensions, and linting somebody else's vendored JavaScript reported
        // an unused disable directive in it. `.gitignore` does not reach here.
        ignores: ["dist/**", "node_modules/**", "scripts/verify/out/**"],
    },
    {
        files: ["**/*.{ts,tsx}"],
        linterOptions: {
            reportUnusedDisableDirectives: true,
        },
        languageOptions: {
            parser: tsParser,
            ecmaVersion: "latest",
            sourceType: "module",
            parserOptions: {
                ecmaFeatures: { jsx: true },
            },
        },
        plugins: {
            "@typescript-eslint": tsPlugin,
            "react-hooks": reactHooks,
            "react-refresh": reactRefresh,
        },
        rules: {
            ...js.configs.recommended.rules,
            // Turns off the core rules that TypeScript already checks.
            ...tsPlugin.configs["eslint-recommended"].overrides[0].rules,
            ...tsPlugin.configs.recommended.rules,
            ...reactHooks.configs["recommended-latest"].rules,
            "react-refresh/only-export-components": [
                "warn",
                { allowConstantExport: true },
            ],
        },
    },
];
