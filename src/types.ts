export type Target = "claude" | "copilot" | "cursor";
export type TemplateType = "instructions" | "skills" | "agents" | "hooks";

/** A value that can be specified globally or per-target (with optional default fallback) */
export type PerTargetValue<T> = T | (Partial<Record<Target, T>> & { default?: T });

export interface UserConfig {
  templatesDir?: string;
  targets?: Target[];
  types?: TemplateType[];
  variables?: Record<string, unknown>;
  outputDirs?: Partial<Record<Target, string>>;
}

export interface ResolvedConfig {
  templatesDir: string;
  targets: Target[];
  types: TemplateType[];
  variables: Record<string, unknown>;
  outputDirs: Record<Target, string>;
}

export interface GeneratedFile {
  path: string;
  content: string;
  target: Target;
  type: TemplateType;
  sourcePath: string;
  /** If set, merge content into this key of the existing file instead of overwriting */
  mergeKey?: string;
}

export interface UniversalHookHandler {
  command: string;
  matcher?: string;
  timeout?: number;
  description?: string;
}

export interface GenerateOptions {
  root?: string;
  targets?: Target[];
  types?: TemplateType[];
  config?: string;
  dryRun?: boolean;
  clean?: boolean;
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
  model?: string;
  subagentType?: string;
  forkContext?: boolean;
  argumentHint?: string;
  license?: string;
  compatibility?: string;
  metadata?: Record<string, unknown>;
  hooks?: Record<string, unknown>;

  // Agents
  tools?: string[];
  disallowedTools?: string[];
  permissionMode?: string;
  skills?: string[];
  memory?: string;
  target?: string;
  mcpServers?: Record<string, unknown>;
  handoffs?: string[];
}
