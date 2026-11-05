import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_CONFIG } from "../../config/defaults.js";
import type { TemplateType } from "../../types.js";
import { renderTemplate, getSeedTemplatesDir, collectSkillTemplates } from "../shared.js";
import type { SeedTemplate } from "../shared.js";

const TEMPLATES_DIR = getSeedTemplatesDir("examples");

/** Flat example files of one type: `.md` ones EJS-rendered, `.json` ones copied as-is. */
function flatTemplates(
  type: "instructions" | "agents" | "hooks",
  vars: Record<string, string>,
): SeedTemplate[] {
  const dir = join(TEMPLATES_DIR, type);
  const extension = type === "hooks" ? ".json" : ".md";
  return readdirSync(dir)
    .filter((file) => file.endsWith(extension))
    .map((file) => ({
      relativePath: `${type}/${file}`,
      content:
        extension === ".md"
          ? renderTemplate(join(dir, file), vars)
          : readFileSync(join(dir, file), "utf-8"),
    }));
}

/** The example templates, without those of types left out of `types`. */
export function getTemplates(
  templatesDir: string,
  types: readonly TemplateType[] = DEFAULT_CONFIG.types,
): SeedTemplate[] {
  const vars = { templatesDir };
  const templates: SeedTemplate[] = [];

  if (types.includes("instructions")) templates.push(...flatTemplates("instructions", vars));
  if (types.includes("skills")) {
    templates.push(...collectSkillTemplates(join(TEMPLATES_DIR, "skills"), vars));
  }
  if (types.includes("agents")) templates.push(...flatTemplates("agents", vars));
  if (types.includes("hooks")) templates.push(...flatTemplates("hooks", vars));

  return templates;
}
