import { readdirSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_CONFIG } from "../../config/defaults.js";
import type { TemplateType } from "../../types.js";
import {
  renderTemplate,
  getSeedTemplatesDir,
  collectDocTemplates,
  collectSkillTemplates,
} from "../shared.js";
import type { SeedTemplate } from "../shared.js";

const TEMPLATES_DIR = getSeedTemplatesDir("meta-instructions");

/** The meta-instruction templates, without those of types left out of `types`. */
export function getTemplates(
  templatesDir: string,
  types: readonly TemplateType[] = DEFAULT_CONFIG.types,
): SeedTemplate[] {
  const vars = { templatesDir };
  const templates: SeedTemplate[] = [];

  // Instructions: flat .md files
  if (types.includes("instructions")) {
    const instructionsDir = join(TEMPLATES_DIR, "instructions");
    for (const file of readdirSync(instructionsDir)) {
      if (!file.endsWith(".md")) continue;
      templates.push({
        relativePath: `instructions/${file}`,
        content: renderTemplate(join(instructionsDir, file), vars),
      });
    }
  }

  // Skills: flat .md files and/or directories with SKILL.md + extras
  if (types.includes("skills")) {
    templates.push(...collectSkillTemplates(join(TEMPLATES_DIR, "skills"), vars));
  }

  // Reference docs: not a template type, so always seeded. Rendered once here,
  // never by generate — linked via docPath()
  templates.push(...collectDocTemplates(join(TEMPLATES_DIR, "docs"), vars));

  return templates;
}
