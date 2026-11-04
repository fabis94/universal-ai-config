import { posix } from "node:path";
import { stringify as stringifyYAML } from "yaml";
import {
  defineTarget,
  type RenderedFile,
  type RenderInput,
  type TargetContext,
} from "../define-target.js";
import { renderMarkdown } from "../../core/generate/frontmatter.js";
import { flattenCommand } from "../../core/shell.js";
import { stringifyToml } from "../../core/toml.js";
import type { UniversalHookHandler, UniversalMCPServer } from "../../types.js";

/** Codex supports a strict subset of Claude's PascalCase hook events. */
const EVENT_NAME_MAP: Record<string, string> = {
  sessionStart: "SessionStart",
  userPromptSubmit: "UserPromptSubmit",
  preToolUse: "PreToolUse",
  postToolUse: "PostToolUse",
  permissionRequest: "PermissionRequest",
  stop: "Stop",
};

/** Codex `model_reasoning_effort` accepts these values. Claude `effort` overlaps for low/medium/high/xhigh. */
const CODEX_REASONING_EFFORT = new Set(["minimal", "low", "medium", "high", "xhigh"]);

function transformCodexHandler(h: UniversalHookHandler): Record<string, unknown> {
  if (h.type === "mcp_tool") {
    const entry: Record<string, unknown> = { type: "mcp_tool", server: h.server, tool: h.tool };
    if (h.input !== undefined) entry.input = h.input;
    if (h.timeout !== undefined) entry.timeout = h.timeout;
    if (h.statusMessage !== undefined) entry.statusMessage = h.statusMessage;
    return entry;
  }
  // Codex hooks take one `command` shell string, not `command` + `args`
  const entry: Record<string, unknown> = {
    type: "command",
    command: flattenCommand(h.command ?? "", h.args),
  };
  if (h.timeout !== undefined) entry.timeout = h.timeout;
  if (h.statusMessage !== undefined) entry.statusMessage = h.statusMessage;
  return entry;
}

function transformCodexHooks(
  hooks: Record<string, UniversalHookHandler[]>,
): Record<string, unknown> {
  const result: Record<string, unknown[]> = {};

  for (const [event, handlers] of Object.entries(hooks)) {
    const codexEvent = EVENT_NAME_MAP[event];
    if (!codexEvent) continue;

    // Group handlers by matcher (mirrors Claude's transform shape — Codex
    // accepts the same nested `{ matcher?, hooks: [...] }` structure).
    const groups = new Map<string, UniversalHookHandler[]>();
    for (const handler of handlers) {
      const key = handler.matcher ?? "";
      const existing = groups.get(key);
      if (existing) existing.push(handler);
      else groups.set(key, [handler]);
    }

    result[codexEvent] = [...groups].map(([matcher, groupHandlers]) => {
      const group: Record<string, unknown> = { hooks: groupHandlers.map(transformCodexHandler) };
      if (matcher) group.matcher = matcher;
      return group;
    });
  }

  return { hooks: result };
}

