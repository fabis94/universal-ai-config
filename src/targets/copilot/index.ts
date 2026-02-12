import { defineTarget } from "../define-target.js";
import type {
  UniversalFrontmatter,
  UniversalHookHandler,
  UniversalMCPInput,
  UniversalMCPServer,
} from "../../types.js";
import { normalizeGlobs } from "../../core/normalize-globs.js";

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

function transformCopilotMCP(
  servers: Record<string, UniversalMCPServer>,
  inputs?: UniversalMCPInput[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [name, server] of Object.entries(servers)) {
    const entry: Record<string, unknown> = {};
    if (server.type !== undefined) entry.type = server.type;
    if (server.command !== undefined) entry.command = server.command;
    if (server.args !== undefined) entry.args = server.args;
    if (server.env !== undefined) entry.env = server.env;
    if (server.url !== undefined) entry.url = server.url;
    if (server.headers !== undefined) entry.headers = server.headers;
    if (server.envFile !== undefined) entry.envFile = server.envFile;
    result[name] = entry;
  }
  const output: Record<string, unknown> = { servers: result };
  if (inputs && inputs.length > 0) {
    output.inputs = inputs;
  }
  return output;
}

export default defineTarget({
  name: "copilot",
  outputDir: ".github",
  supportedTypes: ["instructions", "skills", "agents", "hooks", "mcp"],

  instructions: {
    frontmatterMap: {
      description: "description",
      globs: (value) => {
        // Copilot uses applyTo as a comma-separated string
        return { applyTo: normalizeGlobs(value).join(",") };
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

  mcp: {
    transform: transformCopilotMCP,
    outputPath: ".vscode/mcp.json",
  },
});
