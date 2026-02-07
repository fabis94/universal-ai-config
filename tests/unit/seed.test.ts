import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { mkdtemp, rm, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { runCommand } from "citty";
import seedCommand from "../../src/commands/seed.js";

describe("seed meta-instructions", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "uac-seed-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("creates all 8 template files", async () => {
    await runCommand(seedCommand, { rawArgs: ["meta-instructions", "--root", tempDir] });

    const templatesDir = join(tempDir, ".universal-ai-config");

    // Instruction - template guide
    const guide = await readFile(join(templatesDir, "instructions/uac-template-guide.md"), "utf-8");
    expect(guide).toContain(
      "description: Guide for creating and managing universal-ai-config templates",
    );
    expect(guide).toContain('globs: [".universal-ai-config/**"]');

    // Instruction - uac usage
    const usage = await readFile(join(templatesDir, "instructions/uac-usage.md"), "utf-8");
    expect(usage).toContain("alwaysApply: true");
    expect(usage).toContain("uac generate");
    expect(usage).toContain("uac init");
    expect(usage).toContain("<%= config.templatesDir %>");

    // Dispatcher skill
    const dispatcher = await readFile(
      join(templatesDir, "skills/update-ai-config/SKILL.md"),
      "utf-8",
    );
    expect(dispatcher).toContain("name: update-ai-config");
    expect(dispatcher).toContain("/update-instruction");
    expect(dispatcher).toContain("/update-skill");
    expect(dispatcher).toContain("/update-agent");
    expect(dispatcher).toContain("/update-hook");

    // Type-specific skills
    const instruction = await readFile(
      join(templatesDir, "skills/update-instruction/SKILL.md"),
      "utf-8",
    );
    expect(instruction).toContain("name: update-instruction");
    expect(instruction).toContain("alwaysApply");
    expect(instruction).toContain("globs");

    const skill = await readFile(join(templatesDir, "skills/update-skill/SKILL.md"), "utf-8");
    expect(skill).toContain("name: update-skill");
    expect(skill).toContain("SKILL.md");
    expect(skill).toContain("Supporting Files");

    const agent = await readFile(join(templatesDir, "skills/update-agent/SKILL.md"), "utf-8");
    expect(agent).toContain("name: update-agent");
    expect(agent).toContain("Cursor does not support agents");

    const hook = await readFile(join(templatesDir, "skills/update-hook/SKILL.md"), "utf-8");
    expect(hook).toContain("name: update-hook");
    expect(hook).toContain("sessionStart");
    expect(hook).toContain("preToolUse");

    // Import skill
    const importSkill = await readFile(
      join(templatesDir, "skills/import-existing-ai-config/SKILL.md"),
      "utf-8",
    );
    expect(importSkill).toContain("name: import-existing-ai-config");
    expect(importSkill).toContain("claude");
    expect(importSkill).toContain("copilot");
    expect(importSkill).toContain("cursor");
  });

  it("overwrites existing files", async () => {
    const templatesDir = join(tempDir, ".universal-ai-config");
    const guidePath = join(templatesDir, "instructions/uac-template-guide.md");

    // Create the file first with custom content
    await mkdir(join(templatesDir, "instructions"), { recursive: true });
    await writeFile(guidePath, "my custom content", "utf-8");

    await runCommand(seedCommand, { rawArgs: ["meta-instructions", "--root", tempDir] });

    // File should be overwritten with seed content
    const content = await readFile(guidePath, "utf-8");
    expect(content).not.toBe("my custom content");
    expect(content).toContain(
      "description: Guide for creating and managing universal-ai-config templates",
    );
  });

  it("respects custom templatesDir from config", async () => {
    // Create a config file with custom templates dir
    const configContent = `export default { templatesDir: "custom-ai-config" };\n`;
    await writeFile(join(tempDir, "universal-ai-config.config.mjs"), configContent, "utf-8");

    await runCommand(seedCommand, { rawArgs: ["meta-instructions", "--root", tempDir] });

    const customDir = join(tempDir, "custom-ai-config");
    const guide = await readFile(join(customDir, "instructions/uac-template-guide.md"), "utf-8");
    expect(guide).toContain('globs: ["custom-ai-config/**"]');

    // Verify the dispatcher references the template guide via EJS helper (resolved at generate time)
    const dispatcher = await readFile(join(customDir, "skills/update-ai-config/SKILL.md"), "utf-8");
    expect(dispatcher).toContain("<%= instructionPath('uac-template-guide') %>");
  });

  it("template content uses template path helpers", async () => {
    await runCommand(seedCommand, { rawArgs: ["meta-instructions", "--root", tempDir] });

    const templatesDir = join(tempDir, ".universal-ai-config");

    // All skills should reference templates via EJS path helpers (resolved at generate time)
    const updateInstruction = await readFile(
      join(templatesDir, "skills/update-instruction/SKILL.md"),
      "utf-8",
    );
    expect(updateInstruction).toContain("<%= instructionTemplatePath() %>");

    const updateSkill = await readFile(join(templatesDir, "skills/update-skill/SKILL.md"), "utf-8");
    expect(updateSkill).toContain("<%= skillTemplatePath() %>");

    const updateAgent = await readFile(join(templatesDir, "skills/update-agent/SKILL.md"), "utf-8");
    expect(updateAgent).toContain("<%= agentTemplatePath() %>");

    const updateHook = await readFile(join(templatesDir, "skills/update-hook/SKILL.md"), "utf-8");
    expect(updateHook).toContain("<%= hookTemplatePath() %>");
  });

  it("renders EJS example tags escaped (not evaluated)", async () => {
    await runCommand(seedCommand, { rawArgs: ["meta-instructions", "--root", tempDir] });

    const templatesDir = join(tempDir, ".universal-ai-config");
    const guide = await readFile(join(templatesDir, "instructions/uac-template-guide.md"), "utf-8");

    // EJS examples should appear as literal EJS tags, not be evaluated
    expect(guide).toContain("<%= target %>");
    expect(guide).toContain("<%= type %>");
    expect(guide).toContain("<%= config.templatesDir %>");
  });
});
