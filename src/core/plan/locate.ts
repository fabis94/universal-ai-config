import { posix } from "node:path";
import { targets } from "../../targets/index.js";
import type {
  MarkdownTemplateType,
  PathContext,
  TargetDefinition,
  TemplateTypeConfig,
} from "../../targets/define-target.js";
import type { ResolvedConfig, Target, UniversalFrontmatter } from "../../types.js";

/** Forward slashes, no `./` prefix, no trailing slash. */
export function toPosixPath(p: string): string {
  let out = p.split("\\").join("/");
  while (out.startsWith("./")) out = out.slice(2);
  while (out.length > 1 && out.endsWith("/")) out = out.slice(0, -1);
  return out;
}

/**
 * Where a type's files go when the target has no config for it — used only by
 * path helpers, so a template can still name a path for a type a target
 * doesn't generate.
 */
const FALLBACK_PATHS: Record<MarkdownTemplateType, (dir: string, name: string) => string> = {
  instructions: (dir, name) => `${dir}/instructions/${name}.md`,
  skills: (dir, name) => `${dir}/skills/${name}/SKILL.md`,
  agents: (dir, name) => `${dir}/agents/${name}.md`,
};

/**
 * The only place output paths are computed. Emitters, EJS path helpers and
 * clean all go through it, so they can't disagree. Every path is root-relative
 * and POSIX.
 */
export interface Locator {
  /** The target's output directory for this run */
  outputDir(target: Target): string;
  pathContext(target: Target): PathContext;
  typeConfig(target: Target, type: MarkdownTemplateType): TemplateTypeConfig | undefined;
  /** Main output file of a template */
  templatePath(
    target: Target,
    type: MarkdownTemplateType,
    name: string,
    frontmatter: UniversalFrontmatter,
  ): string;
  /** Directory of a type's outputs */
  typeDir(target: Target, type: MarkdownTemplateType): string;
  /** A skill's output folder (where its SKILL.md and extra files go) */
  skillDir(target: Target, name: string): string;
  hooksPath(target: Target): string | undefined;
  mcpPath(target: Target): string | undefined;
}

export function createLocator(config: Pick<ResolvedConfig, "outputDirs">): Locator {
  const definition = (target: Target): TargetDefinition | undefined => targets[target];

  const outputDir = (target: Target): string =>
    toPosixPath(config.outputDirs[target] ?? definition(target)?.outputDir ?? `.${target}`);
  const pathContext = (target: Target): PathContext => ({ outputDir: outputDir(target) });
  const typeConfig = (target: Target, type: MarkdownTemplateType) => definition(target)?.[type];

  const templatePath: Locator["templatePath"] = (target, type, name, frontmatter) => {
    const tc = typeConfig(target, type);
    if (!tc) return FALLBACK_PATHS[type](outputDir(target), name);
    return toPosixPath(tc.outputPath(name, frontmatter, pathContext(target)));
  };

  return {
    outputDir,
    pathContext,
    typeConfig,
    templatePath,
    typeDir: (target, type) => {
      const tc = typeConfig(target, type);
      if (!tc) return `${outputDir(target)}/${type}`;
      return toPosixPath(tc.typeDir(pathContext(target)));
    },
    skillDir: (target, name) =>
      posix.dirname(templatePath(target, "skills", name, {} as UniversalFrontmatter)),
    hooksPath: (target) => {
      const hooks = definition(target)?.hooks;
      return hooks ? toPosixPath(hooks.outputPath(pathContext(target))) : undefined;
    },
    mcpPath: (target) => {
      const mcp = definition(target)?.mcp;
      return mcp ? toPosixPath(mcp.outputPath(pathContext(target))) : undefined;
    },
  };
}
