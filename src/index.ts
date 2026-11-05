export { defineConfig } from "./config/schema.js";
export { mergeField } from "./config/merge-field.js";
export { loadProjectConfig } from "./config/loader.js";
export { generate, generateProject } from "./core/generate/index.js";
export type { GenerateResult } from "./core/generate/index.js";
export type {
  OutputPlan,
  AgentsMdPlan,
  ServedBy,
  DuplicateRunCheck,
} from "./core/plan/build-plan.js";
export { writeGeneratedFiles } from "./core/writer.js";
export { cleanTargetFiles } from "./core/clean/index.js";
export {
  findAgentsOverrideFiles,
  removeAgentsOverrideFiles,
} from "./core/clean/agents-overrides.js";
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
  ShadowEvent,
  Target,
  TemplateType,
  UserConfig,
  UniversalFrontmatter,
  UniversalHookHandler,
  UniversalMCPServer,
  UniversalMCPInput,
  MCPConfig,
  AgentsMdConfig,
  AgentsMdVariation,
  ResolvedAgentsMdConfig,
  StandardsSetting,
  HookHandlerType,
  UniversalSkillCodexFields,
  UniversalAgentCodexFields,
  PerTargetValue,
} from "./types.js";
export type { WriteReport } from "./core/writer.js";
export type { CleanOptions } from "./core/clean/index.js";
export type { AgentsOverrideOptions } from "./core/clean/agents-overrides.js";
export type {
  Diagnostic,
  DiagnosticCode,
  DiagnosticDetails,
  DiagnosticSeverity,
} from "./core/diagnostics.js";
export type { LoadConfigOptions } from "./config/loader.js";
export type { FetchSkillsOptions, FetchedSkills, InstalledSkill } from "./core/add-skill.js";
export type { ParsedSkillSource } from "./core/skill-source.js";
export type { DiscoveredSkill, SkillPreference } from "./core/skill-discovery.js";
export type {
  TargetDefinition,
  TemplateTypeConfig,
  HooksTypeConfig,
  MCPTypeConfig,
  TargetContext,
  PathContext,
  RenderInput,
  RenderedFile,
  CombineEntry,
  FrontmatterMapper,
  FrontmatterStyle,
  ForeignRead,
  Reconcile,
} from "./targets/define-target.js";
