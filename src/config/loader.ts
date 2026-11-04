import { loadConfig } from "c12";
import { userConfigSchema } from "./schema.js";
import { DEFAULT_CONFIG } from "./defaults.js";
import { validateResolvedConfig } from "./validate.js";
import type { ResolvedConfig, UserConfig, Target, TemplateType } from "../types.js";

export interface LoadConfigOptions {
  root?: string;
  configPath?: string;
  cliTargets?: Target[];
  cliTypes?: TemplateType[];
  /** Inline config overrides — applied after overrides file, before CLI target/type overrides */
  inlineOverrides?: UserConfig;
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
async function loadOverrides(root: string): Promise<UserConfig | undefined> {
  const exact = await loadConfig<UserConfig>({
    name: OVERRIDES_NAME,
    configFile: OVERRIDES_NAME,
    cwd: root,
    dotenv: false,
    defaults: {},
  });
  if (exact.config && Object.keys(exact.config).length > 0) return exact.config;

  const legacy = await loadConfig<UserConfig>({
    name: OVERRIDES_NAME,
    cwd: root,
    dotenv: false,
    defaults: {},
  });
  return legacy.config;
}

export async function loadProjectConfig(options: LoadConfigOptions = {}): Promise<ResolvedConfig> {
  const root = options.root ?? process.cwd();

  // Load base config
  const { config: baseRaw } = await loadConfig<UserConfig>({
    name: "universal-ai-config",
    cwd: root,
    configFile: options.configPath,
    dotenv: false,
    defaults: {},
  });

  const baseParsed = userConfigSchema.parse(baseRaw ?? {});
  let resolved = mergeConfigs(DEFAULT_CONFIG, baseParsed);

  const overridesRaw = await loadOverrides(root);

  if (overridesRaw && Object.keys(overridesRaw).length > 0) {
    const overridesParsed = userConfigSchema.parse(overridesRaw);
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
