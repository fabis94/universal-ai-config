import { readFile } from "node:fs/promises";
import { join, posix } from "node:path";
import { targets } from "../../../targets/index.js";
import { AGENTS_MD } from "../../agents-md/index.js";
import { checkClaudeMd, checkCodexBudget } from "../../agents-md/checks.js";
import { findFilesOutsideInputs, templateDirsWithin } from "../../clean/agents-files.js";
import type { OutputPlan } from "../../plan/build-plan.js";
import { AGENT_SKILLS_DIR } from "../../plan/standards.js";
import type { Target } from "../../../types.js";
import type { GenerateRun } from "../context.js";

/**
 * Every skills folder a tool loads, own or `.agents/skills`: a skill may ship
 * an AGENTS.md as an extra file, which is not one of the project's
 * instruction files.
 */
function skillFolders(run: GenerateRun): string[] {
  const folders = new Set<string>([AGENT_SKILLS_DIR]);
  for (const target of Object.keys(targets) as Target[]) {
    const skills = run.locator.typeConfig(target, "skills");
    if (skills) folders.add(skills.typeDir(run.locator.pathContext(target)));
  }
  return [...folders];
}

/** The project's own AGENTS.md files, root first, then nested ones in path order. */
async function findAgentsMdSources(run: GenerateRun): Promise<string[]> {
  const templateDirs = templateDirsWithin(run.root, [
    run.config.templatesDir,
    ...run.config.additionalTemplateDirs,
  ]);
  const inSkillFolder = (path: string) =>
    skillFolders(run).some((folder) => path.startsWith(`${folder}/`));
  const found = await findFilesOutsideInputs(run.root, AGENTS_MD, templateDirs);
  return found
    .filter((path) => !inSkillFolder(path))
    .sort((a, b) => (a === AGENTS_MD ? -1 : b === AGENTS_MD ? 1 : a < b ? -1 : 1));
}

/**
 * Instructions come from the project's AGENTS.md files: every tool that reads
 * them (`native`) gets nothing generated. What's left is checking that the
 * files reach each tool — and saying so for a tool that can't read them
 * (`copy`: no current target), since uac has no conversion for it.
 */
export async function checkAgentsMdSources(run: GenerateRun, plan: OutputPlan): Promise<void> {
  const readers = plan.targets.filter(
    (target) => plan.outputFor(target, "instructions").kind === "native",
  );
  for (const target of plan.targets) {
    if (plan.outputFor(target, "instructions").kind !== "copy") continue;
    run.sink.report({
      code: "unsupported",
      target,
      type: "instructions",
      message: `doesn't read AGENTS.md, and uac can't give it instructions from the project's AGENTS.md files`,
      detail: { kind: "type", name: "instructions" },
    });
  }
  if (readers.length === 0) return;

  const sources = await findAgentsMdSources(run);
  if (!sources.includes(AGENTS_MD)) {
    run.sink.report({
      code: "agents-md-missing",
      type: "instructions",
      message: `instructions come from AGENTS.md files (\`standards\`), but the project has no root AGENTS.md`,
      detail: {},
    });
  }

  if (readers.includes("codex")) {
    const files = await Promise.all(
      sources.map(async (path) => ({
        path,
        content: await readFile(join(run.root, ...path.split(posix.sep)), "utf-8"),
      })),
    );
    checkCodexBudget(files, run.sink.scoped("codex", "instructions"), "hand-written");
  }
  if (readers.includes("claude")) {
    await checkClaudeMd(run.root, run.sink.scoped("claude", "instructions"), {
      source: "hand-written",
      nested: sources.filter((path) => path !== AGENTS_MD),
    });
  }
}
