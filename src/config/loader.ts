import { loadConfig } from "c12";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { userConfigSchema } from "./schema.js";
import { DEFAULT_CONFIG } from "./defaults.js";
import { validateResolvedConfig } from "./validate.js";
import type { ResolvedConfig, UserConfig, Target, TemplateType } from "../types.js";

export interface LoadConfigOptions {
  /** Project root to load the config from. Default: `process.cwd()`. */
  root?: string;
  /** Config file to load instead of the auto-detected `universal-ai-config.config.*`. */
  configPath?: string;
  /** Replaces the resolved `targets` (what the CLI's `-t` does). */
  cliTargets?: Target[];
  /** Replaces the resolved `types` (what the CLI's `--type` does). */
  cliTypes?: TemplateType[];
  /** Inline config overrides — applied after overrides file, before CLI target/type overrides */
  inlineOverrides?: UserConfig;
}

let loads = 0;

/**
 * Load a config file as it is on disk now. Node caches native imports by URL,
 * so without this a config written in the same process (setup saving the
 * overrides file, then generating) would load stale. Like c12's own loader,
 * it falls back to jiti, uncached, when Node can't import the file.
 */
async function importFresh(path: string): Promise<unknown> {
  if (path.endsWith(".json")) return JSON.parse(await readFile(path, "utf-8"));
  const url = pathToFileURL(path);
  // Unique across processes too: tsx's transform cache on disk is keyed by URL
  url.searchParams.set("uac-load", `${process.pid}-${Date.now()}-${++loads}`);
  try {
    return await import(url.href);
  } catch (error) {
    // A variable specifier: jiti is c12's optional peer, not a dependency
    const jitiName = "jiti";
    const jiti = (await import(jitiName).catch(() => {
      throw error;
    })) as {
      createJiti(from: string, options: object): { import(id: string): Promise<unknown> };
    };
    return jiti.createJiti(path, { interopDefault: true, moduleCache: false }).import(path);
  }
}

function mergeConfigs(base: ResolvedConfig, override: UserConfig): ResolvedConfig {
  return {
    // Scalars: override replaces
    templatesDir: override.templatesDir ?? base.templatesDir,
    // Arrays: override replaces entirely
    additionalTemplateDirs: override.additionalTemplateDirs ?? base.additionalTemplateDirs,
    targets: override.targets ?? base.targets,
    types: override.types ?? base.types,
    // Objects: deep merge
    variables: { ...base.variables, ...override.variables },
    outputDirs: { ...base.outputDirs, ...override.outputDirs },
    // Exclude / preserveOnClean: override replaces entirely (use `mergeField` to concatenate)
    exclude: override.exclude ?? base.exclude,
    preserveOnClean: override.preserveOnClean ?? base.preserveOnClean,
    // MCP config: shallow-merge fields (forceOptIn / mcpServers each replace independently)
    mcp: { ...base.mcp, ...override.mcp },
    // AGENTS.md config: shallow-merge fields, like mcp
    agentsMd: { ...base.agentsMd, ...override.agentsMd },
    standards: override.standards ?? base.standards,
  };
}

/** The local overrides file, documented as `universal-ai-config.overrides.ts` (any c12 extension). */
const OVERRIDES_NAME = "universal-ai-config.overrides";

/**
 * Load the gitignored overrides file. c12's default naming would look for
 * `universal-ai-config.overrides.config.*`, which is not the documented
 * name, so the exact name is tried first; the `.config.*` spelling is still
 * read when it's the only one present.
 */
export async function loadOverrides(root: string): Promise<UserConfig | undefined> {
  const exact = await loadConfig<UserConfig>({
    name: OVERRIDES_NAME,
    configFile: OVERRIDES_NAME,
    cwd: root,
    dotenv: false,
    defaults: {},
    import: importFresh,
  });
  if (exact.config && Object.keys(exact.config).length > 0) return exact.config;

  const legacy = await loadConfig<UserConfig>({
    name: OVERRIDES_NAME,
    cwd: root,
    dotenv: false,
    defaults: {},
    import: importFresh,
  });
  return legacy.config;
}

/**
 * Loads and resolves the project's config, later layers winning: built-in
 * defaults, `universal-ai-config.config.*`, the gitignored
 * `universal-ai-config.overrides.*`, `inlineOverrides`, then `cliTargets` and
 * `cliTypes`. Arrays replace, objects merge. Throws when a layer fails
 * validation or the overrides file sets `standards` (a team setting).
 */
export async function loadProjectConfig(options: LoadConfigOptions = {}): Promise<ResolvedConfig> {
  const root = options.root ?? process.cwd();

  // Load base config
  const { config: baseRaw } = await loadConfig<UserConfig>({
    name: "universal-ai-config",
    cwd: root,
    configFile: options.configPath,
    dotenv: false,
    defaults: {},
    import: importFresh,
  });

  const baseParsed = userConfigSchema.parse(baseRaw ?? {});
  let resolved = mergeConfigs(DEFAULT_CONFIG, baseParsed);

  const overridesRaw = await loadOverrides(root);

  if (overridesRaw && Object.keys(overridesRaw).length > 0) {
    const overridesParsed = userConfigSchema.parse(overridesRaw);
    // Per machine, it would make one developer's generate overwrite (and clean
    // delete) the AGENTS.md and .agents/skills files the team commits
    if (overridesParsed.standards !== undefined) {
      throw new Error(
        "`standards` is a team setting: set it in universal-ai-config.config.ts, not in the per-machine overrides file",
      );
    }
    resolved = mergeConfigs(resolved, overridesParsed);
  }

  // Inline overrides (programmatic API) — above config files, below CLI target/type
  if (options.inlineOverrides && Object.keys(options.inlineOverrides).length > 0) {
    const inlineParsed = userConfigSchema.parse(options.inlineOverrides);
    resolved = mergeConfigs(resolved, inlineParsed);
  }

  // CLI flags override everything
  if (options.cliTargets && options.cliTargets.length > 0) {
    resolved.targets = options.cliTargets;
  }
  if (options.cliTypes && options.cliTypes.length > 0) {
    resolved.types = options.cliTypes;
  }

  validateResolvedConfig(resolved, root);
  return resolved;
}
