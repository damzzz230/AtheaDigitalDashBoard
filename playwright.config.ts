import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  outputDir: "test-results",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  timeout: 60_000,
  use: {
    baseURL: "http://localhost:5178",
    colorScheme: "dark",
    timezoneId: "Africa/Johannesburg",
    locale: "en-ZA",
  },
  webServer: {
    command: "npx vite --port 5178 --strictPort",
    url: "http://localhost:5178",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
