import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ownedByUac,
  readsStandard,
  resolvesIntoAgentSkills,
  sourcedTypes,
  writesIntoStandard,
} from "../../../src/core/plan/standards.js";
import { targets } from "../../../src/targets/index.js";
import type { StandardsSetting, Target, TemplateType } from "../../../src/types.js";

const ALL_TYPES: TemplateType[] = ["instructions", "skills", "agents", "hooks", "mcp"];
const facts = (standards: StandardsSetting, types: TemplateType[] = ALL_TYPES) => ({
  standards,
  types,
});

describe("sourcedTypes", () => {
  it("maps each setting to the types it sources", () => {
    expect([...sourcedTypes(facts(false))]).toEqual([]);
    expect([...sourcedTypes(facts(true))]).toEqual(["instructions", "skills"]);
    expect([...sourcedTypes(facts("instructions"))]).toEqual(["instructions"]);
    expect([...sourcedTypes(facts("skills"))]).toEqual(["skills"]);
  });

  it("only within `types`", () => {
    expect([...sourcedTypes(facts(true, ["skills", "hooks"]))]).toEqual(["skills"]);
    expect([...sourcedTypes(facts("instructions", ["skills"]))]).toEqual([]);
  });
});

describe("readsStandard — the target facts", () => {
  it.each([
    ["claude", true, false],
    ["copilot", true, true],
    ["cursor", true, true],
    ["codex", true, true],
  ] as const)("%s: AGENTS.md %s, .agents/skills %s", (target, agentsMd, agentSkills) => {
    expect(readsStandard(targets[target], "instructions")).toBe(agentsMd);
    expect(readsStandard(targets[target], "skills")).toBe(agentSkills);
  });
});

describe("ownedByUac — what clean removes and .gitignore ignores", () => {
  const owned = (standards: StandardsSetting, type: TemplateType) =>
    (["claude", "copilot", "cursor", "codex"] as Target[]).filter((t) =>
      ownedByUac(t, type, facts(standards)),
    );

  it("template mode: every target's own output", () => {
    for (const type of ALL_TYPES) {
      expect(owned(false, type)).toEqual(["claude", "copilot", "cursor", "codex"]);
    }
  });

  it("a sourced type: only the targets that get copies", () => {
    expect(owned(true, "instructions")).toEqual([]);
    expect(owned(true, "skills")).toEqual(["claude"]);
    expect(owned("skills", "instructions")).toEqual(["claude", "copilot", "cursor", "codex"]);
    expect(owned(true, "hooks")).toEqual(["claude", "copilot", "cursor", "codex"]);
  });
});

describe("writesIntoStandard — the generate guard", () => {
  it("anything in .agents/skills while skills are sourced", () => {
    const sourced = sourcedTypes(facts("skills"));
    expect(writesIntoStandard({ path: ".agents/skills/x/SKILL.md", type: "skills" }, sourced)).toBe(
      true,
    );
    expect(writesIntoStandard({ path: ".claude/skills/x/SKILL.md", type: "skills" }, sourced)).toBe(
      false,
    );
    expect(writesIntoStandard({ path: "AGENTS.md", type: "instructions" }, sourced)).toBe(false);
  });

  it("instruction outputs named AGENTS.md / AGENTS.override.md while instructions are sourced", () => {
    const sourced = sourcedTypes(facts("instructions"));
    expect(writesIntoStandard({ path: "AGENTS.md", type: "instructions" }, sourced)).toBe(true);
    expect(
      writesIntoStandard({ path: "a/AGENTS.override.md", type: "instructions" }, sourced),
    ).toBe(true);
    // A skill may ship an AGENTS.md as an extra file
    expect(
      writesIntoStandard({ path: ".claude/skills/x/AGENTS.md", type: "skills" }, sourced),
    ).toBe(false);
    expect(writesIntoStandard({ path: ".agents/skills/x/SKILL.md", type: "skills" }, sourced)).toBe(
      false,
    );
  });
});

describe("resolvesIntoAgentSkills — symlinks", () => {
  const roots: string[] = [];
  afterEach(async () => {
    for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
  });

  it("follows a committed .claude/skills → .agents/skills link", async () => {
    const root = await mkdtemp(join(tmpdir(), "uac-standards-"));
    roots.push(root);
    await mkdir(join(root, ".agents/skills/helper"), { recursive: true });
    await mkdir(join(root, ".claude"), { recursive: true });
    await symlink("../.agents/skills", join(root, ".claude/skills"));

    expect(await resolvesIntoAgentSkills(root, ".claude/skills")).toBe(true);
    expect(await resolvesIntoAgentSkills(root, ".claude/skills/helper/SKILL.md")).toBe(true);
    expect(await resolvesIntoAgentSkills(root, ".claude/agents")).toBe(false);
    expect(await resolvesIntoAgentSkills(root, ".agents/skills/new/SKILL.md")).toBe(true);
  });

  it("is false for a plain folder and for paths that don't exist yet", async () => {
    const root = await mkdtemp(join(tmpdir(), "uac-standards-"));
    roots.push(root);
    await mkdir(join(root, ".claude/skills"), { recursive: true });
    expect(await resolvesIntoAgentSkills(root, ".claude/skills")).toBe(false);
    expect(await resolvesIntoAgentSkills(root, ".cursor/skills/x/SKILL.md")).toBe(false);
  });
});
