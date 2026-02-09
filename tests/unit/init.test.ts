import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { mkdtemp, rm, readFile, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { runCommand } from "citty";
import initCommand from "../../src/commands/init.js";

describe("init command", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "uac-init-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("creates config file and seeds meta-instructions", async () => {
    await runCommand(initCommand, { rawArgs: ["--root", tempDir] });

    // Config file should exist
    const configContent = await readFile(join(tempDir, "universal-ai-config.config.ts"), "utf-8");
    expect(configContent).toContain("defineConfig");
    expect(configContent).toContain('targets: ["claude", "copilot", "cursor"]');

    // .gitignore should have block markers and output patterns
    const gitignore = await readFile(join(tempDir, ".gitignore"), "utf-8");
    expect(gitignore).toContain("# >>> universal-ai-config >>>");
    expect(gitignore).toContain("# <<< universal-ai-config <<<");
    expect(gitignore).toContain("universal-ai-config.overrides.*");
    // Claude output dirs
    expect(gitignore).toContain(".claude/rules/");
    expect(gitignore).toContain(".claude/skills/");
    expect(gitignore).toContain(".claude/agents/");
    // Copilot output dirs (specific subdirs, not all of .github/)
    expect(gitignore).toContain(".github/instructions/");
    expect(gitignore).toContain(".github/copilot-instructions.md");
    expect(gitignore).toContain(".github/skills/");
    expect(gitignore).toContain(".github/agents/");
    expect(gitignore).toContain(".github/hooks/");
    // Cursor output dirs
    expect(gitignore).toContain(".cursor/rules/");
    expect(gitignore).toContain(".cursor/skills/");
    expect(gitignore).toContain(".cursor/hooks.json");
    // Claude settings.json (hooks merge target)
    expect(gitignore).toContain(".claude/settings.json");
    // MCP output files (root-relative)
    expect(gitignore).toContain(".mcp.json");
    expect(gitignore).toContain(".vscode/mcp.json");
    expect(gitignore).toContain(".cursor/mcp.json");
    // Should NOT gitignore entire dirs
    expect(gitignore).not.toContain(".github\n");

    // Meta-instruction templates should exist (seeded by init)
    const templatesDir = join(tempDir, ".universal-ai-config");
    const guide = await readFile(join(templatesDir, "instructions/uac-template-guide.md"), "utf-8");
    expect(guide).toContain(
      "description: Guide for creating and managing universal-ai-config templates",
    );
  });

  it("does not overwrite existing config file", async () => {
    const configPath = join(tempDir, "universal-ai-config.config.ts");
    await writeFile(configPath, "// my custom config\n", "utf-8");

    await runCommand(initCommand, { rawArgs: ["--root", tempDir] });

    const content = await readFile(configPath, "utf-8");
    expect(content).toBe("// my custom config\n");
  });

  it("appends block to existing .gitignore preserving user content", async () => {
    const gitignorePath = join(tempDir, ".gitignore");
    await writeFile(gitignorePath, "node_modules/\n.env\n", "utf-8");

    await runCommand(initCommand, { rawArgs: ["--root", tempDir] });

    const gitignore = await readFile(gitignorePath, "utf-8");
    // Original content preserved
    expect(gitignore).toContain("node_modules/");
    expect(gitignore).toContain(".env");
    // Block added
    expect(gitignore).toContain("# >>> universal-ai-config >>>");
    expect(gitignore).toContain(".claude/rules/");
  });

  it("replaces existing block on re-run", async () => {
    // First init
    await runCommand(initCommand, { rawArgs: ["--root", tempDir] });

    const gitignorePath = join(tempDir, ".gitignore");
    const first = await readFile(gitignorePath, "utf-8");
    expect(first).toContain("# >>> universal-ai-config >>>");

    // Second init — should replace, not duplicate
    await runCommand(initCommand, { rawArgs: ["--root", tempDir] });

    const second = await readFile(gitignorePath, "utf-8");
    expect(second.match(/# >>> universal-ai-config >>>/g)?.length).toBe(1);
    expect(second.match(/# <<< universal-ai-config <<</g)?.length).toBe(1);
    expect(second).toContain(".claude/rules/");
  });

  it("does not create old hardcoded example files", async () => {
    await runCommand(initCommand, { rawArgs: ["--root", tempDir] });

    const templatesDir = join(tempDir, ".universal-ai-config");

    // The old hardcoded example.md should NOT exist
    await expect(stat(join(templatesDir, "instructions/example.md"))).rejects.toThrow();

    // The old hardcoded agents/code-reviewer.md should NOT exist
    await expect(stat(join(templatesDir, "agents/code-reviewer.md"))).rejects.toThrow();
  });
});