function transformCodexMCP(
  servers: Record<string, UniversalMCPServer>,
  _inputs: unknown,
  { report }: TargetContext,
): Record<string, unknown> {
  const mcp_servers: Record<string, unknown> = {};
  for (const [name, server] of Object.entries(servers)) {
    const entry: Record<string, unknown> = {};
    // Direct passthrough
    if (server.command !== undefined) entry.command = server.command;
    if (server.args !== undefined) entry.args = server.args;
    if (server.env !== undefined) entry.env = server.env;
    if (server.url !== undefined) entry.url = server.url;
    if (server.cwd !== undefined) entry.cwd = server.cwd;
    if (server.envVars !== undefined) entry.env_vars = server.envVars;
    if (server.enabled !== undefined) entry.enabled = server.enabled;
    if (server.required !== undefined) entry.required = server.required;
    if (server.enabledTools !== undefined) entry.enabled_tools = server.enabledTools;
    if (server.disabledTools !== undefined) entry.disabled_tools = server.disabledTools;
    if (server.bearerTokenEnvVar !== undefined)
      entry.bearer_token_env_var = server.bearerTokenEnvVar;
    if (server.envHttpHeaders !== undefined) entry.env_http_headers = server.envHttpHeaders;
    if (server.startupTimeoutSec !== undefined)
      entry.startup_timeout_sec = server.startupTimeoutSec;
    if (server.startupTimeoutMs !== undefined) entry.startup_timeout_ms = server.startupTimeoutMs;
    if (server.toolTimeoutSec !== undefined) entry.tool_timeout_sec = server.toolTimeoutSec;
    if (server.oauthResource !== undefined) entry.oauth_resource = server.oauthResource;
    if (server.scopes !== undefined) entry.scopes = server.scopes;
    if (server.experimentalEnvironment !== undefined)
      entry.experimental_environment = server.experimentalEnvironment;

    // Rename: universal `headers` → Codex `http_headers`
    if (server.headers !== undefined) entry.http_headers = server.headers;

    // Drop-with-warning: Codex auth model differs from Claude/Cursor OAuth
    if (server.oauth !== undefined) {
      report({
        code: "unsupported",
        message: `mcp.${name}: oauth dropped (use bearerTokenEnvVar + oauthResource + scopes)`,
        detail: { kind: "field", name: "oauth" },
      });
    }
    if (server.auth !== undefined) {
      report({
        code: "unsupported",
        message: `mcp.${name}: auth dropped (use bearerTokenEnvVar for Codex)`,
        detail: { kind: "field", name: "auth" },
      });
    }
    if (server.envFile !== undefined) {
      report({
        code: "unsupported",
        message: `mcp.${name}: envFile dropped (use envVars or env for Codex)`,
        detail: { kind: "field", name: "envFile" },
      });
    }
    // `type` is dropped silently — Codex infers transport from command vs url

    mcp_servers[name] = entry;
  }
  return { mcp_servers };
}

/** Convert a camelCase object's keys to snake_case (nested objects and arrays included). */
function camelToSnakeKeys(input: unknown): unknown {
  if (Array.isArray(input)) return input.map(camelToSnakeKeys);
  if (input === null || typeof input !== "object") return input;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const snakeKey = key.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
    result[snakeKey] = camelToSnakeKeys(value);
  }
  return result;
}

/** SKILL.md with the Agent Skills spec fields, plus an `agents/openai.yaml` sidecar for Codex-only settings. */
function renderCodexSkill({
  name,
  frontmatter: fm,
  body,
  outputPath,
}: RenderInput): RenderedFile[] {
  const skillFm: Record<string, unknown> = {
    name: fm.name ?? name,
    description: fm.description,
    version: fm.version,
    author: fm.author,
    license: fm.license,
    compatibility: fm.compatibility,
    metadata: fm.metadata,
  };
  const files: RenderedFile[] = [{ path: outputPath, content: renderMarkdown(skillFm, body) }];

  // agents/openai.yaml sidecar — emitted when any codex.* field or
  // disableAutoInvocation is set.
  const yamlObj: Record<string, unknown> = {};
  if (fm.codex?.interface) yamlObj.interface = camelToSnakeKeys(fm.codex.interface);
  if (fm.codex?.dependencies) yamlObj.dependencies = camelToSnakeKeys(fm.codex.dependencies);
  // disableAutoInvocation (inverted) → policy.allow_implicit_invocation
  if (fm.disableAutoInvocation !== undefined) {
    yamlObj.policy = { allow_implicit_invocation: !fm.disableAutoInvocation };
  }
  if (Object.keys(yamlObj).length > 0) {
    files.push({
      path: `${posix.dirname(outputPath)}/agents/openai.yaml`,
      content: stringifyYAML(yamlObj, {
        defaultStringType: "QUOTE_DOUBLE",
        defaultKeyType: "PLAIN",
        indent: 2,
      }),
    });
  }
  return files;
}

