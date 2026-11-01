import { defineConfig } from "@playwright/test";

/**
 * Browser tests against the local app (npm run dev on :5173) and the local
 * Supabase stack, using the data from `npm run e2e:prepare` (`npm run e2e`
 * runs it first).
 *
 * Files run in parallel (one worker each); tests inside a file run in order,
 * because they build on each other. Files must not change data another file
 * asserts on — see e2e/README.md.
 */
export default defineConfig({
  testDir: "./e2e/tests",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: Number(process.env.E2E_WORKERS ?? 5),
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.E2E_APP_URL ?? "http://localhost:5173",
    channel: "chrome", // the installed Google Chrome; no browser download needed
    locale: "de-DE",
    timezoneId: "Europe/Berlin",
    viewport: { width: 1440, height: 900 },
    actionTimeout: 5_000,
    navigationTimeout: 15_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173/login",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
