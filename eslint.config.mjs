import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import security from "eslint-plugin-security";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["**/*.{ts,tsx,js,mjs}"],
    plugins: { security },
    rules: {
      ...security.configs.recommended.rules,
      // The bcrypt-comparison call in token verification is a deliberate use
      // of bcrypt.compare which is constant-time; the rule's heuristic flags
      // any non-strict-equal comparison of secrets. Keep it on but expect
      // false positives in tests where we do raw equality checks.
      "security/detect-non-literal-regexp": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
