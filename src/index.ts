export { defineConfig } from "./config/schema.js";
export { mergeField } from "./config/merge-field.js";
export { loadProjectConfig } from "./config/loader.js";
export { generate } from "./core/generate.js";
export { writeGeneratedFiles, cleanTargetFiles } from "./core/writer.js";
export { fetchSkills, installSkill } from "./core/add-skill.js";
export { parseSkillSource } from "./core/skill-source.js";
export { discoverSkills, filterSkillsByName, normalizeSkillName } from "./core/skill-discovery.js";
export { defineTarget } from "./targets/define-target.js";
export type {
  GeneratedFile,
  GenerateOptions,
  InMemoryTemplate,
  InMemoryExtraFile,
  ResolvedConfig,
  Target,
  TemplateType,
  UserConfig,
  UniversalFrontmatter,
  UniversalHookHandler,
  UniversalMCPServer,
  UniversalMCPInput,
  MCPConfig,
  PerTargetValue,
} from "./types.js";
export type { LoadConfigOptions } from "./config/loader.js";
export type { FetchSkillsOptions, FetchedSkills, InstalledSkill } from "./core/add-skill.js";
export type { ParsedSkillSource } from "./core/skill-source.js";
export type { DiscoveredSkill } from "./core/skill-discovery.js";
export type {
  TargetDefinition,
  TemplateTypeConfig,
  HooksTypeConfig,
  MCPTypeConfig,
} from "./targets/define-target.js";
