import { defineTarget } from "../define-target.js";
import type { UniversalFrontmatter, UniversalHookHandler } from "../../types.js";

// Copilot uses camelCase but with some different event names
const EVENT_NAME_MAP: Record<string, string> = {
  sessionStart: "sessionStart",
  sessionEnd: "sessionEnd",
  userPromptSubmit: "userPromptSubmitted",
  preToolUse: "preToolUse",
  postToolUse: "postToolUse",
  errorOccurred: "errorOccurred",
};

function transformCopilotHooks(
  hooks: Record<string, UniversalHookHandler[]>,
): Record<string, unknown> {
  const result: Record<string, unknown[]> = {};

  for (const [event, handlers] of Object.entries(hooks)) {
    const copilotEvent = EVENT_NAME_MAP[event];
    if (!copilotEvent) continue;

    result[copilotEvent] = handlers.map((h) => {
      const entry: Record<string, unknown> = {
        type: "command",
        bash: h.command,
      };
      if (h.timeout !== undefined) entry.timeoutSec = h.timeout;
      return entry;
    });
  }

  return { version: "1", hooks: result };
}

export default defineTarget({
  name: "copilot",
  outputDir: ".github",
  supportedTypes: ["instructions", "skills", "agents", "hooks"],

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
      compatibility: "compatibility",
      license: "license",
      metadata: "metadata",
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

  hooks: {
    transform: transformCopilotHooks,
    outputPath: "hooks/hooks.json",
  },
});
