import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@buzzroom/shared": resolve(__dirname, "../shared/src/index.ts"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    testTimeout: 8_000,
  },
});
