import { defineTarget } from "../define-target.js";
import type { UniversalHookHandler, UniversalMCPServer } from "../../types.js";
import { normalizeGlobs } from "../../core/normalize-globs.js";

// Cursor uses camelCase but with some different event names
const EVENT_NAME_MAP: Record<string, string> = {
  sessionStart: "sessionStart",
  sessionEnd: "sessionEnd",
  userPromptSubmit: "beforeSubmitPrompt",
  preToolUse: "preToolUse",
  postToolUse: "postToolUse",
  postToolUseFailure: "postToolUseFailure",
  stop: "stop",
  subagentStart: "subagentStart",
  subagentStop: "subagentStop",
  preCompact: "preCompact",
  // Cursor-specific events pass through as-is
  beforeShellExecution: "beforeShellExecution",
  afterShellExecution: "afterShellExecution",
  beforeMCPExecution: "beforeMCPExecution",
  afterMCPExecution: "afterMCPExecution",
  beforeReadFile: "beforeReadFile",
  afterFileEdit: "afterFileEdit",
  afterAgentResponse: "afterAgentResponse",
  afterAgentThought: "afterAgentThought",
  beforeTabFileRead: "beforeTabFileRead",
  afterTabFileEdit: "afterTabFileEdit",
};

function transformCursorHooks(
  hooks: Record<string, UniversalHookHandler[]>,
): Record<string, unknown> {
  const result: Record<string, unknown[]> = {};

  for (const [event, handlers] of Object.entries(hooks)) {
    const cursorEvent = EVENT_NAME_MAP[event];
    if (!cursorEvent) continue;

    result[cursorEvent] = handlers.map((h) => {
      const entry: Record<string, unknown> = {
        type: "command",
        command: h.command,
      };
      if (h.matcher) entry.matcher = h.matcher;
      if (h.timeout !== undefined) entry.timeout = h.timeout;
      return entry;
    });
  }

  return { version: 1, hooks: result };
}

function transformCursorMCP(servers: Record<string, UniversalMCPServer>): Record<string, unknown> {
  const mcpServers: Record<string, unknown> = {};
  for (const [name, server] of Object.entries(servers)) {
    const entry: Record<string, unknown> = {};
    // Cursor omits type — infers from command vs url
    if (server.command !== undefined) entry.command = server.command;
    if (server.args !== undefined) entry.args = server.args;
    if (server.env !== undefined) entry.env = server.env;
    if (server.url !== undefined) entry.url = server.url;
    if (server.headers !== undefined) entry.headers = server.headers;
    mcpServers[name] = entry;
  }
  return { mcpServers };
}

export default defineTarget({
  name: "cursor",
  outputDir: ".cursor",
  supportedTypes: ["instructions", "skills", "hooks", "mcp"],

  instructions: {
    frontmatterMap: {
      description: "description",
      globs: (value) => {
        // Cursor uses globs as comma-separated string (no spaces)
        return { globs: normalizeGlobs(value).join(",") };
      },
      alwaysApply: "alwaysApply",
    },
    getOutputPath: (name) => `rules/${name}.mdc`,
  },

  skills: {
    frontmatterMap: {
      name: "name",
      description: "description",
      disableAutoInvocation: "disable-model-invocation",
      license: "license",
      compatibility: "compatibility",
      metadata: "metadata",
    },
    getOutputPath: (name) => `skills/${name}/SKILL.md`,
  },

  // agents: not supported — cursor has no agent files

  hooks: {
    transform: transformCursorHooks,
    outputPath: "hooks.json",
  },

  mcp: {
    transform: transformCursorMCP,
    outputPath: ".cursor/mcp.json",
  },
});
