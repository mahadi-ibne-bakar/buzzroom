import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["**/node_modules/**", "**/dist/**", "**/build/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // The service worker runs in a worker scope, not a window, so the browser
    // globals it uses are unknown to the default config. Declared explicitly
    // rather than pulling in the `globals` package for one file.
    files: ["**/public/sw.js"],
    languageOptions: {
      globals: {
        self: "readonly",
        caches: "readonly",
        fetch: "readonly",
        Response: "readonly",
        URL: "readonly",
        Promise: "readonly",
      },
    },
  },
  {
    rules: {
      // Flag unused variables, but allow intentionally-unused function
      // arguments prefixed with an underscore (a common, readable
      // convention for "I have to accept this argument but don't need it").
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
    },
  },
);
