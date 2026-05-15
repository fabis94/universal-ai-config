import { consola } from "consola";
import { stringify as stringifyYAML } from "yaml";
import { defineTarget, type ConsolidateInput } from "../define-target.js";
import { normalizeGlobs } from "../../core/normalize-globs.js";
import { stringifyToml } from "../../core/toml.js";
import type { GeneratedFile, UniversalHookHandler, UniversalMCPServer } from "../../types.js";

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

/**
 * POSIX shell-quote a single argument. Wraps in single quotes (preserves
 * everything literally) and escapes embedded single quotes via `'\''`.
 * No quoting applied to bare-word args that contain only safe characters.
 */
function shellQuote(s: string): string {
  if (/^[A-Za-z0-9_/@:%.,+=-]+$/.test(s)) return s;
  return `'${s.replace(/'/g, "'\\''")}'`;
}

/**
 * Codex hooks accept a single `command` shell string — not `command` + `args`
 * array. Flatten universal `command + args` into one shell-escaped string.
 */
function flattenCommand(command: string, args?: string[]): string {
  if (!args || args.length === 0) return command;
  return [command, ...args.map(shellQuote)].join(" ");
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
      // Codex only reliably runs `type: "command"` handlers. Drop anything
      // else with a warning so users know their handler isn't being emitted.
      const handlerType = handler.type ?? "command";
      if (handlerType !== "command") {
        consola.warn(
          `[codex] hook handler type "${handlerType}" not supported (only "command"); dropping`,
        );
        continue;
      }
      if (!handler.command) {
        consola.warn(`[codex] hook handler missing command; dropping`);
        continue;
      }
      const key = handler.matcher ?? "";
      const existing = groups.get(key);
      if (existing) {
        existing.push(handler);
      } else {
        groups.set(key, [handler]);
      }
    }

    const matcherGroups: Array<Record<string, unknown>> = [];
    for (const [matcher, groupHandlers] of groups) {
      const hookEntries = groupHandlers.map((h) => {
        // h.command is non-undefined here — the filter above drops handlers
        // with missing command before they reach the grouping step.
        const cmd = h.command ?? "";
        const entry: Record<string, unknown> = {
          type: "command",
          command: flattenCommand(cmd, h.args),
        };
        if (h.timeout !== undefined) entry.timeout = h.timeout;
        if (h.statusMessage !== undefined) entry.statusMessage = h.statusMessage;
        return entry;
      });

      const group: Record<string, unknown> = { hooks: hookEntries };
      if (matcher) group.matcher = matcher;
      matcherGroups.push(group);
    }

    if (matcherGroups.length > 0) {
      result[codexEvent] = matcherGroups;
    }
  }

  return { hooks: result };
}

function transformCodexMCP(servers: Record<string, UniversalMCPServer>): Record<string, unknown> {
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
      consola.warn(
        `[codex] mcp.${name}: oauth dropped (use bearerTokenEnvVar + oauthResource + scopes)`,
      );
    }
    if (server.auth !== undefined) {
      consola.warn(`[codex] mcp.${name}: auth dropped (use bearerTokenEnvVar for Codex)`);
    }
    if (server.envFile !== undefined) {
      consola.warn(`[codex] mcp.${name}: envFile dropped (use envVars or env for Codex)`);
    }
    // `type` is dropped silently — Codex infers transport from command vs url

    mcp_servers[name] = entry;
  }
  return { mcp_servers };
}

/**
 * Given a glob pattern, return the longest leading directory prefix with no
 * wildcard characters, or `null` if the glob starts with a wildcard segment.
 *
 * Examples:
 *   "packages/frontend/**" → "packages/frontend"
 *   "src/api/**\/*.ts"      → "src/api"
 *   "**\/*.ts"              → null
 *   "*.md"                  → null
 *   "plain.ts"              → null  (no wildcard at all → no directory scope)
 */
