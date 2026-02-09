import { defineConfig } from "../../../src/config/schema.js";

export default defineConfig({
  additionalTemplateDirs: ["shared-templates"],
  exclude: {
    claude: ["instructions/excluded-shared.md"],
    default: [],
  },
});
