import type { OutputPlan } from "../../plan/build-plan.js";
import { AGENT_SKILLS_DIR, standardOf, type StandardType } from "../../plan/standards.js";
import { toPosixPath } from "../../plan/locate.js";
import type { GeneratedFile } from "../../../types.js";
import type { GenerateRun } from "../context.js";
import type { TemplateSlot } from "../discover.js";
import type { FileReader } from "../read-cache.js";
import { checkAgentsMdSources } from "./agents-md.js";
import { generateSkillCopies } from "./skills.js";

/**
 * The second half of generate: types the project keeps in an open standard
 * (`standards`) instead of uac templates. Nothing here renders templates;
 * the template pipeline never sees these types.
 */

const SOURCE_LOCATION: Record<StandardType, string> = {
  instructions: "the project's AGENTS.md files",
  skills: AGENT_SKILLS_DIR,
};

/**
 * Take the templates of every type read from a standard out of `slots`, and
 * report them once per type: uac ignores them, so they'd otherwise vanish
 * without a word.
 */
export function setAsideSourcedTemplates(
  run: GenerateRun,
  plan: OutputPlan,
  slots: Map<string, TemplateSlot>,
): void {
  const ignored = new Map<StandardType, string[]>();
  for (const [key, slot] of slots) {
    const type = slot.type as StandardType;
    if (!plan.sourced.has(type)) continue;
    slots.delete(key);
    const paths = ignored.get(type) ?? [];
    paths.push(...slot.candidates.map((candidate) => toPosixPath(candidate.displayPath)));
    ignored.set(type, paths);
  }
  for (const [type, paths] of ignored) {
    const one = paths.length === 1;
    run.sink.report({
      code: "standard-ignored",
      type,
      message:
        `${type} come from ${SOURCE_LOCATION[type]} (\`standards\`), so uac ignores ${one ? "this template" : `these ${paths.length} templates`}. ` +
        `Move ${one ? "it" : "them"} there or delete ${one ? "it" : "them"} (\`uac seed meta-instructions\` moves uac's own).`,
      detail: { standard: standardOf(type), paths },
    });
  }
}

/** Copies and checks for the types read from a standard. */
export async function generateFromStandards(
  run: GenerateRun,
  plan: OutputPlan,
  reader: FileReader,
): Promise<GeneratedFile[]> {
  const files: GeneratedFile[] = [];
  if (plan.sourced.has("skills")) files.push(...(await generateSkillCopies(run, plan, reader)));
  if (plan.sourced.has("instructions")) await checkAgentsMdSources(run, plan);
  return files;
}
