/// <reference types="vitest/config" />
import { defineConfig } from "vite";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    include: ["tests/**/*.test.ts", "worker/**/*.test.ts"],
  },
});
