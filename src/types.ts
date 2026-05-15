export type Target = "claude" | "copilot" | "cursor" | "codex";
export type TemplateType = "instructions" | "skills" | "agents" | "hooks" | "mcp";

/** A value that can be specified globally or per-target (with optional default fallback) */
export type PerTargetValue<T> = T | (Partial<Record<Target, T>> & { default?: T });

export interface UserConfig {
  /** Directory where universal templates live, relative to project root. Default: `.universal-ai-config`. */
  templatesDir?: string;
  /**
   * Extra directories to discover templates from (e.g. `~/.universal-ai-config` for shared templates).
   * Supports absolute paths, relative paths, and `~`. Main `templatesDir` wins on name conflicts.
   */
  additionalTemplateDirs?: string[];
  /** Which targets to generate config for. Default: all (`["claude", "copilot", "cursor"]`). */
  targets?: Target[];
  /** Which template types to generate. Default: all (`["instructions", "skills", "agents", "hooks", "mcp"]`). */
  types?: TemplateType[];
  /**
   * Custom variables exposed to templates — EJS in markdown bodies, `{{varName}}` in hook/MCP JSON.
   * Exact-match `"{{var}}"` placeholders resolve to the raw typed value (arrays, objects, etc.).
   */
  variables?: Record<string, unknown>;
  /** Override the default output directory for each target. */
  outputDirs?: Partial<Record<Target, string>>;
  /**
   * Glob patterns matched against template **input** paths (relative to `templatesDir`,
   * e.g. `"hooks/debug.json"`, `"agents/internal.md"`) — not output paths.
   *
   * For instructions/skills/agents one input maps to one output, so exclusion is 1:1.
   * For hooks and MCP, multiple input files merge into a single output file: excluding
   * an input drops every handler/server it declared, and there is no way to exclude an
   * individual handler or named server — only the whole input file containing it.
   */
  exclude?: PerTargetValue<string[]>;
  /**
   * Server-name-level filtering for MCP. Operates one layer deeper than `exclude`
   * (which is file-level): when `forceOptIn` is true for a target, only servers whose
   * names appear in `mcpServers` are emitted, regardless of how many input files
   * declared them.
   */
  mcp?: MCPConfig;
}

export interface MCPConfig {
  /** When true for a target, only servers listed in `mcpServers` are emitted. Default: false (all servers). */
  forceOptIn?: PerTargetValue<boolean>;
  /** Allow-list of server names used when `forceOptIn` is true. Names not matching any discovered server emit a warning. */
  mcpServers?: PerTargetValue<string[]>;
}

export interface ResolvedConfig {
  templatesDir: string;
  additionalTemplateDirs: string[];
  targets: Target[];
  types: TemplateType[];
  variables: Record<string, unknown>;
  outputDirs: Record<Target, string>;
  exclude: PerTargetValue<string[]>;
  mcp: MCPConfig;
}

export interface GeneratedFile {
  path: string;
  content: string;
  target: Target;
  type: TemplateType;
  sourcePath: string;
  /** If set, merge content into this key of the existing file instead of overwriting */
  mergeKey?: string;
  /**
   * Serialization format for `mergeKey` operations. Defaults to `"json"`.
   * Set to `"toml"` for targets that use TOML config files (e.g. Codex `.codex/config.toml`).
   */
  mergeFormat?: "json" | "toml";
  /**
   * For merged types (hooks, mcp) — the number of input template files that contributed
   * to this output. Undefined for 1:1 template types (instructions, skills, agents).
   */
  inputCount?: number;
}

export interface UniversalHookHandler {
  // Handler type: "command" (default), "http", "mcp_tool", "prompt", "agent"
  type?: string;
  // command handler
  command?: string;
  args?: string[];
  async?: boolean;
  asyncRewake?: boolean;
  shell?: string;
  if?: string;
  statusMessage?: string;
  once?: boolean;
  // http handler
  url?: string;
  headers?: Record<string, string>;
  allowedEnvVars?: string[];
  // mcp_tool handler
  server?: string;
  tool?: string;
  input?: unknown;
  // prompt / agent handler
  prompt?: string;
  model?: string;
  // common fields
  matcher?: string;
  timeout?: number;
  description?: string;
  // Cursor-specific
  loopLimit?: number | null;
  failClosed?: boolean;
}

