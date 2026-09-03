import { defineConfig } from "vitest/config";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      // In the test environment, resolve @buzzroom/shared to its TypeScript
      // source directly. Without this, vitest would follow the npm workspace
      // symlink and then the package.json exports field, which works too,
      // but the explicit alias makes resolution unambiguous and fast.
      "@buzzroom/shared": resolve(__dirname, "../shared/src/index.ts"),
    },
  },
  test: {
    // Socket tests involve real async I/O — be generous with timeouts
    // so a slow CI runner doesn't cause false failures.
    testTimeout: 10_000,
    hookTimeout: 10_000,
  },
});
