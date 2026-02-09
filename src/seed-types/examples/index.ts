import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { renderTemplate, getSeedTemplatesDir } from "../shared.js";
import type { SeedTemplate } from "../shared.js";

const TEMPLATES_DIR = getSeedTemplatesDir("examples");

export function getTemplates(templatesDir: string): SeedTemplate[] {
  const vars = { templatesDir };
  const templates: SeedTemplate[] = [];

  // Instructions: flat .md files
  const instructionsDir = join(TEMPLATES_DIR, "instructions");
  for (const file of readdirSync(instructionsDir)) {
    if (!file.endsWith(".md")) continue;
    templates.push({
      relativePath: `instructions/${file}`,
      content: renderTemplate(join(instructionsDir, file), vars),
    });
  }

  // Skills: each .md file becomes a skill directory with SKILL.md
  const skillsDir = join(TEMPLATES_DIR, "skills");
  for (const file of readdirSync(skillsDir)) {
    if (!file.endsWith(".md")) continue;
    const skillName = file.replace(/\.md$/, "");
    templates.push({
      relativePath: `skills/${skillName}/SKILL.md`,
      content: renderTemplate(join(skillsDir, file), vars),
    });
  }

  // Agents: flat .md files
  const agentsDir = join(TEMPLATES_DIR, "agents");
  for (const file of readdirSync(agentsDir)) {
    if (!file.endsWith(".md")) continue;
    templates.push({
      relativePath: `agents/${file}`,
      content: renderTemplate(join(agentsDir, file), vars),
    });
  }

  // Hooks: flat .json files (no EJS rendering)
  const hooksDir = join(TEMPLATES_DIR, "hooks");
  for (const file of readdirSync(hooksDir)) {
    if (!file.endsWith(".json")) continue;
    templates.push({
      relativePath: `hooks/${file}`,
      content: readFileSync(join(hooksDir, file), "utf-8"),
    });
  }

  return templates;
}
