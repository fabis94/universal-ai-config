import { cp, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { simpleGit } from "simple-git";
import { parseSkillSource } from "./skill-source.js";
import { discoverSkills, filterSkillsByName, type DiscoveredSkill } from "./skill-discovery.js";
import { safePath } from "./safe-path.js";

export interface FetchSkillsOptions {
  /** Branch/tag/commit override, used when the source string carries no ref */
  ref?: string;
}

export interface FetchedSkills {
  skills: DiscoveredSkill[];
  /** Removes any temporary clone; a no-op for local sources. Always safe to call. */
  cleanup: () => Promise<void>;
}

export interface InstalledSkill {
  name: string;
  /** Absolute path the skill was written to */
  dest: string;
  /** True when an existing skill of the same name was overwritten */
  updated: boolean;
}

const noop = async (): Promise<void> => {};

/**
 * Resolve a skill source (GitHub repo or local path) and discover the skills it
 * contains. GitHub sources are shallow-cloned into a temp directory; call the
 * returned `cleanup` when done (e.g. in a `finally`).
 */
export async function fetchSkills(
  source: string,
  options: FetchSkillsOptions = {},
): Promise<FetchedSkills> {
  const parsed = parseSkillSource(source);

  let baseDir: string;
  let cleanup = noop;

  if (parsed.type === "local") {
    baseDir = parsed.localPath;
    let isDir = false;
    try {
      isDir = (await stat(baseDir)).isDirectory();
    } catch {
      throw new Error(`Local source not found: ${baseDir}`);
    }
    if (!isDir) {
      throw new Error(`Local source is not a directory: ${baseDir}`);
    }
  } else {
    const tempDir = await mkdtemp(join(tmpdir(), "uac-skill-"));
    cleanup = () => rm(tempDir, { recursive: true, force: true });
    const ref = parsed.ref ?? options.ref;
    try {
      // Inherit the user's git environment (SSH keys, credential helpers) as-is.
      // `-c credential.interactive=false` keeps clones non-interactive without
      // forwarding a custom env, which simple-git would screen for unsafe vars.
      await simpleGit().clone(parsed.cloneUrl, tempDir, [
        "--depth",
        "1",
        "--config",
        "credential.interactive=false",
        ...(ref ? ["--branch", ref] : []),
      ]);
    } catch (error) {
      await cleanup();
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to clone ${parsed.cloneUrl}: ${message}`);
    }
    baseDir = tempDir;
  }

  let skills = await discoverSkills(baseDir, parsed.subpath);
  if (parsed.skillFilter) {
    skills = filterSkillsByName(skills, [parsed.skillFilter]);
  }

  return { skills, cleanup };
}

/**
 * Copy a discovered skill into `skillsDir` as `<skillsDir>/<name>/`. Idempotent:
 * an existing skill of the same name is removed first (clean override → no stale
 * files) and the operation reports whether it replaced an existing skill.
 */
export async function installSkill(
  skill: DiscoveredSkill,
  skillsDir: string,
): Promise<InstalledSkill> {
  const dest = safePath(skillsDir, skill.name);

  let updated = false;
  try {
    await stat(dest);
    updated = true;
  } catch {
    // No existing skill — this is a fresh add.
  }

  await rm(dest, { recursive: true, force: true });
  await cp(skill.dir, dest, { recursive: true });

  return { name: skill.name, dest, updated };
}
