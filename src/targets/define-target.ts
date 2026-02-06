import type { TemplateType, UniversalFrontmatter } from "../types.js";

export interface TemplateTypeConfig {
  /**
   * Map universal frontmatter keys → target-specific keys.
   * Value can be a string (simple rename) or a function (transform).
   * Keys not in this map are dropped from output frontmatter.
   */
  frontmatterMap: Record<
    string,
    string | ((value: unknown, allFrontmatter: UniversalFrontmatter) => Record<string, unknown>)
  >;
  /**
   * Given template name + parsed frontmatter, return output path relative to outputDir.
   */
  getOutputPath: (name: string, frontmatter: UniversalFrontmatter) => string;
}

export interface TargetDefinition {
  name: string;
  outputDir: string;
  supportedTypes: TemplateType[];
  instructions?: TemplateTypeConfig;
  skills?: TemplateTypeConfig;
  agents?: TemplateTypeConfig;
}

export function defineTarget(definition: TargetDefinition): TargetDefinition {
  return definition;
}
