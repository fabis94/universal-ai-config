import type {
  GeneratedFile,
  InMemoryExtraFile,
  TemplateType,
  UniversalFrontmatter,
  UniversalHookHandler,
  UniversalMCPInput,
  UniversalMCPServer,
} from "../types.js";

/**
 * Input passed to a target's `consolidate` function — the full set of parsed
 * templates of a single type for that target. Used by targets that need to
 * emit fewer files than templates (e.g. Codex AGENTS.md concatenation) or
 * emit at root-relative paths outside `outputDir`.
 */
export interface ConsolidateInput {
  templates: Array<{
    /** Template basename (no extension) */
    name: string;
    /** Original template path, relative to root */
    sourcePath: string;
    /** Resolved frontmatter (per-target overrides already applied) */
    frontmatter: UniversalFrontmatter;
    /** Rendered EJS body (no frontmatter) */
    body: string;
    /** Skill reference files (only set for the `skills` type) */
    extraFiles?: InMemoryExtraFile[];
  }>;
  /** Target's output directory (e.g. `.codex`) */
  outputDir: string;
  /** Project root — for any path resolution the consolidate function needs */
  root: string;
}

export interface TemplateTypeConfig {
  /**
   * Map universal frontmatter keys → target-specific keys.
   * Value can be a string (simple rename) or a function (transform).
   * Keys not in this map are dropped from output frontmatter.
   *
   * Unused when `consolidate` is set — the consolidate function owns the full
   * emission.
   */
  frontmatterMap: Record<
    string,
    string | ((value: unknown, allFrontmatter: UniversalFrontmatter) => Record<string, unknown>)
  >;
  /**
   * Given template name + parsed frontmatter, return output path relative to outputDir.
   *
   * Unused when `consolidate` is set.
   */
  getOutputPath: (name: string, frontmatter: UniversalFrontmatter) => string;
  /**
   * Optional override of the default 1:1-per-template emit. When set, the
   * generate loop bypasses `frontmatterMap` / `getOutputPath` for this type
   * and calls `consolidate` once with the full template list, expecting it
   * to return all `GeneratedFile`s for the target. Paths returned by
   * `consolidate` are interpreted as **root-relative** (allowing emission
   * outside `outputDir` for targets like Codex that write AGENTS.md at the
   * project root, or `.agents/skills/` for the open Agent Skills standard).
   */
  consolidate?: (input: ConsolidateInput) => GeneratedFile[] | Promise<GeneratedFile[]>;
}

export interface HooksTypeConfig {
  /** Transform universal hooks config to target-specific output object */
  transform: (hooks: Record<string, UniversalHookHandler[]>) => Record<string, unknown>;
  /** Output file path relative to outputDir */
  outputPath: string;
  /** If set, merge output into this key of existing file at outputPath instead of overwriting */
  mergeKey?: string;
  /**
   * Serialization format for the output. Defaults to `"json"`.
   * Set to `"toml"` for targets whose hook config is TOML (none today, but
   * the plumbing is shared with MCP and may be needed in the future).
   */
  format?: "json" | "toml";
}

export interface MCPTypeConfig {
  /** Transform universal MCP servers to target-specific output object */
  transform: (
    servers: Record<string, UniversalMCPServer>,
    inputs?: UniversalMCPInput[],
  ) => Record<string, unknown>;
  /** Output file path relative to project root (not outputDir) */
  outputPath: string;
  /**
   * If set, merge output into this key of an existing file at `outputPath`
   * instead of overwriting the whole file. Used by Codex to write only the
   * `mcp_servers` table inside `.codex/config.toml` (preserving any
   * user-managed sections like `[profiles.*]`, `personality`, etc.).
   */
  mergeKey?: string;
  /**
   * Serialization format for the output. Defaults to `"json"`. Set to `"toml"`
   * for targets that emit a TOML config file (e.g. Codex).
   */
  format?: "json" | "toml";
}

export interface TargetDefinition {
  name: string;
  outputDir: string;
  supportedTypes: TemplateType[];
  instructions?: TemplateTypeConfig;
  skills?: TemplateTypeConfig;
  agents?: TemplateTypeConfig;
  hooks?: HooksTypeConfig;
  mcp?: MCPTypeConfig;
}

export function defineTarget(definition: TargetDefinition): TargetDefinition {
  return definition;
}
