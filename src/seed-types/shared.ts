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

/** Variables of a seed's EJS pass. */
type SeedVars = Record<string, unknown>;

export function renderTemplate(filePath: string, vars: SeedVars): string {
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
export function collectSkillTemplates(skillsDir: string, vars: SeedVars): SeedTemplate[] {
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

/**
 * Collect seed templates from a docs directory. Every file is copied to
 * `docs/<relative path>`; `.md` files are EJS-rendered once with `vars`.
 *
 * Docs are never touched by `uac generate`, so this seed-time render is their
 * only pass — unlike instructions and skills, which are rendered again at
 * generate time. Generate-time helpers (`docPath`, `instructionPath`, …) are
 * not available here.
 */
export function collectDocTemplates(docsDir: string, vars: SeedVars): SeedTemplate[] {
  return collectFilesSync(docsDir).map((file) => ({
    relativePath: `docs/${file.relativePath.split("\\").join("/")}`,
    content: file.relativePath.endsWith(".md")
      ? renderTemplate(file.filePath, vars)
      : readFileSync(file.filePath, "utf-8"),
  }));
}

/** The two lines that delimit a block uac owns inside a file the project also edits. */
export interface BlockMarkers {
  start: string;
  end: string;
}

/** Where a marked block sits in `text`, markers included. */
export function findBlock(
  text: string,
  markers: BlockMarkers,
): { start: number; end: number } | undefined {
  const start = text.indexOf(markers.start);
  const endMarker = text.indexOf(markers.end);
  if (start === -1 || endMarker === -1) return undefined;
  return { start, end: endMarker + markers.end.length };
}

/** `content` between the markers, as one block. */
export function wrapBlock(content: string, markers: BlockMarkers): string {
  return `${markers.start}\n${content.trimEnd()}\n${markers.end}`;
}

/**
 * `text` with `block` (markers included) in place of its existing block, or
 * appended after a blank line when it has none. Everything outside the block
 * is left as it is.
 */
export function upsertBlock(text: string, block: string, markers: BlockMarkers): string {
  const range = findBlock(text, markers);
  if (range) return `${text.slice(0, range.start)}${block}${text.slice(range.end)}`;
  if (!text) return `${block}\n`;
  const sep = text.endsWith("\n") ? "\n" : "\n\n";
  return `${text}${sep}${block}\n`;
}
