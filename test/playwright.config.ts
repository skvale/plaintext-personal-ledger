import { defineConfig } from "@playwright/test";

const ROOT = "/Users/kvale/dev2/plaintext-personal-ledger";

/**
 * add-return gets its own server and DATA_DIR: it appends real transactions and
 * rewrites main.journal, so it must not share a journal with the welcome suite,
 * which drives journal creation itself. It selects that server with
 * test.use({ baseURL }) rather than a `projects` entry, because welcome.spec.ts
 * derives its data dir from the project name and relies on the default "".
 *
 * reuseExistingServer is false on that server on purpose. With it on, a stray
 * server on the port gets reused silently — including a `pnpm dev` instance
 * pointed at the real data dir, which the tests would write into.
 */
export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  globalSetup: "./global-setup.ts",
  timeout: 60000,
  use: {
    baseURL: "http://localhost:3009",
  },
  webServer: [
    {
      command: `cd ${ROOT} && node build/index.js`,
      url: "http://localhost:3009",
      env: { PORT: "3009", DATA_DIR: `${ROOT}/test/data` },
      reuseExistingServer: true,
      timeout: 120000,
    },
    {
      // globalSetup seeds this dir, but Playwright boots webServer first, so the
      // directory has to exist before the process starts.
      command: `mkdir -p ${ROOT}/test/data/add-return && cd ${ROOT} && node build/index.js`,
      url: "http://localhost:3110",
      env: { PORT: "3110", DATA_DIR: `${ROOT}/test/data/add-return` },
      reuseExistingServer: false,
      timeout: 120000,
    },
  ],
});
