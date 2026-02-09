import type { ResolvedConfig } from "../types.js";

export const DEFAULT_CONFIG: ResolvedConfig = {
  templatesDir: ".universal-ai-config",
  targets: ["claude", "copilot", "cursor"],
  types: ["instructions", "skills", "agents", "hooks"],
  variables: {},
  outputDirs: {
    claude: ".claude",
    copilot: ".github",
    cursor: ".cursor",
  },
  exclude: [],
};
