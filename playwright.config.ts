import { defineConfig, devices } from "@playwright/test";
import { loadLocalEnv } from "./tests/support/local-supabase";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://localhost:${PORT}`;
const testEnv = loadLocalEnv();

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `npx next dev --port ${PORT}`,
    url: `${baseURL}/login`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      APP_URL: baseURL,
      NEXT_DIST_DIR: ".next-e2e",
      // Overrides .env.local, which may point at the hosted project.
      NEXT_PUBLIC_SUPABASE_URL: testEnv.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: testEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    },
  },
});
