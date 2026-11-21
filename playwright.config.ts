import { defineConfig } from "@playwright/test";
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
if (
  !process.env.TEST_DATABASE_URL ||
  new URL(process.env.TEST_DATABASE_URL).pathname != "/gym_test"
)
  throw new Error("Browser tests require isolated gym_test");
export default defineConfig({
  testDir: "tests/e2e",
  use: { baseURL: "http://127.0.0.1:3100" },
  webServer: {
    command:
      "node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100/sign-in",
    timeout:120000,
    reuseExistingServer: false,
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL,
      APP_URL: "http://127.0.0.1:3100",
      DEMO_MODE: "true",
      APP_ENV:"test",
      MAIL_TRANSPORT:"capture",
    },
  },
  workers: 1,
});
