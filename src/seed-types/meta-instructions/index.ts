import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import ejs from "ejs";

export interface SeedTemplate {
  relativePath: string;
  content: string;
}

function findPackageRoot(): string {
  let dir = import.meta.dirname;
  while (true) {
    if (existsSync(join(dir, "package.json"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("Could not find universal-ai-config package root");
}

const TEMPLATES_DIR = join(
  findPackageRoot(),
  "src",
  "seed-types",
  "meta-instructions",
  "templates",
);

function renderTemplate(filePath: string, vars: Record<string, string>): string {
  const raw = readFileSync(filePath, "utf-8");
  return ejs.render(raw, vars);
}

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

  return templates;
}
