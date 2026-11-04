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
  setup: "Setup",
  userPromptExpansion: "UserPromptExpansion",
  permissionDenied: "PermissionDenied",
  postToolBatch: "PostToolBatch",
  stopFailure: "StopFailure",
  teammateIdle: "TeammateIdle",
  instructionsLoaded: "InstructionsLoaded",
  configChange: "ConfigChange",
  cwdChanged: "CwdChanged",
  fileChanged: "FileChanged",
  worktreeCreate: "WorktreeCreate",
  worktreeRemove: "WorktreeRemove",
  postCompact: "PostCompact",
  elicitation: "Elicitation",
  elicitationResult: "ElicitationResult",
  taskCreated: "TaskCreated",
  taskCompleted: "TaskCompleted",
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
        const handlerType = h.type ?? "command";
        const entry: Record<string, unknown> = { type: handlerType };
        if (h.command !== undefined) entry.command = h.command;
        if (h.args !== undefined) entry.args = h.args;
        if (h.url !== undefined) entry.url = h.url;
        if (h.headers !== undefined) entry.headers = h.headers;
        if (h.allowedEnvVars !== undefined) entry.allowedEnvVars = h.allowedEnvVars;
        if (h.server !== undefined) entry.server = h.server;
        if (h.tool !== undefined) entry.tool = h.tool;
        if (h.input !== undefined) entry.input = h.input;
        if (h.prompt !== undefined) entry.prompt = h.prompt;
        if (h.model !== undefined) entry.model = h.model;
        if (h.async !== undefined) entry.async = h.async;
        if (h.asyncRewake !== undefined) entry.asyncRewake = h.asyncRewake;
        if (h.shell !== undefined) entry.shell = h.shell;
        if (h.if !== undefined) entry.if = h.if;
        if (h.statusMessage !== undefined) entry.statusMessage = h.statusMessage;
        if (h.once !== undefined) entry.once = h.once;
        if (h.timeout !== undefined) entry.timeout = h.timeout;
        if (h.description !== undefined) entry.description = h.description;
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
    if (server.alwaysLoad !== undefined) entry.alwaysLoad = server.alwaysLoad;
    if (server.headersHelper !== undefined) entry.headersHelper = server.headersHelper;
    if (server.oauth !== undefined) entry.oauth = server.oauth;
    mcpServers[name] = entry;
  }
  return { mcpServers };
}

export default defineTarget({
  name: "claude",
  outputDir: ".claude",
  supportedTypes: ["instructions", "skills", "agents", "hooks", "mcp"],
  reads: {
    instructions: [
      {
        from: "agentsMd",
        reconcile: "loads-both",
        loses:
          "file-pattern scoping (`paths` globs); nested AGENTS.md files load only when Claude reads a file in that folder, and none load while a non-empty CLAUDE.md, .claude/CLAUDE.md or CLAUDE.local.md exists",
      },
    ],
  },

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
    outputPath: (name, _fm, { outputDir }) => `${outputDir}/rules/${name}.md`,
    typeDir: ({ outputDir }) => `${outputDir}/rules`,
    ownedPaths: ({ outputDir }) => [`${outputDir}/rules`],
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
      whenToUse: "when_to_use",
      arguments: "arguments",
      effort: "effort",
      skillPaths: "paths",
      skillShell: "shell",
    },
    outputPath: (name, _fm, { outputDir }) => `${outputDir}/skills/${name}/SKILL.md`,
    typeDir: ({ outputDir }) => `${outputDir}/skills`,
    ownedPaths: ({ outputDir }) => [`${outputDir}/skills`],
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
      maxTurns: "maxTurns",
      mcpServers: "mcpServers",
      background: "background",
      effort: "effort",
      isolation: "isolation",
      color: "color",
      initialPrompt: "initialPrompt",
    },
    // Cursor also reads `.claude/agents/` with a line-based parser
    frontmatterStyle: "line-safe",
    outputPath: (name, _fm, { outputDir }) => `${outputDir}/agents/${name}.md`,
    typeDir: ({ outputDir }) => `${outputDir}/agents`,
    ownedPaths: ({ outputDir }) => [`${outputDir}/agents`],
  },

  hooks: {
    events: EVENT_NAME_MAP,
    handlerTypes: ["command", "http", "mcp_tool", "prompt", "agent"],
    transform: transformClaudeHooks,
    outputPath: ({ outputDir }) => `${outputDir}/settings.json`,
    mergeKey: "hooks",
  },

  mcp: {
    transform: transformClaudeMCP,
    outputPath: () => ".mcp.json",
  },
});
