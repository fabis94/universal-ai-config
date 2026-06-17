import { readdir, readFile, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { parseFrontmatter } from "./parser.js";

/** A skill discovered on disk: a directory containing a valid `SKILL.md`. */
export interface DiscoveredSkill {
  /** Kebab-cased skill name — used as the output template directory name */
  name: string;
  /** Description from frontmatter (empty string if absent) */
  description: string;
  /** Absolute path to the directory containing SKILL.md */
  dir: string;
}

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", "__pycache__"]);
const MAX_DEPTH = 5;

/** Normalize a skill name into a safe kebab-cased directory name. */
export function normalizeSkillName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function hasSkillMd(dir: string): Promise<boolean> {
  try {
    return (await stat(join(dir, "SKILL.md"))).isFile();
  } catch {
    return false;
  }
}

/**
 * Collect directories containing a `SKILL.md`. A directory with a SKILL.md is
 * treated as a leaf skill — we do not descend into it (its subdirectories are
 * supporting files, not nested skills).
 */
async function findSkillDirs(dir: string, depth = 0): Promise<string[]> {
  if (depth > MAX_DEPTH) return [];
  if (await hasSkillMd(dir)) return [dir];

  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const nested = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && !SKIP_DIRS.has(entry.name))
      .map((entry) => findSkillDirs(join(dir, entry.name), depth + 1)),
  );
  return nested.flat();
}

async function readSkill(skillDir: string): Promise<DiscoveredSkill | null> {
  let content: string;
  try {
    content = await readFile(join(skillDir, "SKILL.md"), "utf-8");
  } catch {
    return null;
  }

  const { frontmatter } = parseFrontmatter(content);
  const rawName = frontmatter.name;
  if (typeof rawName !== "string" || rawName.trim() === "") {
    return null;
  }

  const name = normalizeSkillName(rawName) || normalizeSkillName(basename(skillDir));
  if (!name) return null;

  const description = typeof frontmatter.description === "string" ? frontmatter.description : "";
  return { name, description, dir: skillDir };
}

/**
 * Discover all skills under `rootDir` (optionally scoped to `subpath`).
 * Results are de-duplicated by name and sorted alphabetically.
 */
export async function discoverSkills(
  rootDir: string,
  subpath?: string,
): Promise<DiscoveredSkill[]> {
  const searchPath = subpath ? join(rootDir, subpath) : rootDir;
  const dirs = await findSkillDirs(searchPath);

  const skills: DiscoveredSkill[] = [];
  const seen = new Set<string>();
  for (const dir of dirs) {
    const skill = await readSkill(dir);
    if (skill && !seen.has(skill.name)) {
      seen.add(skill.name);
      skills.push(skill);
    }
  }

  skills.sort((a, b) => a.name.localeCompare(b.name));
  return skills;
}

/** Filter skills by user-supplied names (case-insensitive, matches name or dir basename). */
export function filterSkillsByName(skills: DiscoveredSkill[], names: string[]): DiscoveredSkill[] {
  const wanted = new Set(names.map((name) => normalizeSkillName(name)).filter(Boolean));
  return skills.filter(
    (skill) => wanted.has(skill.name) || wanted.has(normalizeSkillName(basename(skill.dir))),
  );
}
