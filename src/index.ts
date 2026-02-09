export { defineConfig } from "./config/schema.js";
export { generate } from "./core/generate.js";
export { defineTarget } from "./targets/define-target.js";
export type {
  GeneratedFile,
  GenerateOptions,
  ResolvedConfig,
  Target,
  TemplateType,
  UserConfig,
  UniversalFrontmatter,
  UniversalHookHandler,
  UniversalMCPServer,
  UniversalMCPInput,
  PerTargetValue,
} from "./types.js";
export type {
  TargetDefinition,
  TemplateTypeConfig,
  HooksTypeConfig,
  MCPTypeConfig,
} from "./targets/define-target.js";
