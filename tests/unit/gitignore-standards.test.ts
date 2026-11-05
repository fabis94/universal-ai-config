import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../../src/config/defaults.js";
import { buildGitignoreBlock } from "../../src/seed-types/gitignore/index.js";
import type { StandardsSetting } from "../../src/types.js";

const INSTRUCTION_OUTPUTS = [
  ".claude/rules/",
  ".cursor/rules/",
  ".github/instructions/",
  ".github/copilot-instructions.md",
];
const AGENTS_MD_OUTPUTS = ["AGENTS.md", "/.agents/uac-instructions/"];
const NATIVE_SKILL_FOLDERS = [".agents/skills/", ".cursor/skills/", ".github/skills/"];
const ALWAYS = [
  "/universal-ai-config.overrides.*",
  ".claude/*.local.*",
  ".claude/skills/",
  ".claude/agents/",
  ".claude/settings.json",
  ".github/agents/",
  ".github/hooks/hooks.json",
  ".cursor/agents/",
  ".cursor/hooks.json",
  ".codex/agents/",
  ".codex/hooks.json",
  ".codex/config.toml",
  ".mcp.json",
  ".cursor/mcp.json",
];

const lines = (standards: StandardsSetting) =>
  buildGitignoreBlock({ ...DEFAULT_CONFIG, standards }).split("\n");

describe(".gitignore block — standards", () => {
  it("template mode ignores every output", () => {
    const block = lines(false);
    for (const pattern of [
      ...INSTRUCTION_OUTPUTS,
      ...AGENTS_MD_OUTPUTS,
      ...NATIVE_SKILL_FOLDERS,
      ...ALWAYS,
    ]) {
      expect(block).toContain(pattern);
    }
  });

  it("standards: true never ignores the standards or the folders of tools that read them", () => {
    const block = lines(true);
    for (const pattern of [...INSTRUCTION_OUTPUTS, ...AGENTS_MD_OUTPUTS, ...NATIVE_SKILL_FOLDERS]) {
      expect(block).not.toContain(pattern);
    }
    expect(block.join("\n")).not.toContain("index` variation");
    for (const pattern of ALWAYS) expect(block).toContain(pattern);
  });

  it('"instructions" keeps every skill folder ignored', () => {
    const block = lines("instructions");
    for (const pattern of [...INSTRUCTION_OUTPUTS, ...AGENTS_MD_OUTPUTS]) {
      expect(block).not.toContain(pattern);
    }
    for (const pattern of [...NATIVE_SKILL_FOLDERS, ...ALWAYS]) expect(block).toContain(pattern);
  });

  it('"skills" keeps the instruction outputs and AGENTS.md ignored', () => {
    const block = lines("skills");
    for (const pattern of NATIVE_SKILL_FOLDERS) expect(block).not.toContain(pattern);
    for (const pattern of [...INSTRUCTION_OUTPUTS, ...AGENTS_MD_OUTPUTS, ...ALWAYS]) {
      expect(block).toContain(pattern);
    }
  });

  it("standards on a type left out of `types` changes nothing more", () => {
    const block = buildGitignoreBlock({
      ...DEFAULT_CONFIG,
      types: ["agents", "hooks"],
      standards: true,
    });
    expect(block).toBe(buildGitignoreBlock({ ...DEFAULT_CONFIG, types: ["agents", "hooks"] }));
  });
});
