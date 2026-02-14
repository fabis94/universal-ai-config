import { readdirSync } from "node:fs";
import { join } from "node:path";
import { renderTemplate, getSeedTemplatesDir, collectSkillTemplates } from "../shared.js";
import type { SeedTemplate } from "../shared.js";

const TEMPLATES_DIR = getSeedTemplatesDir("meta-instructions");

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

  // Skills: flat .md files and/or directories with SKILL.md + extras
  templates.push(...collectSkillTemplates(join(TEMPLATES_DIR, "skills"), vars));

  return templates;
}
