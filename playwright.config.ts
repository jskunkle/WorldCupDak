import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  // The upstream API (worldcup26.ir) can take up to ~20s to respond,
  // especially under concurrent load. Set expect timeout accordingly.
  expect: { timeout: 30_000 },
  webServer: {
    command: "pnpm build && pnpm preview --port 4173",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  use: { baseURL: "http://localhost:4173" },
});
