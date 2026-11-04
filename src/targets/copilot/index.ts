import { defineTarget, type TargetContext } from "../define-target.js";
import type {
  UniversalFrontmatter,
  UniversalHookHandler,
  UniversalMCPInput,
  UniversalMCPServer,
} from "../../types.js";
import { normalizeGlobs } from "../../core/normalize-globs.js";
import { flattenCommand } from "../../core/shell.js";

// Copilot uses camelCase but with some different event names
const EVENT_NAME_MAP: Record<string, string> = {
  sessionStart: "sessionStart",
  sessionEnd: "sessionEnd",
  userPromptSubmit: "userPromptSubmitted",
  preToolUse: "preToolUse",
  postToolUse: "postToolUse",
  errorOccurred: "errorOccurred",
};

/** Copilot runs prompt hooks only at session start. */
const PROMPT_HOOK_EVENTS = new Set(["sessionStart"]);

function transformCopilotHandler(h: UniversalHookHandler): Record<string, unknown> {
  const type = h.type ?? "command";
  const entry: Record<string, unknown> = { type };
  switch (type) {
    case "http":
      entry.url = h.url;
      if (h.headers !== undefined) entry.headers = h.headers;
      if (h.allowedEnvVars !== undefined) entry.allowedEnvVars = h.allowedEnvVars;
      break;
    case "prompt":
      entry.prompt = h.prompt;
      break;
    default:
      // Copilot has no args array — fold args into the command string
      entry.bash = flattenCommand(h.command ?? "", h.args);
  }
  if (h.timeout !== undefined) entry.timeoutSec = h.timeout;
  return entry;
}

function transformCopilotHooks(
  hooks: Record<string, UniversalHookHandler[]>,
  { report }: TargetContext,
): Record<string, unknown> {
  const result: Record<string, unknown[]> = {};

  for (const [event, handlers] of Object.entries(hooks)) {
    const copilotEvent = EVENT_NAME_MAP[event];
    if (!copilotEvent) continue;

    const entries: Record<string, unknown>[] = [];
    for (const h of handlers) {
      if (h.type === "prompt" && !PROMPT_HOOK_EVENTS.has(event)) {
        report({
          code: "unsupported",
          message: `${event}: Copilot runs "prompt" hook handlers only on sessionStart; dropping`,
          detail: { kind: "handler-type", name: "prompt" },
        });
        continue;
      }
      entries.push(transformCopilotHandler(h));
    }
    if (entries.length > 0) result[copilotEvent] = entries;
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
    if (server.sandboxEnabled !== undefined) entry.sandboxEnabled = server.sandboxEnabled;
    if (server.sandbox !== undefined) entry.sandbox = server.sandbox;
    if (server.dev !== undefined) entry.dev = server.dev;
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
      name: "name",
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
      disableAutoInvocation: "disable-model-invocation",
      userInvocable: "user-invocable",
      argumentHint: "argument-hint",
      compatibility: "compatibility",
      license: "license",
      metadata: "metadata",
      forkContext: (value) => (value ? { context: "fork" } : {}),
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
      argumentHint: "argument-hint",
      userInvocable: "user-invocable",
      disableAutoInvocation: "disable-model-invocation",
      subAgents: "agents",
      hooks: "hooks",
    },
    getOutputPath: (name) => `agents/${name}.agent.md`,
  },

  hooks: {
    handlerTypes: ["command", "http", "prompt"],
    transform: transformCopilotHooks,
    outputPath: "hooks/hooks.json",
  },

  mcp: {
    transform: transformCopilotMCP,
    outputPath: ".vscode/mcp.json",
  },
});
