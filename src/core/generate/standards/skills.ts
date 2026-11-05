import { stat } from "node:fs/promises";
import { join, posix } from "node:path";
import { createExcludeMatcher } from "../../exclude.js";
import { parseFrontmatter } from "../../parser.js";
import type { OutputPlan } from "../../plan/build-plan.js";
import { AGENT_SKILLS_DIR, resolvesIntoAgentSkills } from "../../plan/standards.js";
import type { GeneratedFile, Target, UniversalFrontmatter } from "../../../types.js";
import type { GenerateRun } from "../context.js";
import { scanSkillFolders, type SkillFolder } from "../discover.js";
import type { FileReader } from "../read-cache.js";
import { checkSkillSpec } from "../skill-spec.js";

/** The paths `exclude` can address a `.agents/skills` skill by, for its copies. */
function excludePathsFor(name: string): string[] {
  return [`${AGENT_SKILLS_DIR}/${name}/SKILL.md`, `skills/${name}/SKILL.md`];
}

async function exists(path: string): Promise<boolean> {
  return (await stat(path).catch(() => undefined)) !== undefined;
}

/**
 * A tool that reads `.agents/skills` prefers a same-named skill in its own
 * folder (`.cursor/skills`, `.github/skills`), usually one generated in
 * template mode: the project's edits to the `.agents/skills` copy then never
 * reach that tool.
 */
async function checkShadowingCopies(
  run: GenerateRun,
  plan: OutputPlan,
  folders: SkillFolder[],
): Promise<void> {
  for (const target of plan.targets) {
    if (plan.outputFor(target, "skills").kind !== "native") continue;
    const own = run.locator.typeConfig(target, "skills")?.typeDir(run.locator.pathContext(target));
    if (!own || own === AGENT_SKILLS_DIR) continue;
    for (const folder of folders) {
      const path = posix.join(own, folder.name, "SKILL.md");
      if (!(await exists(join(run.root, path)))) continue;
      run.sink.report({
        code: "standard-shadowed",
        target,
        type: "skills",
        path,
        message:
          `${path} wins over ${AGENT_SKILLS_DIR}/${folder.name} in ${target}, so it doesn't see the project's skill. ` +
          `Delete it (\`uac clean --type skills\` before switching to standards removes the old generated copies).`,
        detail: { skill: folder.name, path },
      });
    }
  }
}

/** Every file of one skill, copied byte for byte into a target's skills folder. */
async function copySkill(
  folder: SkillFolder,
  target: Target,
  run: GenerateRun,
  plan: OutputPlan,
  reader: FileReader,
): Promise<GeneratedFile[]> {
  const dir = run.locator.skillDir(target, folder.name);
  const consumers = plan.consumersOf(target, "skills");
  const source = (relativePath: string) => posix.join(AGENT_SKILLS_DIR, folder.name, relativePath);

  const files: GeneratedFile[] = [
    {
      path: posix.join(dir, "SKILL.md"),
      content: await reader.bytes({ filePath: folder.skillFile }),
      target,
      type: "skills",
      sourcePath: source("SKILL.md"),
      consumers,
    },
  ];
  for (const extra of folder.extraFiles) {
    files.push({
      path: posix.join(dir, extra.relativePath),
      content: await reader.bytes(extra),
      mode: extra.mode,
      target,
      type: "skills",
      sourcePath: source(extra.relativePath),
      consumers,
    });
  }
  return files;
}

/**
 * Skills from `.agents/skills/` for the targets that don't read that folder
 * (`copy` in the plan). The files are copied as they are — no EJS, no
 * frontmatter mapping — because the tools that do read the folder load the
 * very same files. Each skill is checked against the Agent Skills spec once.
 */
export async function generateSkillCopies(
  run: GenerateRun,
  plan: OutputPlan,
  reader: FileReader,
): Promise<GeneratedFile[]> {
  const folders = await scanSkillFolders(join(run.root, AGENT_SKILLS_DIR));

  for (const folder of folders) {
    const { frontmatter } = parseFrontmatter(await reader.text({ filePath: folder.skillFile }));
    checkSkillSpec(
      folder.name,
      frontmatter as UniversalFrontmatter,
      posix.join(AGENT_SKILLS_DIR, folder.name, "SKILL.md"),
      (d) => run.sink.report(d),
    );
  }
  await checkShadowingCopies(run, plan, folders);

  const files: GeneratedFile[] = [];
  for (const target of plan.targets) {
    if (plan.outputFor(target, "skills").kind !== "copy") continue;
    // A committed link to .agents/skills already gives the tool every skill
    const typeDir = run.locator.typeDir(target, "skills");
    if (await resolvesIntoAgentSkills(run.root, typeDir)) {
      run.sink.report({
        code: "standard-linked",
        target,
        type: "skills",
        path: typeDir,
        message: `${typeDir} links into ${AGENT_SKILLS_DIR}, so ${target} already reads every skill there; uac copies nothing`,
        detail: { path: typeDir },
      });
      continue;
    }
    const isExcluded = createExcludeMatcher(run.config.exclude, target);
    for (const folder of folders) {
      if (excludePathsFor(folder.name).some((path) => isExcluded(path))) continue;
      files.push(...(await copySkill(folder, target, run, plan, reader)));
    }
  }
  return files;
}
