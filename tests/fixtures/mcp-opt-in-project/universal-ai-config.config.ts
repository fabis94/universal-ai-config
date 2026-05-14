import { defineConfig } from "../../../src/config/schema.js";

export default defineConfig({
  mcp: {
    forceOptIn: { claude: true, copilot: true, default: false },
    mcpServers: {
      claude: ["github", "playwright"],
      copilot: ["notion"],
      default: [],
    },
  },
});
