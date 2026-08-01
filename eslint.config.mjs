import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Flat ESLint config for the Next app + shared lib.
 *
 * The scraper is TypeScript under a separate tsconfig and is covered by `pnpm typecheck`
 * rather than by these React-oriented rules.
 */
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "dist/**",
    "node_modules/**",
    "lib/generated/**",
    "data/**",
    ".tmp/**",
    "scraper/**",
    "prisma/migrations/**",
  ]),
  {
    rules: {
      // Shared domain code is full of intentional underscores in math (XᵗX) and
      // unused destructure placeholders; noise, not bugs.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      // The finance panel and table recalculate on every slider tick by design.
      "react-hooks/exhaustive-deps": "warn",
    },
  },
]);
