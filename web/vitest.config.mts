import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/db/**/*.test.ts"],
    setupFiles: ["tests/setup-env.ts"],
    environment: "node",
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // DB tests share one database; run files one after another
    fileParallelism: false,
  },
});
