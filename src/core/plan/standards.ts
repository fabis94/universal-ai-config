import { realpath } from "node:fs/promises";
import { dirname, isAbsolute, posix, relative, resolve, sep } from "node:path";
import { targets as registry } from "../../targets/index.js";
import type { TargetDefinition } from "../../targets/define-target.js";
import type { ResolvedConfig, Target, TemplateType } from "../../types.js";

/**
 * The open standards a project can keep its instructions and skills in,
 * instead of uac templates (`config.standards`). This module holds every
 * fact about them; the planner turns the facts into what a run generates.
 * Nothing else reads `config.standards`.
 */

/** The template types a standard can be the source of. */
export type StandardType = "instructions" | "skills";

/** Hand-written AGENTS.md files (instructions), or `.agents/skills/` (skills). */
export type StandardId = "agentsMd" | "agentSkills";

/** The Agent Skills standard's project folder. */
export const AGENT_SKILLS_DIR = ".agents/skills";

const STANDARD_OF: Record<StandardType, StandardId> = {
  instructions: "agentsMd",
  skills: "agentSkills",
};

/** File names that are instruction sources while instructions come from AGENTS.md. */
const AGENTS_MD_NAMES = new Set(["AGENTS.md", "AGENTS.override.md"]);

export function isStandardType(type: TemplateType): type is StandardType {
  return type === "instructions" || type === "skills";
}

export function standardOf(type: StandardType): StandardId {
  return STANDARD_OF[type];
}

/**
 * The types this config reads from a standard. A type left out of `types` is
 * off entirely, so it's never sourced either.
 */
export function sourcedTypes(
  config: Pick<ResolvedConfig, "standards" | "types">,
): Set<StandardType> {
  const setting = config.standards;
  const wanted: StandardType[] =
    setting === true ? ["instructions", "skills"] : setting ? [setting] : [];
  return new Set(wanted.filter((type) => config.types.includes(type)));
}

/** Whether a tool loads a standard's files on its own (and so needs nothing generated). */
export function readsStandard(def: TargetDefinition | undefined, type: StandardType): boolean {
  if (!def) return false;
  if (type === "skills") return def.readsAgentSkills === true;
  return (
    def.instructions === "agentsMd" ||
    (def.reads?.instructions ?? []).some((read) => read.from === "agentsMd")
  );
}

/**
 * Whether uac could ever write `target`'s own output for `type` — what clean
 * removes and the .gitignore block ignores. False only for a type read from a
 * standard by a target that loads that standard itself: uac generates nothing
 * there, and the folder may hold the project's own files.
 *
 * A fact about the config, not about one run: clean and the .gitignore block
 * cover every target, whatever a run's target set is.
 */
export function ownedByUac(
  target: Target,
  type: TemplateType,
  config: Pick<ResolvedConfig, "standards" | "types">,
  definitions: Record<string, TargetDefinition> = registry,
): boolean {
  if (!isStandardType(type) || !sourcedTypes(config).has(type)) return true;
  return !readsStandard(definitions[target], type);
}

function isWithin(path: string, dir: string): boolean {
  return path === dir || path.startsWith(`${dir}/`);
}

/** Whether a root-relative POSIX path is in `.agents/skills/`. */
export function isAgentSkillsPath(path: string): boolean {
  return isWithin(path, AGENT_SKILLS_DIR);
}

/**
 * Whether a generated file would land on a standard's source files: anything
 * in `.agents/skills/` while skills come from there, or an instruction output
 * named AGENTS.md / AGENTS.override.md while instructions come from those.
 * Only instruction outputs count for AGENTS.md, since a skill may ship a file
 * by that name as an extra file.
 */
export function writesIntoStandard(
  file: { path: string; type: TemplateType },
  sourced: ReadonlySet<StandardType>,
): boolean {
  if (sourced.has("skills") && isAgentSkillsPath(file.path)) return true;
  const name = file.path.split("/").at(-1) ?? "";
  return sourced.has("instructions") && file.type === "instructions" && AGENTS_MD_NAMES.has(name);
}

/** The deepest existing ancestor of `fullPath`, with symlinks resolved. */
async function realpathOfExisting(fullPath: string): Promise<string> {
  let current = fullPath;
  for (;;) {
    const real = await realpath(current).catch(() => undefined);
    if (real !== undefined) return resolve(real, relative(current, fullPath));
    const parent = dirname(current);
    if (parent === current) return fullPath;
    current = parent;
  }
}

/**
 * Whether writing or deleting a root-relative path would touch the skills
 * standard's files, following symlinks: a committed `.claude/skills` link
 * to `.agents/skills` makes Claude's copies land in the source folder itself.
 */
export async function resolvesIntoAgentSkills(root: string, path: string): Promise<boolean> {
  const realRoot = await realpathOfExisting(root);
  const real = await realpathOfExisting(resolve(root, path));
  const rel = relative(realRoot, real);
  if (rel.startsWith("..") || isAbsolute(rel)) return false;
  return isAgentSkillsPath(rel.split(sep).join("/"));
}

/**
 * Where the project's skills come from, root-relative: `.agents/skills` while
 * skills are read from that standard, the templates dir's `skills/`
 * otherwise. `uac skill add` installs there.
 */
export function skillSourceDir(
  config: Pick<ResolvedConfig, "standards" | "types" | "templatesDir">,
): string {
  if (sourcedTypes(config).has("skills")) return AGENT_SKILLS_DIR;
  return posix.join(config.templatesDir.split(sep).join("/"), "skills");
}

/**
 * The target content for a standard is rendered for when uac writes it there
 * itself (the meta-instructions seed): the first registered target that reads
 * the standard. A project-wide fact, not a machine's `targets`, so every
 * machine seeds the same bytes.
 */
export function standardView(
  type: StandardType,
  definitions: Record<string, TargetDefinition> = registry,
): Target {
  const view = (Object.keys(definitions) as Target[]).find((target) =>
    readsStandard(definitions[target], type),
  );
  if (!view) throw new Error(`No target reads the ${standardOf(type)} standard`);
  return view;
}
