import { describe, it, expect, afterEach } from "vitest";
import { join } from "node:path";
import { mkdtemp, mkdir, rm, readFile, writeFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fetchSkills, installSkill } from "../../src/core/add-skill.js";

const FIXTURE = join(import.meta.dirname, "../fixtures/remote-skills-repo");

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

describe("fetchSkills + installSkill (local source)", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    for (const dir of tempDirs) await rm(dir, { recursive: true, force: true });
    tempDirs.length = 0;
  });

  async function createSkillsDir(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "uac-add-skill-"));
    tempDirs.push(root);
    const skillsDir = join(root, ".universal-ai-config", "skills");
    await mkdir(skillsDir, { recursive: true });
    return skillsDir;
  }

  it("discovers skills from a local source without installing (list)", async () => {
    const { skills, cleanup } = await fetchSkills(FIXTURE);
    try {
      expect(skills.map((s) => s.name)).toEqual(["alpha-skill", "beta-skill"]);
    } finally {
      await cleanup();
    }
  });

  it("installs a single skill including supporting files", async () => {
    const skillsDir = await createSkillsDir();
    const { skills, cleanup } = await fetchSkills(FIXTURE);
    try {
      const alpha = skills.find((s) => s.name === "alpha-skill")!;
      const result = await installSkill(alpha, skillsDir);

      expect(result.updated).toBe(false);
      expect(result.dest).toBe(join(skillsDir, "alpha-skill"));

      const skillMd = await readFile(join(skillsDir, "alpha-skill/SKILL.md"), "utf-8");
      expect(skillMd).toContain("name: alpha-skill");

      // Supporting file copied alongside SKILL.md
      const notes = await readFile(join(skillsDir, "alpha-skill/references/notes.md"), "utf-8");
      expect(notes).toContain("Alpha references");
    } finally {
      await cleanup();
    }
  });

  it("installs all discovered skills (--all)", async () => {
    const skillsDir = await createSkillsDir();
    const { skills, cleanup } = await fetchSkills(FIXTURE);
    try {
      for (const skill of skills) await installSkill(skill, skillsDir);

      expect(await exists(join(skillsDir, "alpha-skill/SKILL.md"))).toBe(true);
      expect(await exists(join(skillsDir, "beta-skill/SKILL.md"))).toBe(true);
    } finally {
      await cleanup();
    }
  });

  it("is idempotent: re-adding overrides and removes stale files", async () => {
    const skillsDir = await createSkillsDir();

    // Seed an older version of alpha-skill with a stale file.
    const dest = join(skillsDir, "alpha-skill");
    await mkdir(dest, { recursive: true });
    await writeFile(join(dest, "SKILL.md"), "stale content\n");
    await writeFile(join(dest, "old-file.md"), "remove me\n");

    const { skills, cleanup } = await fetchSkills(FIXTURE);
    try {
      const alpha = skills.find((s) => s.name === "alpha-skill")!;
      const result = await installSkill(alpha, skillsDir);

      expect(result.updated).toBe(true);

      // Stale file is gone, fresh content is present.
      expect(await exists(join(dest, "old-file.md"))).toBe(false);
      const skillMd = await readFile(join(dest, "SKILL.md"), "utf-8");
      expect(skillMd).toContain("name: alpha-skill");
      expect(skillMd).not.toContain("stale content");
    } finally {
      await cleanup();
    }
  });

  it("throws a clear error for a missing local source", async () => {
    await expect(fetchSkills(join(FIXTURE, "does-not-exist"))).rejects.toThrow(/not found/);
  });
});
