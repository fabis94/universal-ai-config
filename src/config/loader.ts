import { loadConfig } from "c12";
import { userConfigSchema } from "./schema.js";
import { DEFAULT_CONFIG } from "./defaults.js";
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
    // Exclude: override replaces entirely
    exclude: override.exclude ?? base.exclude,
  };
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

  // Load overrides config
  const { config: overridesRaw } = await loadConfig<UserConfig>({
    name: "universal-ai-config.overrides",
    cwd: root,
    dotenv: false,
    defaults: {},
  });

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

  return resolved;
}
