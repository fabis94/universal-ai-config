import { defineTarget } from "../define-target.js";
import type { UniversalFrontmatter } from "../../types.js";

export default defineTarget({
  name: "copilot",
  outputDir: ".github",
  supportedTypes: ["instructions", "skills", "agents"],

  instructions: {
    frontmatterMap: {
      description: "description",
      globs: (value) => {
        // Copilot uses applyTo as a comma-joined string
        const globs = Array.isArray(value) ? value : [value];
        return { applyTo: globs.join(", ") };
      },
      alwaysApply: () => {
        // Handled by getOutputPath — alwaysApply templates go to copilot-instructions.md
        return {};
      },
      excludeAgent: "excludeAgent",
    },
    getOutputPath: (name: string, frontmatter: UniversalFrontmatter) => {
      if (frontmatter.alwaysApply) {
        return "copilot-instructions.md";
      }
      return `instructions/${name}.instructions.md`;
    },
  },

  skills: {
    frontmatterMap: {
      name: "name",
      description: "description",
      license: "license",
    },
    getOutputPath: (name) => `skills/${name}/SKILL.md`,
  },

  agents: {
    frontmatterMap: {
      name: "name",
      description: "description",
      model: "model",
      tools: "tools",
      target: "target",
      mcpServers: "mcp-servers",
      handoffs: "handoffs",
    },
    getOutputPath: (name) => `agents/${name}.agent.md`,
  },
});
