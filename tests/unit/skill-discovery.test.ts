import { describe, it, expect, afterEach } from "vitest";
import { join } from "node:path";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  discoverSkills,
  filterSkillsByName,
  normalizeSkillName,
} from "../../src/core/skill-discovery.js";

const FIXTURE = join(import.meta.dirname, "../fixtures/remote-skills-repo");

describe("normalizeSkillName", () => {
  it("kebab-cases names with spaces and underscores", () => {
    expect(normalizeSkillName("My Cool_Skill")).toBe("my-cool-skill");
  });

  it("strips unsafe characters and collapses dashes", () => {
    expect(normalizeSkillName("  Foo!! / Bar  ")).toBe("foo-bar");
  });
});

describe("discoverSkills", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    for (const dir of tempDirs) await rm(dir, { recursive: true, force: true });
    tempDirs.length = 0;
  });

  async function createTempDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "uac-discover-"));
    tempDirs.push(dir);
    return dir;
  }

  it("discovers all skills under skills/ with name + description", async () => {
    const skills = await discoverSkills(FIXTURE);
    expect(skills.map((s) => s.name)).toEqual(["alpha-skill", "beta-skill"]);

    const alpha = skills.find((s) => s.name === "alpha-skill");
    expect(alpha?.description).toBe("First example skill for add-skill tests");
  });

  it("normalizes a non-kebab frontmatter name", async () => {
    const skills = await discoverSkills(FIXTURE);
    // beta-skill's frontmatter name is "Beta Skill"
    expect(skills.some((s) => s.name === "beta-skill")).toBe(true);
  });

  it("scopes discovery to a subpath", async () => {
    const skills = await discoverSkills(FIXTURE, "skills/alpha-skill");
    expect(skills.map((s) => s.name)).toEqual(["alpha-skill"]);
  });

  it("treats a skill dir as a leaf and skips node_modules/.git", async () => {
    const root = await createTempDir();
    // A real skill
    await mkdir(join(root, "skills/real"), { recursive: true });
    await writeFile(
      join(root, "skills/real/SKILL.md"),
      "---\nname: real\ndescription: real one\n---\nbody\n",
    );
    // A nested SKILL.md inside the real skill must NOT become its own skill
    await mkdir(join(root, "skills/real/nested"), { recursive: true });
    await writeFile(
      join(root, "skills/real/nested/SKILL.md"),
      "---\nname: nested\ndescription: should be ignored\n---\nbody\n",
    );
    // A SKILL.md inside node_modules must be skipped
    await mkdir(join(root, "node_modules/junk"), { recursive: true });
    await writeFile(
      join(root, "node_modules/junk/SKILL.md"),
      "---\nname: junk\ndescription: skip me\n---\nbody\n",
    );

    const skills = await discoverSkills(root);
    expect(skills.map((s) => s.name)).toEqual(["real"]);
  });

  it("ignores SKILL.md without a name", async () => {
    const root = await createTempDir();
    await mkdir(join(root, "skills/noname"), { recursive: true });
    await writeFile(
      join(root, "skills/noname/SKILL.md"),
      "---\ndescription: missing name\n---\nbody\n",
    );
    const skills = await discoverSkills(root);
    expect(skills).toEqual([]);
  });
});

describe("filterSkillsByName", () => {
  it("matches by name case-insensitively", async () => {
    const skills = await discoverSkills(FIXTURE);
    const filtered = filterSkillsByName(skills, ["ALPHA-SKILL"]);
    expect(filtered.map((s) => s.name)).toEqual(["alpha-skill"]);
  });

  it("matches non-kebab user input against normalized names", async () => {
    const skills = await discoverSkills(FIXTURE);
    const filtered = filterSkillsByName(skills, ["Beta Skill"]);
    expect(filtered.map((s) => s.name)).toEqual(["beta-skill"]);
  });

  it("returns empty for unknown names", async () => {
    const skills = await discoverSkills(FIXTURE);
    expect(filterSkillsByName(skills, ["nope"])).toEqual([]);
  });
});
