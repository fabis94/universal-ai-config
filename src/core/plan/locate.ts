import { posix } from "node:path";
import { AGENTS_MD, primaryFile } from "../agents-md/index.js";
import { targets } from "../../targets/index.js";
import type {
  MarkdownTemplateType,
  PathContext,
  TargetDefinition,
  TemplateTypeConfig,
} from "../../targets/define-target.js";
import { DEFAULT_CONFIG } from "../../config/defaults.js";
import type { ResolvedConfig, Target, UniversalFrontmatter } from "../../types.js";
import type { OutputPlan } from "./build-plan.js";
import { AGENT_SKILLS_DIR, readsStandard, sourcedTypes, type StandardType } from "./standards.js";

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
  /** The types read from a standard instead of templates (`config.standards`) */
  sourced: ReadonlySet<StandardType>;
  /** The target's output directory for this run */
  outputDir(target: Target): string;
  pathContext(target: Target): PathContext;
  /** The target's own config for a type; undefined when it has none (or uses AGENTS.md) */
  typeConfig(target: Target, type: MarkdownTemplateType): TemplateTypeConfig | undefined;
  /** Whether the target's instructions are the AGENTS.md files (generated or the project's own) */
  usesAgentsMd(target: Target): boolean;
  /**
   * Main output file of a template — the AGENTS.md file it lands in, for
   * targets that use AGENTS.md; the `.agents/skills` source of a skill, for
   * targets that read skills from there
   */
  templatePath(
    target: Target,
    type: MarkdownTemplateType,
    name: string,
    frontmatter: UniversalFrontmatter,
  ): string;
  /** Directory of a type's outputs (the root AGENTS.md for targets that use AGENTS.md) */
  typeDir(target: Target, type: MarkdownTemplateType): string;
  /** A skill's output folder (where its SKILL.md and extra files go) */
  skillDir(target: Target, name: string): string;
  hooksPath(target: Target): string | undefined;
  mcpPath(target: Target): string | undefined;
}

/** What paths depend on. `standards` and `types` default to template mode with every type. */
type LocatorConfig = Pick<ResolvedConfig, "outputDirs" | "agentsMd"> &
  Partial<Pick<ResolvedConfig, "standards" | "types">>;

/**
 * Paths follow the target facts and the config, so a locator built without a
 * plan (seed, clean, the default in `renderEjs`) agrees with one built for a
 * run. A type read from a standard routes every target that reads the
 * standard to it: AGENTS.md (in the `nested` layout) for instructions,
 * `.agents/skills/` for skills.
 *
 * @param plan when given, targets the plan switched to generated AGENTS.md
 *   route their instructions there too; without it only targets that read
 *   nothing but AGENTS.md (codex) do.
 */
export function createLocator(config: LocatorConfig, plan?: OutputPlan): Locator {
  const definition = (target: Target): TargetDefinition | undefined => targets[target];

  const outputDir = (target: Target): string =>
    toPosixPath(config.outputDirs[target] ?? definition(target)?.outputDir ?? `.${target}`);
  const pathContext = (target: Target): PathContext => ({ outputDir: outputDir(target) });
  const typeConfig = (target: Target, type: MarkdownTemplateType) => {
    const tc = definition(target)?.[type];
    return typeof tc === "object" ? tc : undefined;
  };
  const sourced = sourcedTypes({
    standards: config.standards ?? DEFAULT_CONFIG.standards,
    types: config.types ?? DEFAULT_CONFIG.types,
  });
  /** The target reads the standard `type` comes from, so its paths point there. */
  const readsSource = (target: Target, type: StandardType): boolean =>
    sourced.has(type) && readsStandard(definition(target), type);

  const usesAgentsMd = (target: Target): boolean =>
    definition(target)?.instructions === "agentsMd" ||
    plan?.outputFor(target, "instructions").kind === "agentsMd" ||
    readsSource(target, "instructions");
  // The project's own AGENTS.md files are laid out by folder; the agentsMd
  // options only shape generated ones
  const layout = sourced.has("instructions")
    ? { variation: "nested" as const, indexDir: toPosixPath(DEFAULT_CONFIG.agentsMd.indexDir) }
    : {
        variation: plan?.agentsMd?.variation ?? config.agentsMd.variation,
        indexDir: toPosixPath(plan?.agentsMd?.indexDir ?? config.agentsMd.indexDir),
      };

  const templatePath: Locator["templatePath"] = (target, type, name, frontmatter) => {
    if (type === "instructions" && usesAgentsMd(target)) {
      return primaryFile({ name, frontmatter, sourcePath: "", body: "" }, layout);
    }
    if (type === "skills" && readsSource(target, "skills")) {
      return `${AGENT_SKILLS_DIR}/${name}/SKILL.md`;
    }
    const tc = typeConfig(target, type);
    if (!tc) return FALLBACK_PATHS[type](outputDir(target), name);
    return toPosixPath(tc.outputPath(name, frontmatter, pathContext(target)));
  };

  return {
    sourced,
    outputDir,
    pathContext,
    typeConfig,
    usesAgentsMd,
    templatePath,
    typeDir: (target, type) => {
      if (type === "instructions" && usesAgentsMd(target)) return AGENTS_MD;
      if (type === "skills" && readsSource(target, "skills")) return AGENT_SKILLS_DIR;
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
