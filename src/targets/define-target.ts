import type {
  HookHandlerType,
  Target,
  TemplateType,
  UniversalFrontmatter,
  UniversalHookHandler,
  UniversalMCPInput,
  UniversalMCPServer,
} from "../types.js";
import type { Reporter } from "../core/diagnostics.js";

/** Passed to every target transform and renderer. */
export interface TargetContext {
  /** Report a diagnostic; the target and type are filled in for you. */
  report: Reporter;
}

/** What a target needs to compute output paths. */
export interface PathContext {
  /**
   * The target's output directory for this run (`outputDirs[target]`, or the
   * target's default), as a POSIX path relative to the project root.
   */
  outputDir: string;
}

/**
 * Maps one universal frontmatter key to target keys: a string renames it, a
 * function returns any number of fields (`{}` drops it). Keys not in the map
 * are dropped.
 */
export type FrontmatterMapper =
  | string
  | ((value: unknown, allFrontmatter: UniversalFrontmatter) => Record<string, unknown>);

/**
 * How frontmatter is serialized.
 *
 * - `yaml` (default): standard YAML with double-quoted strings.
 * - `line-safe`: one `key: value` line per scalar, unquoted wherever YAML
 *   allows it, newlines folded to spaces, and `tools` / `disallowedTools`
 *   written as `A, B`. For files that line-based parsers read as well as YAML
 *   parsers (Cursor reads agent files by splitting each line at the first `:`).
 */
export type FrontmatterStyle = "yaml" | "line-safe";

/** One template, parsed and resolved for a target, as handed to `render`. */
export interface RenderInput {
  /** Template name (file basename, or skill folder name) */
  name: string;
  /** Template path, root-relative */
  sourcePath: string;
  /** Frontmatter with per-target overrides resolved */
  frontmatter: UniversalFrontmatter;
  /** EJS-rendered body (no frontmatter) */
  body: string;
  /** The path `outputPath` returned for this template */
  outputPath: string;
}

/** A file produced by `render`, at a root-relative POSIX path. */
export interface RenderedFile {
  path: string;
  content: string | Uint8Array;
  mode?: number;
}

/** One of several templates that render to the same path, as handed to `combine`. */
export interface CombineEntry {
  name: string;
  sourcePath: string;
  frontmatter: UniversalFrontmatter;
  body: string;
  /** What this template alone would have written to the path */
  content: string;
}

export interface TemplateTypeConfig {
  /** Universal frontmatter key → target key(s). Keys not listed are dropped. */
  frontmatterMap: Record<string, FrontmatterMapper>;
  /** How the mapped frontmatter is serialized. Default: `"yaml"`. */
  frontmatterStyle?: FrontmatterStyle;
  /**
   * Root-relative POSIX path of a template's main output file. Skill extra
   * files are written next to it. Must honour `ctx.outputDir` for anything
   * that lives in the target's output directory.
   */
  outputPath: (name: string, frontmatter: UniversalFrontmatter, ctx: PathContext) => string;
  /** Root-relative directory holding this type's outputs (what `skillPath()` etc. return with no name). */
  typeDir: (ctx: PathContext) => string;
  /** Every root-relative file or directory this type writes into — what `clean` removes. */
  ownedPaths: (ctx: PathContext) => string[];
  /**
   * Render one template to its files. Without it, uac writes the mapped
   * frontmatter + body to `outputPath`. Use it when one template becomes
   * several files or a non-markdown format.
   */
  render?: (input: RenderInput, ctx: TargetContext) => RenderedFile[];
  /**
   * Join several templates that render to the same path (e.g. every always-on
   * Copilot instruction goes to `copilot-instructions.md`). Called only when
   * two or more templates share a path; without it that is an error.
   */
  combine?: (entries: CombineEntry[], ctx: TargetContext) => string;
}

export interface HooksTypeConfig {
  /**
   * Handler types this target can run. Handlers of any other type are dropped
   * with an `unsupported` diagnostic before `transform` is called, so the
   * transform only ever sees these types (each with its required fields set).
   */
  handlerTypes: readonly HookHandlerType[];
  /** Transform universal hooks config to target-specific output object */
  transform: (
    hooks: Record<string, UniversalHookHandler[]>,
    ctx: TargetContext,
  ) => Record<string, unknown>;
  /** Root-relative POSIX path of the hooks file */
  outputPath: (ctx: PathContext) => string;
  /** If set, merge output into this key of existing file at outputPath instead of overwriting */
  mergeKey?: string;
  /** Serialization format for the output. Defaults to `"json"`. */
  format?: "json" | "toml";
}

export interface MCPTypeConfig {
  /** Transform universal MCP servers to target-specific output object */
  transform: (
    servers: Record<string, UniversalMCPServer>,
    inputs: UniversalMCPInput[] | undefined,
    ctx: TargetContext,
  ) => Record<string, unknown>;
  /** Root-relative POSIX path of the MCP config file */
  outputPath: (ctx: PathContext) => string;
  /**
   * If set, merge output into this key of an existing file at `outputPath`
   * instead of overwriting the whole file. Used by Codex to write only the
   * `mcp_servers` table inside `.codex/config.toml` (preserving any
   * user-managed keys).
   */
  mergeKey?: string;
  /** Serialization format for the output. Defaults to `"json"`. */
  format?: "json" | "toml";
}

/** The template types rendered from markdown templates. */
export type MarkdownTemplateType = "instructions" | "skills" | "agents";

export interface TargetDefinition {
  name: Target;
  /** Default output directory, relative to the project root */
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
