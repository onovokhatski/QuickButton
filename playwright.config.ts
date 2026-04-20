import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 45000,
  expect: {
    timeout: 8000
  },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]]
});
