import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
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

export function renderTemplate(filePath: string, vars: Record<string, string>): string {
  const raw = readFileSync(filePath, "utf-8");
  return ejs.render(raw, vars);
}

export function getSeedTemplatesDir(seedTypeName: string): string {
  return join(findPackageRoot(), "src", "seed-types", seedTypeName, "templates");
}

/** Recursively collect all files in a directory, returning paths relative to the base dir */
function collectFilesSync(
  dir: string,
  base: string = dir,
): { relativePath: string; filePath: string }[] {
  const results: { relativePath: string; filePath: string }[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      results.push(...collectFilesSync(fullPath, base));
    } else if (stats.isFile()) {
      results.push({ relativePath: relative(base, fullPath), filePath: fullPath });
    }
  }
  return results;
}

/**
 * Collect seed templates from a skills directory.
 * Handles both flat .md files (legacy) and directories with SKILL.md + extras.
 */
export function collectSkillTemplates(
  skillsDir: string,
  vars: Record<string, string>,
): SeedTemplate[] {
  const templates: SeedTemplate[] = [];

  for (const entry of readdirSync(skillsDir)) {
    const entryPath = join(skillsDir, entry);
    const stats = statSync(entryPath);

    if (stats.isFile() && entry.endsWith(".md")) {
      // Flat .md file → becomes skills/{name}/SKILL.md
      const skillName = entry.replace(/\.md$/, "");
      templates.push({
        relativePath: `skills/${skillName}/SKILL.md`,
        content: renderTemplate(entryPath, vars),
      });
    } else if (stats.isDirectory()) {
      // Directory → collect SKILL.md + extra files
      const skillFile = join(entryPath, "SKILL.md");
      if (!existsSync(skillFile)) continue;

      const allFiles = collectFilesSync(entryPath);
      for (const file of allFiles) {
        const isMarkdown = file.relativePath.endsWith(".md");
        templates.push({
          relativePath: `skills/${entry}/${file.relativePath}`,
          content: isMarkdown
            ? renderTemplate(file.filePath, vars)
            : readFileSync(file.filePath, "utf-8"),
        });
      }
    }
  }

  return templates;
}
