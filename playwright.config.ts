import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://localhost:${PORT}`;

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
      JIKAN_BASE_URL: "http://127.0.0.1:4010/v4",
      MAL_CLIENT_ID: "e2e-client-id",
      MAL_REDIRECT_URI: `${baseURL}/api/mal/callback`,
      MAL_AUTHORIZE_URL: "http://127.0.0.1:4010/mal/v1/oauth2/authorize",
      MAL_TOKEN_URL: "http://127.0.0.1:4010/mal/v1/oauth2/token",
      MAL_API_BASE_URL: "http://127.0.0.1:4010/mal/v2",
      WORKER_URL: "",
      NEXT_DIST_DIR: ".next-e2e",
    },
  },
});