export function globRootDir(glob: string): string | null {
  const parts = glob.split("/");
  const wildIdx = parts.findIndex((p) => /[*?[]/.test(p));
  // No wildcard at all: treat as a single file path with no directory scope.
  if (wildIdx === -1) return null;
  // Wildcard in the first segment: no resolvable directory prefix.
  if (wildIdx === 0) return null;
  return parts.slice(0, wildIdx).join("/");
}

/** Render an instruction body with a `## description` H2 header. */
function renderInstructionSection(
  name: string,
  description: string | undefined,
  body: string,
): string {
  const heading = description?.trim() ?? name;
  return `## ${heading}\n\n${body.trim()}\n`;
}

/** Concatenate a bucket of instruction entries alpha-sorted into a single AGENTS.md/.override body. */
function renderBucket(entries: InstructionEntry[]): string {
  const sorted = [...entries].sort((a, b) => a.name.localeCompare(b.name));
  return sorted
    .map((e) => renderInstructionSection(e.name, e.description, e.body))
    .join("\n---\n\n");
}

interface InstructionEntry {
  name: string;
  description?: string | undefined;
  body: string;
  sourcePath: string;
}

function consolidateCodexInstructions({ templates }: ConsolidateInput): GeneratedFile[] {
  const files: GeneratedFile[] = [];
  const rootBucket: InstructionEntry[] = [];
  const overrideBuckets = new Map<string, InstructionEntry[]>();

  for (const t of templates) {
    const entry: InstructionEntry = {
      name: t.name,
      description: t.frontmatter.description,
      body: t.body,
      sourcePath: t.sourcePath,
    };

    // alwaysApply wins regardless of globs → root.
    if (t.frontmatter.alwaysApply) {
      rootBucket.push(entry);
      continue;
    }

    const globs = normalizeGlobs(t.frontmatter.globs);
    if (globs.length === 0) {
      // No globs and no alwaysApply → default to broadest scope (root).
      rootBucket.push(entry);
      continue;
    }

    // Determine which directories the globs resolve to. Leading-wildcard
    // globs (no resolvable directory) route to the root bucket so the
    // template still applies — uac never silently drops content.
    const dirs = new Set<string>();
    let hasLeadingWildcard = false;
    for (const g of globs) {
      const dir = globRootDir(g);
      if (dir === null) {
        hasLeadingWildcard = true;
      } else {
        dirs.add(dir);
      }
    }

    if (dirs.size === 0) {
      // All globs were leading-wildcard (or no resolvable dir) → root.
      rootBucket.push(entry);
      continue;
    }

    // Resolvable-dir globs: emit AGENTS.override.md per unique dir.
    // (If a template has both leading-wildcard AND resolvable-dir globs,
    // we route to the dir-specific files only — the resolvable dirs are
    // strictly narrower scope and Codex applies them hierarchically.)
    if (hasLeadingWildcard) {
      // No-op; the resolvable dirs take precedence.
    }
    for (const dir of dirs) {
      const bucket = overrideBuckets.get(dir) ?? [];
      bucket.push(entry);
      overrideBuckets.set(dir, bucket);
    }
  }

  if (rootBucket.length > 0) {
    files.push({
      path: "AGENTS.md",
      content: renderBucket(rootBucket),
      target: "codex",
      type: "instructions",
      sourcePath: rootBucket.map((e) => e.sourcePath).join(","),
    });
  }

  for (const [dir, bucket] of overrideBuckets) {
    files.push({
      path: `${dir}/AGENTS.override.md`,
      content: renderBucket(bucket),
      target: "codex",
      type: "instructions",
      sourcePath: bucket.map((e) => e.sourcePath).join(","),
    });
  }

  return files;
}

/** Serialize an object as YAML frontmatter + body. Uses the same shape generate.ts uses. */
function serializeWithFrontmatter(frontmatter: Record<string, unknown>, body: string): string {
  const filtered = Object.fromEntries(
    Object.entries(frontmatter).filter(([, v]) => v !== undefined && v !== null),
  );
  if (Object.keys(filtered).length === 0) return body;
  const fmStr = stringifyYAML(filtered, {
    defaultStringType: "QUOTE_DOUBLE",
    defaultKeyType: "PLAIN",
    indent: 2,
  }).trim();
  return `---\n${fmStr}\n---\n${body}`;
}

/** Convert a camelCase object's keys to snake_case (one level deep + nested objects). */
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

function consolidateCodexSkills({ templates }: ConsolidateInput): GeneratedFile[] {
  const files: GeneratedFile[] = [];
  for (const t of templates) {
    const skillDir = `.agents/skills/${t.name}`;
    const fm = t.frontmatter;

    // SKILL.md frontmatter: minimal Codex/Agent-Skills-spec fields only.
    const skillFm: Record<string, unknown> = {};
    if (fm.name !== undefined || t.name) skillFm.name = fm.name ?? t.name;
    if (fm.description !== undefined) skillFm.description = fm.description;
    if (fm.version !== undefined) skillFm.version = fm.version;
    if (fm.author !== undefined) skillFm.author = fm.author;
    if (fm.license !== undefined) skillFm.license = fm.license;
    if (fm.compatibility !== undefined) skillFm.compatibility = fm.compatibility;
    if (fm.metadata !== undefined) skillFm.metadata = fm.metadata;

    files.push({
      path: `${skillDir}/SKILL.md`,
      content: serializeWithFrontmatter(skillFm, t.body),
      target: "codex",
      type: "skills",
      sourcePath: t.sourcePath,
    });

    // agents/openai.yaml sidecar — emit when any codex.* field OR
    // disableAutoInvocation is set.
    const yamlObj: Record<string, unknown> = {};
    if (fm.codex?.interface) {
      yamlObj.interface = camelToSnakeKeys(fm.codex.interface);
    }
    if (fm.codex?.dependencies) {
      yamlObj.dependencies = camelToSnakeKeys(fm.codex.dependencies);
    }
    // Auto-map disableAutoInvocation (inverted) → policy.allow_implicit_invocation
    if (fm.disableAutoInvocation !== undefined) {
      yamlObj.policy = { allow_implicit_invocation: !fm.disableAutoInvocation };
    }
    if (Object.keys(yamlObj).length > 0) {
      files.push({
        path: `${skillDir}/agents/openai.yaml`,
        content: stringifyYAML(yamlObj, {
          defaultStringType: "QUOTE_DOUBLE",
          defaultKeyType: "PLAIN",
          indent: 2,
        }),
        target: "codex",
        type: "skills",
        sourcePath: t.sourcePath,
      });
    }

    // Extra files (references, scripts, etc.) — already EJS-rendered by the
    // generate loop before being handed to consolidate.
    for (const extra of t.extraFiles ?? []) {
      files.push({
        path: `${skillDir}/${extra.relativePath}`,
        content: extra.content,
        target: "codex",
        type: "skills",
        sourcePath: t.sourcePath,
      });
    }
  }
  return files;
}

function consolidateCodexAgents({ templates, outputDir }: ConsolidateInput): GeneratedFile[] {
  const files: GeneratedFile[] = [];
  for (const t of templates) {
    const fm = t.frontmatter;
    const tomlObj: Record<string, unknown> = {
      name: t.name,
      description: fm.description ?? "",
      developer_instructions: t.body.trim(),
    };

    if (fm.model !== undefined) {
      tomlObj.model = fm.model;
      if (typeof fm.model === "string" && fm.model.startsWith("claude-")) {
        consola.warn(
          `[codex] agent "${t.name}": model "${fm.model}" looks Claude-shaped; use a per-target override for Codex (e.g. model: { codex: "gpt-5.4", default: "..." })`,
        );
      }
    }

    if (fm.sandboxMode !== undefined) tomlObj.sandbox_mode = fm.sandboxMode;

    // Auto-map effort → model_reasoning_effort when value is in the overlap set.
    if (fm.effort !== undefined) {
      if (CODEX_REASONING_EFFORT.has(fm.effort)) {
        tomlObj.model_reasoning_effort = fm.effort;
      } else {
        consola.warn(
          `[codex] agent "${t.name}": effort "${fm.effort}" has no Codex equivalent; dropped (use a per-target override for Codex)`,
        );
      }
    }

    if (fm.nicknameCandidates !== undefined) tomlObj.nickname_candidates = fm.nicknameCandidates;
    if (fm.mcpServers !== undefined) tomlObj.mcp_servers = fm.mcpServers;
    if (fm.skills !== undefined) tomlObj["skills.config"] = fm.skills;

    // Drop-with-warning: fields with no clean Codex translation.
    if (fm.tools !== undefined) {
      consola.warn(
        `[codex] agent "${t.name}": "tools" dropped (Codex uses per-MCP-server enabled_tools, not agent-level)`,
      );
    }
    if (fm.disallowedTools !== undefined) {
      consola.warn(
        `[codex] agent "${t.name}": disallowedTools dropped (Codex has no agent-level denylist)`,
      );
    }
    if (fm.permissionMode !== undefined) {
      consola.warn(
        `[codex] agent "${t.name}": permissionMode dropped (use sandboxMode for Codex via per-target override)`,
      );
    }

    files.push({
      path: `${outputDir}/agents/${t.name}.toml`,
      content: stringifyToml(tomlObj),
      target: "codex",
      type: "agents",
      sourcePath: t.sourcePath,
    });
  }
  return files;
}

export default defineTarget({
  name: "codex",
  outputDir: ".codex",
  supportedTypes: ["instructions", "skills", "agents", "hooks", "mcp"],

  instructions: {
    frontmatterMap: {},
    getOutputPath: (name) => name,
    consolidate: consolidateCodexInstructions,
  },

  skills: {
    frontmatterMap: {},
    getOutputPath: (name) => name,
    consolidate: consolidateCodexSkills,
  },

  agents: {
    frontmatterMap: {},
    getOutputPath: (name) => name,
    consolidate: consolidateCodexAgents,
  },

  hooks: {
    transform: transformCodexHooks,
    outputPath: "hooks.json",
  },

  mcp: {
    transform: transformCodexMCP,
    outputPath: ".codex/config.toml",
    mergeKey: "mcp_servers",
    format: "toml",
  },
});
