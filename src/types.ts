export type Target = "claude" | "copilot" | "cursor";
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
}
