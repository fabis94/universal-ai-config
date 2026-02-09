import { defineConfig } from "../../../src/config/schema.js";

export default defineConfig({
  exclude: {
    claude: ["instructions/skip-me.md", "hooks/skip.json"],
    copilot: ["agents/**"],
    default: [],
  },
});
