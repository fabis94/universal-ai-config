import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
        },
      },
      {
        // The built CLI in a real pseudo-terminal: see tests/e2e/terminal.ts
        test: {
          name: "e2e",
          include: ["tests/e2e/**/*.test.ts"],
          globalSetup: ["tests/e2e/build.ts"],
          testTimeout: 60_000,
        },
      },
    ],
  },
});
