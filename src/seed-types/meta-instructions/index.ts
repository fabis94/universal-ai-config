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

/** Which types the project keeps in an open standard, as the seed sources see it (EJS `standards`). */
interface SeedStandards {
  instructions: boolean;
  skills: boolean;
}

const TEMPLATE_MODE: SeedStandards = { instructions: false, skills: false };

/**
 * The meta-instruction templates, without those of types left out of `types`,
 * after the seed's EJS pass. Paths are relative to the templates dir; where a
 * file finally goes is up to `planMetaInstructions`.
 *
 * @param standards the types read from a standard: the sources branch on it
 *   (`<% if (standards.skills) { %>`) where locations or wording differ
 */
export function getTemplates(
  templatesDir: string,
  types: readonly TemplateType[] = DEFAULT_CONFIG.types,
  standards: SeedStandards = TEMPLATE_MODE,
): SeedTemplate[] {
  const vars = {
    templatesDir,
    standards,
    // How skills link the template guide. A skill in .agents/skills is read by
    // every tool, so it links the guide's source, not one tool's copy of it
    guidePathHelper: standards.skills ? "instructionTemplatePath" : "instructionPath",
  };
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
