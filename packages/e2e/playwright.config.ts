import { defineConfig, devices } from "@playwright/test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const PORT = Number(process.env.E2E_PORT ?? 3401);
const baseURL = `http://127.0.0.1:${PORT}`;

/*
 * These specs drive the *production* build -- the bundled server serving the
 * built client on one origin -- rather than the Vite dev server. That is the
 * artifact that actually deploys, so the suite covers the bundling, the
 * static serving, the same-origin socket and the CSP alongside the app logic.
 *
 * Run `npm run build` first; `npm run test:e2e` from the repo root does both.
 */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Rooms are independent, so parallelism is safe. Capped because every test
  // opens two or three browser contexts holding live WebSockets.
  workers: process.env.CI ? 2 : 3,
  reporter: process.env.CI ? "github" : "list",
  timeout: 30_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL,
    trace: "on-first-retry",
    video: process.env.CI ? "retain-on-failure" : "off",
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  webServer: {
    command: "node packages/server/dist/index.js",
    cwd: repoRoot,
    url: `${baseURL}/health`,
    env: { PORT: String(PORT), NODE_ENV: "production" },
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
