import { booleanField, checkMatcherToolNames } from "../mappers.js";
import { defineTarget, type TargetContext } from "../define-target.js";
import type { UniversalHookHandler, UniversalMCPServer } from "../../types.js";
import { normalizeGlobs } from "../../core/normalize-globs.js";
import { flattenCommand } from "../../core/shell.js";

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
  workspaceOpen: "workspaceOpen",
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

/** Events whose matcher is a tool name. */
const TOOL_EVENTS = new Set(["preToolUse", "postToolUse", "postToolUseFailure"]);

/** Claude tool names → Cursor's tool names (as Cursor's own Claude-hook importer maps them). */
const CURSOR_TOOL_NAMES: Record<string, string> = {
  Bash: "Shell",
  Edit: "Write",
  WebFetch: "Fetch",
};

function transformCursorHooks(
  hooks: Record<string, UniversalHookHandler[]>,
  { report }: TargetContext,
): Record<string, unknown> {
  const result: Record<string, unknown[]> = {};

  for (const [event, handlers] of Object.entries(hooks)) {
    const cursorEvent = EVENT_NAME_MAP[event];
    if (!cursorEvent) continue;

    result[cursorEvent] = handlers.map((h) => {
      if (TOOL_EVENTS.has(event)) {
        checkMatcherToolNames("Cursor", event, h.matcher, CURSOR_TOOL_NAMES, report);
      }
      const handlerType = h.type ?? "command";
      const entry: Record<string, unknown> = { type: handlerType };
      // Cursor has no args array — fold args into the command string
      if (h.command !== undefined) entry.command = flattenCommand(h.command, h.args);
      if (h.prompt !== undefined) entry.prompt = h.prompt;
      if (h.model !== undefined) entry.model = h.model;
      if (h.matcher) entry.matcher = h.matcher;
      if (h.timeout !== undefined) entry.timeout = h.timeout;
      if (h.loopLimit !== undefined) entry.loop_limit = h.loopLimit;
      if (h.failClosed !== undefined) entry.failClosed = h.failClosed;
      return entry;
    });
  }

  return { version: 1, hooks: result };
}

function transformCursorMCP(servers: Record<string, UniversalMCPServer>): Record<string, unknown> {
  const mcpServers: Record<string, unknown> = {};
  for (const [name, server] of Object.entries(servers)) {
    const entry: Record<string, unknown> = {};
    // Cursor documents `type` as required for stdio servers
    if (server.type !== undefined) entry.type = server.type;
    else if (server.command !== undefined) entry.type = "stdio";
    if (server.command !== undefined) entry.command = server.command;
    if (server.args !== undefined) entry.args = server.args;
    if (server.env !== undefined) entry.env = server.env;
    if (server.url !== undefined) entry.url = server.url;
    if (server.headers !== undefined) entry.headers = server.headers;
    if (server.envFile !== undefined) entry.envFile = server.envFile;
    // Cursor's auth is an OAuth object; a string is Codex's auth mode
    if (server.auth !== undefined && typeof server.auth === "object") entry.auth = server.auth;
    mcpServers[name] = entry;
  }
  return { mcpServers };
}

export default defineTarget({
  name: "cursor",
  outputDir: ".cursor",
  supportedTypes: ["instructions", "skills", "agents", "hooks", "mcp"],
  reads: {
    instructions: [
      {
        from: "agentsMd",
        reconcile: "loads-both",
        loses:
          "glob-scoped and description-only (agent-decided) rules: they become always-on or folder-scoped",
      },
    ],
    hooks: [
      {
        // Cursor imports these Claude events from .claude/settings.json (when
        // any group has a matcher key) and skips commands identical to its own
        from: "claude",
        reconcile: "dedupes-identical",
        events: [
          "preToolUse",
          "postToolUse",
          "userPromptSubmit",
          "stop",
          "subagentStop",
          "sessionStart",
          "sessionEnd",
          "preCompact",
        ],
        onlyWithMatcher: true,
        loses: "nothing: Cursor keeps its own hooks.json (with loop_limit) next to Claude's",
      },
    ],
    skills: [
      {
        from: "claude",
        reconcile: "prefers-own",
        loses: "nothing: Cursor shows its own copy of a skill both targets generate",
      },
    ],
    agents: [
      {
        from: "claude",
        reconcile: "prefers-own",
        loses: "nothing: Cursor's .cursor/agents copy wins over .claude/agents",
      },
    ],
  },

  instructions: {
    frontmatterMap: {
      description: "description",
      globs: (value) => {
        // Cursor uses globs as comma-separated string (no spaces)
        return { globs: normalizeGlobs(value).join(",") };
      },
      alwaysApply: "alwaysApply",
    },
    outputPath: (name, _fm, { outputDir }) => `${outputDir}/rules/${name}.mdc`,
    typeDir: ({ outputDir }) => `${outputDir}/rules`,
    ownedPaths: ({ outputDir }) => [`${outputDir}/rules`],
  },

  skills: {
    frontmatterMap: {
      name: "name",
      description: "description",
      disableAutoInvocation: "disable-model-invocation",
      license: "license",
      compatibility: "compatibility",
      metadata: "metadata",
      userInvocable: booleanField("user-invocable"),
      skillPaths: (value) => ({ paths: normalizeGlobs(value) }),
      icon: "icon",
      color: "color",
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
      readonly: "readonly",
      background: "is_background",
    },
    // Cursor reads agent files by splitting each line at the first `:`
    frontmatterStyle: "line-safe",
    outputPath: (name, _fm, { outputDir }) => `${outputDir}/agents/${name}.md`,
    typeDir: ({ outputDir }) => `${outputDir}/agents`,
    ownedPaths: ({ outputDir }) => [`${outputDir}/agents`],
  },

  hooks: {
    events: EVENT_NAME_MAP,
    handlerTypes: ["command", "prompt"],
    transform: transformCursorHooks,
    outputPath: ({ outputDir }) => `${outputDir}/hooks.json`,
  },

  mcp: {
    transform: transformCursorMCP,
    outputPath: () => ".cursor/mcp.json",
  },
});
