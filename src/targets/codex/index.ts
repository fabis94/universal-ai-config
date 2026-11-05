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

/** Codex uses Claude-style PascalCase event names; the last three are Codex-only. */
const EVENT_NAME_MAP: Record<string, string> = {
  sessionStart: "SessionStart",
  sessionEnd: "SessionEnd",
  userPromptSubmit: "UserPromptSubmit",
  preToolUse: "PreToolUse",
  postToolUse: "PostToolUse",
  permissionRequest: "PermissionRequest",
  stop: "Stop",
  subagentStart: "SubagentStart",
  subagentStop: "SubagentStop",
  preCompact: "PreCompact",
  postCompact: "PostCompact",
  preModelRequest: "PreModelRequest",
  postModelRequest: "PostModelRequest",
  interrupt: "Interrupt",
};

/** Values Codex accepts for `model_reasoning_effort` (every Claude `effort` value is one). */
const CODEX_REASONING_EFFORT = new Set([
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "ultra",
]);

/** OAuth keys Codex has a `[mcp_servers.<id>.oauth]` field for. */
const CODEX_OAUTH_KEYS: Record<string, string> = {
  clientId: "client_id",
  clientSecret: "client_secret",
  callbackUrl: "callback_url",
  callbackPort: "callback_port",
};

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
  if (h.commandWindows !== undefined) entry.commandWindows = h.commandWindows;
  if (h.timeout !== undefined) entry.timeout = h.timeout;
  if (h.async !== undefined) entry.async = h.async;
  if (h.statusMessage !== undefined) entry.statusMessage = h.statusMessage;
  if (h.additionalContextLimit !== undefined) {
    entry.additionalContextLimit = h.additionalContextLimit;
  }
  return entry;
}

/**
 * `.codex/hooks.json`. Handlers keep their template order: Codex trusts each
 * hook by a hash tied to its position, so a reordering would make Codex ask
 * the user to re-trust every hook.
 */