/** A standalone `.codex/agents/<name>.toml` role file. */
function renderCodexAgent(
  { name, frontmatter: fm, body, sourcePath, outputPath }: RenderInput,
  { report }: TargetContext,
): RenderedFile[] {
  const tomlObj: Record<string, unknown> = {
    name,
    description: fm.description ?? "",
    developer_instructions: body.trim(),
  };

  if (fm.model !== undefined) {
    tomlObj.model = fm.model;
    if (typeof fm.model === "string" && fm.model.startsWith("claude-")) {
      report({
        code: "suspicious-value",
        message: `agent "${name}": model "${fm.model}" looks Claude-shaped; use a per-target override for Codex (e.g. model: { codex: "gpt-5.4", default: "..." })`,
        source: sourcePath,
        detail: { field: "model", value: fm.model },
      });
    }
  }

  if (fm.sandboxMode !== undefined) tomlObj.sandbox_mode = fm.sandboxMode;

  // Auto-map effort → model_reasoning_effort when value is in the overlap set.
  if (fm.effort !== undefined) {
    if (CODEX_REASONING_EFFORT.has(fm.effort)) {
      tomlObj.model_reasoning_effort = fm.effort;
    } else {
      report({
        code: "unsupported",
        message: `agent "${name}": effort "${fm.effort}" has no Codex equivalent; dropped (use a per-target override for Codex)`,
        source: sourcePath,
        detail: { kind: "field", name: "effort" },
      });
    }
  }

  if (fm.nicknameCandidates !== undefined) tomlObj.nickname_candidates = fm.nicknameCandidates;
  if (fm.mcpServers !== undefined) tomlObj.mcp_servers = fm.mcpServers;
  if (fm.skills !== undefined) tomlObj["skills.config"] = fm.skills;

  // Drop-with-warning: fields with no clean Codex translation.
  if (fm.tools !== undefined) {
    report({
      code: "unsupported",
      message: `agent "${name}": "tools" dropped (Codex uses per-MCP-server enabled_tools, not agent-level)`,
      source: sourcePath,
      detail: { kind: "field", name: "tools" },
    });
  }
  if (fm.disallowedTools !== undefined) {
    report({
      code: "unsupported",
      message: `agent "${name}": disallowedTools dropped (Codex has no agent-level denylist)`,
      source: sourcePath,
      detail: { kind: "field", name: "disallowedTools" },
    });
  }
  if (fm.permissionMode !== undefined) {
    report({
      code: "unsupported",
      message: `agent "${name}": permissionMode dropped (use sandboxMode for Codex via per-target override)`,
      source: sourcePath,
      detail: { kind: "field", name: "permissionMode" },
    });
  }

  return [{ path: outputPath, content: stringifyToml(tomlObj) }];
}

export default defineTarget({
  name: "codex",
  outputDir: ".codex",
  supportedTypes: ["instructions", "skills", "agents", "hooks", "mcp"],

  // Codex reads only AGENTS.md: its instructions are the shared AGENTS.md output
  instructions: "agentsMd",

  skills: {
    frontmatterMap: {},
    // The open Agent Skills location, outside the Codex output dir
    outputPath: (name) => `.agents/skills/${name}/SKILL.md`,
    typeDir: () => ".agents/skills",
    ownedPaths: () => [".agents/skills"],
    render: renderCodexSkill,
  },

  agents: {
    frontmatterMap: {},
    outputPath: (name, _fm, { outputDir }) => `${outputDir}/agents/${name}.toml`,
    typeDir: ({ outputDir }) => `${outputDir}/agents`,
    ownedPaths: ({ outputDir }) => [`${outputDir}/agents`],
    render: renderCodexAgent,
  },

  hooks: {
    events: EVENT_NAME_MAP,
    handlerTypes: ["command", "mcp_tool"],
    transform: transformCodexHooks,
    outputPath: ({ outputDir }) => `${outputDir}/hooks.json`,
  },

  mcp: {
    transform: transformCodexMCP,
    outputPath: () => ".codex/config.toml",
    mergeKey: "mcp_servers",
    format: "toml",
  },
});
