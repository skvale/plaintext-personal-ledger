import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  timeout: 60000,
  use: {
    baseURL: "http://localhost:3009",
  },
  webServer: {
    command: "cd /Users/kvale/dev2/plaintext-personal-ledger && node build/index.js",
    url: "http://localhost:3009",
    env: { PORT: "3009", DATA_DIR: "/Users/kvale/dev2/plaintext-personal-ledger/test/data" },
    reuseExistingServer: true,
    timeout: 120000,
  },
});