export interface UniversalMCPServer {
  type?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  // Claude-specific
  alwaysLoad?: boolean;
  headersHelper?: string;
  oauth?: Record<string, unknown>;
  // Copilot-specific
  sandboxEnabled?: boolean;
  sandbox?: Record<string, unknown>;
  dev?: { watch?: string; debug?: boolean };
  // Cursor-specific
  envFile?: string;
  auth?: Record<string, unknown>;
  // Codex-specific (snake_case TOML keys → camelCase universal)
  /** Codex: working directory for stdio child process */
  cwd?: string;
  /** Codex: env-var-name allowlist for forwarding (distinct from `env` value-setter) */
  envVars?: string[];
  /** Codex: per-server tool allowlist (canonical Codex name) */
  enabledTools?: string[];
  /** Codex: per-server tool denylist (Codex-only) */
  disabledTools?: string[];
  /** Codex: env-var name holding bearer token (HTTP transport) */
  bearerTokenEnvVar?: string;
  /** Codex: header name → env-var name (header value pulled from env) */
  envHttpHeaders?: Record<string, string>;
  /** Codex: startup timeout in seconds */
  startupTimeoutSec?: number;
  /** Codex: startup timeout in milliseconds (alternative to startupTimeoutSec) */
  startupTimeoutMs?: number;
  /** Codex: per-tool-call timeout in seconds */
  toolTimeoutSec?: number;
  /** Codex: toggle individual server */
  enabled?: boolean;
  /** Codex: fail session startup if server can't be reached */
  required?: boolean;
  /** Codex: RFC 8707 OAuth resource indicator */
  oauthResource?: string;
  /** Codex: OAuth scopes to request */
  scopes?: string[];
  /** Codex (experimental): `"local"` or `"remote"` — remote-executor flag */
  experimentalEnvironment?: string;
  [key: string]: unknown;
}

export interface UniversalMCPInput {
  type: string;
  id: string;
  description?: string;
  password?: boolean;
  [key: string]: unknown;
}

export interface InMemoryExtraFile {
  /** Path relative to the skill directory, e.g. "references/example.md" */
  relativePath: string;
  /** File content */
  content: string;
}

export interface InMemoryTemplate {
  /** Template name — e.g. "my-skill" for a skill, "general" for an instruction */
  name: string;
  /** Template type */
  type: TemplateType;
  /** The full template content (markdown with optional frontmatter + EJS) */
  content: string;
  /** Extra files for skills (non-SKILL.md files in the skill directory) */
  extraFiles?: InMemoryExtraFile[];
}

export interface GenerateOptions {
  root?: string;
  targets?: Target[];
  types?: TemplateType[];
  config?: string;
  dryRun?: boolean;
  clean?: boolean;
  /** Inline config overrides — merged after config file, before CLI-level target/type overrides */
  overrides?: UserConfig;
  /** In-memory templates — processed alongside (or instead of) file-discovered templates */
  templates?: InMemoryTemplate[];
}

/**
 * Codex-specific nested skill metadata. Drives emission of the
 * `agents/openai.yaml` sidecar alongside `SKILL.md`. Fields under this object
 * have no universal equivalent (UI metadata, Codex-specific MCP dependency
 * declarations) — they are intentionally namespaced to keep the universal
 * skill fields minimal.
 */
export interface UniversalSkillCodexFields {
  interface?: {
    displayName?: string;
    shortDescription?: string;
    iconSmall?: string;
    iconLarge?: string;
    brandColor?: string;
    defaultPrompt?: string;
  };
  dependencies?: {
    tools?: Array<{
      type?: string;
      value?: string;
      description?: string;
      transport?: string;
      url?: string;
    }>;
  };
}

export interface UniversalFrontmatter {
  // Instructions
  description?: string;
  globs?: string | string[];
  alwaysApply?: boolean;
  excludeAgent?: string;

  // Skills
  name?: string;
  disableAutoInvocation?: boolean;
  userInvocable?: boolean | string;
  allowedTools?: string[];
  model?: string | string[];
  subagentType?: string;
  forkContext?: boolean;
  argumentHint?: string;
  license?: string;
  compatibility?: string;
  metadata?: Record<string, unknown>;
  hooks?: Record<string, unknown>;
  // Codex-compatible skill fields (also accepted by other targets via SKILL.md frontmatter passthrough)
  /** Semver-style version string (Codex SKILL.md spec) */
  version?: string;
  /** Skill author attribution (Codex SKILL.md spec) */
  author?: string;
  /** Codex-only nested skill metadata — drives `agents/openai.yaml` sidecar emission */
  codex?: UniversalSkillCodexFields;
  // Claude-only skill fields
  whenToUse?: string;
  arguments?: string | string[];
  effort?: string;
  skillPaths?: string[];
  skillShell?: string;

  // Agents
  tools?: string[];
  disallowedTools?: string[];
  permissionMode?: string;
  skills?: string[];
  memory?: string;
  target?: string;
  mcpServers?: Record<string, unknown>;
  handoffs?: string[];
  subAgents?: string[];
  // Claude-only agent fields
  maxTurns?: number;
  background?: boolean;
  isolation?: string;
  color?: string;
  initialPrompt?: string;
  // Codex-only agent fields
  /** Codex agent: display nickname pool for spawned worker copies */
  nicknameCandidates?: string[];
  /** Codex agent: sandbox mode (`read-only` / `workspace-write` / `danger-full-access`) */
  sandboxMode?: string;
}
