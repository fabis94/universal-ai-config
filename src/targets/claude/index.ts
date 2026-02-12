import { defineTarget } from "../define-target.js";
import type { UniversalHookHandler, UniversalMCPServer } from "../../types.js";
import { normalizeGlobs } from "../../core/normalize-globs.js";

// Claude uses PascalCase event names
const EVENT_NAME_MAP: Record<string, string> = {
  sessionStart: "SessionStart",
  sessionEnd: "SessionEnd",
  userPromptSubmit: "UserPromptSubmit",
  preToolUse: "PreToolUse",
  postToolUse: "PostToolUse",
  postToolUseFailure: "PostToolUseFailure",
  stop: "Stop",
  subagentStart: "SubagentStart",
  subagentStop: "SubagentStop",
  preCompact: "PreCompact",
  permissionRequest: "PermissionRequest",
  notification: "Notification",
};

function transformClaudeHooks(
  hooks: Record<string, UniversalHookHandler[]>,
): Record<string, unknown> {
  const result: Record<string, unknown[]> = {};

  for (const [event, handlers] of Object.entries(hooks)) {
    const claudeEvent = EVENT_NAME_MAP[event];
    if (!claudeEvent) continue;

    // Group handlers by matcher
    const groups = new Map<string, UniversalHookHandler[]>();
    for (const handler of handlers) {
      const key = handler.matcher ?? "";
      const existing = groups.get(key);
      if (existing) {
        existing.push(handler);
      } else {
        groups.set(key, [handler]);
      }
    }

    const matcherGroups = [];
    for (const [matcher, groupHandlers] of groups) {
      const hookEntries = groupHandlers.map((h) => {
        const entry: Record<string, unknown> = {
          type: "command",
          command: h.command,
        };
        if (h.timeout !== undefined) entry.timeout = h.timeout;
        return entry;
      });

      const group: Record<string, unknown> = { hooks: hookEntries };
      if (matcher) group.matcher = matcher;
      matcherGroups.push(group);
    }

    result[claudeEvent] = matcherGroups;
  }

  return { hooks: result };
}

function transformClaudeMCP(servers: Record<string, UniversalMCPServer>): Record<string, unknown> {
  const mcpServers: Record<string, unknown> = {};
  for (const [name, server] of Object.entries(servers)) {
    const entry: Record<string, unknown> = {};
    if (server.type !== undefined) entry.type = server.type;
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
  name: "claude",
  outputDir: ".claude",
  supportedTypes: ["instructions", "skills", "agents", "hooks", "mcp"],

  instructions: {
    frontmatterMap: {
      description: "description",
      globs: (value, fm) => {
        if (fm.alwaysApply) {
          // When alwaysApply is true, omit paths entirely
          return {};
        }
        // Claude expects YAML array for paths
        return { paths: normalizeGlobs(value) };
      },
      alwaysApply: () => {
        // Handled by globs mapper — alwaysApply means no paths field
        return {};
      },
    },
    getOutputPath: (name) => `rules/${name}.md`,
  },

  skills: {
    frontmatterMap: {
      name: "name",
      description: "description",
      disableAutoInvocation: "disable-model-invocation",
      userInvocable: "user-invocable",
      allowedTools: "allowed-tools",
      model: "model",
      subagentType: "agent",
      forkContext: (value) => (value ? { context: "fork" } : {}),
      argumentHint: "argument-hint",
      hooks: "hooks",
    },
    getOutputPath: (name) => `skills/${name}/SKILL.md`,
  },

  agents: {
    frontmatterMap: {
      name: "name",
      description: "description",
      model: "model",
      tools: "tools",
      disallowedTools: "disallowedTools",
      permissionMode: "permissionMode",
      skills: "skills",
      hooks: "hooks",
      memory: "memory",
    },
    getOutputPath: (name) => `agents/${name}.md`,
  },

  hooks: {
    transform: transformClaudeHooks,
    outputPath: "settings.json",
    mergeKey: "hooks",
  },

  mcp: {
    transform: transformClaudeMCP,
    outputPath: ".mcp.json",
  },
});