function transformCodexHooks(
  hooks: Record<string, UniversalHookHandler[]>,
): Record<string, unknown> {
  const result: Record<string, unknown[]> = {};

  for (const [event, handlers] of Object.entries(hooks)) {
    const codexEvent = EVENT_NAME_MAP[event];
    if (!codexEvent) continue;

    // Group handlers by matcher (Codex accepts Claude's nested
    // `{ matcher?, hooks: [...] }` structure), keeping first-seen order.
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

/** Universal OAuth → Codex's `oauth` table; keys Codex lacks are reported. */
function codexOAuth(
  name: string,
  oauth: Record<string, unknown>,
  report: TargetContext["report"],
): Record<string, unknown> {
  const table: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(oauth)) {
    const codexKey = CODEX_OAUTH_KEYS[key];
    if (codexKey) {
      table[codexKey] = value;
      continue;
    }
    report({
      code: "unsupported",
      message: `mcp.${name}: oauth.${key} has no Codex equivalent; dropped`,
      detail: { kind: "field", name: `oauth.${key}` },
    });
  }
  return table;
}

function transformCodexMCP(
  servers: Record<string, UniversalMCPServer>,
  _inputs: unknown,
  { report }: TargetContext,
): Record<string, unknown> {
  const mcp_servers: Record<string, unknown> = {};
  for (const [name, server] of Object.entries(servers)) {
    const entry: Record<string, unknown> = {};
    // Direct passthrough (`type` is dropped: Codex infers it from command/url)
    if (server.command !== undefined) entry.command = server.command;
    if (server.args !== undefined) entry.args = server.args;
    if (server.env !== undefined) entry.env = server.env;
    if (server.url !== undefined) entry.url = server.url;
    if (server.cwd !== undefined) entry.cwd = server.cwd;
    // Names, or `{ name, source }` objects
    if (server.envVars !== undefined) entry.env_vars = server.envVars;
    if (server.enabled !== undefined) entry.enabled = server.enabled;
    if (server.required !== undefined) entry.required = server.required;
    if (server.enabledTools !== undefined) entry.enabled_tools = server.enabledTools;
    if (server.disabledTools !== undefined) entry.disabled_tools = server.disabledTools;
    if (server.bearerTokenEnvVar !== undefined) {
      entry.bearer_token_env_var = server.bearerTokenEnvVar;
    }
    if (server.envHttpHeaders !== undefined) entry.env_http_headers = server.envHttpHeaders;
    if (server.headers !== undefined) entry.http_headers = server.headers;
    if (server.headersHelper !== undefined) entry.http_headers_helper = server.headersHelper;
    if (server.startupTimeoutSec !== undefined) {
      entry.startup_timeout_sec = server.startupTimeoutSec;
    }
    if (server.startupTimeoutMs !== undefined) entry.startup_timeout_ms = server.startupTimeoutMs;
    if (server.toolTimeoutSec !== undefined) entry.tool_timeout_sec = server.toolTimeoutSec;
    if (server.oauthResource !== undefined) entry.oauth_resource = server.oauthResource;
    if (server.scopes !== undefined) entry.scopes = server.scopes;
    if (server.startupReadiness !== undefined) entry.startup_readiness = server.startupReadiness;
    if (server.supportsParallelToolCalls !== undefined) {
      entry.supports_parallel_tool_calls = server.supportsParallelToolCalls;
    }
    if (server.toolInputSchemaMaxBytes !== undefined) {
      entry.tool_input_schema_max_bytes = server.toolInputSchemaMaxBytes;
    }
    if (server.omitToolsFrom !== undefined) entry.omit_tools_from = server.omitToolsFrom;
    if (server.defaultToolsApprovalMode !== undefined) {
      entry.default_tools_approval_mode = server.defaultToolsApprovalMode;
    }
    if (server.toolSettings !== undefined) entry.tools = camelToSnakeKeys(server.toolSettings);
    if (server.identity !== undefined) entry.identity = camelToSnakeKeys(server.identity);

    if (server.environmentId !== undefined) {
      entry.environment_id = server.environmentId;
    } else if (server.experimentalEnvironment !== undefined) {
      entry.environment_id = server.experimentalEnvironment;
      report({
        code: "legacy-field",
        message: `mcp.${name}: experimentalEnvironment was renamed; use environmentId (written as environment_id)`,
        detail: { field: "experimentalEnvironment" },
      });
    }

    if (server.oauth !== undefined) {
      const oauth = codexOAuth(name, server.oauth, report);
      if (Object.keys(oauth).length > 0) entry.oauth = oauth;
    }

    // Codex's auth is a mode string ("oauth" or "chatgpt"); Cursor's is an object
    if (typeof server.auth === "string") {
      entry.auth = server.auth;
    } else if (server.auth !== undefined) {
      report({
        code: "unsupported",
        message: `mcp.${name}: auth dropped — Codex takes a mode string ("oauth" or "chatgpt"), not Cursor's object (use a per-target override)`,
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

    mcp_servers[name] = entry;
  }
  return { mcp_servers };
}

/**
 * SKILL.md with the Agent Skills spec fields, plus an `agents/openai.yaml`
 * sidecar for Codex-only settings. `version` and `author` aren't spec
 * fields, so they go under `metadata`.
 */
function renderCodexSkill({
  name,
  frontmatter: fm,
  body,
  outputPath,
}: RenderInput): RenderedFile[] {
  const metadata: Record<string, unknown> = { ...fm.metadata };
  if (fm.version !== undefined) metadata.version = fm.version;
  if (fm.author !== undefined) metadata.author = fm.author;
  const skillFm: Record<string, unknown> = {
    name: fm.name ?? name,
    description: fm.description,
    license: fm.license,
    compatibility: fm.compatibility,
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
  };
  const files: RenderedFile[] = [{ path: outputPath, content: renderMarkdown(skillFm, body) }];

  // agents/openai.yaml sidecar — emitted when any codex.* skill field or
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

/** Agent fields Codex can't take in a role file, and why. */
const DROPPED_AGENT_FIELDS = {
  tools: "Codex has no agent-level tool list (use per-MCP-server enabled_tools)",
  disallowedTools: "Codex has no agent-level denylist",
  permissionMode:
    "Codex agents inherit the parent session's sandbox and approvals; set sandbox_mode or default_permissions in .codex/config.toml",
  sandboxMode:
    "Codex ignores sandbox_mode in agent files (since 0.149) — agents inherit the parent session's sandbox; set it in .codex/config.toml",
  mcpServers:
    "Codex agents inherit the parent session's MCP servers; an agent file can't change them",
  skills: "Codex can't preload skills for an agent (agent files can only disable skills)",
} as const;

/**
 * A standalone `.codex/agents/<name>.toml` role file. Codex drops a role
 * that has an unknown key or a blank description or body, so those fields
 * are left out with a warning and an empty agent isn't written at all.
 */
function renderCodexAgent(
  { name, frontmatter: fm, body, sourcePath, outputPath }: RenderInput,
  { report }: TargetContext,
): RenderedFile[] {
  const description = fm.description?.trim() ?? "";
  const instructions = body.trim();
  if (description === "" || instructions === "") {
    const missing = description === "" ? "description" : "body";
    report({
      code: "unsupported",
      message: `agent "${name}": Codex rejects agents with ${missing === "description" ? "no description" : "an empty body"}; not generated`,
      source: sourcePath,
      detail: { kind: "field", name: missing },
    });
    return [];
  }

  const tomlObj: Record<string, unknown> = {
    name: fm.name ?? name,
    description,
    developer_instructions: instructions,
  };

  if (fm.model !== undefined) {
    tomlObj.model = fm.model;
    if (typeof fm.model === "string" && fm.model.startsWith("claude-")) {
      report({
        code: "suspicious-value",
        message: `agent "${name}": model "${fm.model}" looks Claude-shaped; use a per-target override for Codex (e.g. model: { codex: "gpt-6.1-sol", default: "..." })`,
        source: sourcePath,
        detail: { field: "model", value: fm.model },
      });
    }
  }

  if (fm.effort !== undefined) {
    if (CODEX_REASONING_EFFORT.has(fm.effort)) {
      tomlObj.model_reasoning_effort = fm.effort;
    } else {
      report({
        code: "unsupported",
        message: `agent "${name}": effort "${fm.effort}" isn't a Codex reasoning effort; dropped`,
        source: sourcePath,
        detail: { kind: "field", name: "effort" },
      });
    }
  }

  if (fm.nicknameCandidates !== undefined) tomlObj.nickname_candidates = fm.nicknameCandidates;

  // Codex-only agent keys
  const codex = fm.codex ?? {};
  if (codex.modelReasoningSummary !== undefined) {
    tomlObj.model_reasoning_summary = codex.modelReasoningSummary;
  }
  if (codex.modelVerbosity !== undefined) tomlObj.model_verbosity = codex.modelVerbosity;
  if (codex.personality !== undefined) tomlObj.personality = codex.personality;
  if (codex.serviceTier !== undefined) tomlObj.service_tier = codex.serviceTier;
  if (codex.skills !== undefined) tomlObj.skills = camelToSnakeKeys(codex.skills);

  for (const [field, why] of Object.entries(DROPPED_AGENT_FIELDS)) {
    if ((fm as Record<string, unknown>)[field] === undefined) continue;
    report({
      code: "unsupported",
      message: `agent "${name}": ${field} dropped — ${why}`,
      source: sourcePath,
      detail: { kind: "field", name: field },
    });
  }

  return [{ path: outputPath, content: stringifyToml(tomlObj) }];
}

export default defineTarget({
  name: "codex",
  label: "Codex",
  outputDir: ".codex",
  supportedTypes: ["instructions", "skills", "agents", "hooks", "mcp"],
  // .agents/skills/ is Codex's own skill folder
  readsAgentSkills: true,

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
