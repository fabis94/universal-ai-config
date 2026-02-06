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
} from "./types.js";
export type {
  TargetDefinition,
  TemplateTypeConfig,
  HooksTypeConfig,
} from "./targets/define-target.js";
