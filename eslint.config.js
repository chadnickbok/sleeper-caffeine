import eslint from "@eslint/js";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/out/**",
      "**/dist-electron/**",
      "node_modules/**",
      ".cache/**",
      "coverage/**",
      "eslint.config.js",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/only-throw-error": "error",
    },
  },
  {
    files: ["**/test/**/*.ts", "**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/require-await": "off",
    },
  },
  {
    files: ["**/*.tsx"],
    plugins: {
      "jsx-a11y": jsxA11y,
      "react-hooks": reactHooks,
    },
    rules: {
      ...jsxA11y.configs.recommended.rules,
      ...reactHooks.configs.flat.recommended.rules,
      // JSX callback props are plain functions; the rule cannot distinguish
      // them from object methods that depend on a receiver.
      "@typescript-eslint/unbound-method": "off",
      // Electron image sources are static CDN URLs, not user-authored alt text.
      "jsx-a11y/alt-text": "error",
    },
  },
  {
    files: ["apps/desktop/src/renderer/**/*.{ts,tsx}"],
    ignores: ["apps/desktop/src/renderer/api/caffeine-client.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "MemberExpression[object.name='window'][property.name='sleeperCaffeine']",
          message:
            "Use the typed caffeineClient/query layer instead of calling preload IPC directly.",
        },
      ],
    },
  },
);
