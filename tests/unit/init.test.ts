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

    // .gitignore should have overrides pattern
    const gitignore = await readFile(join(tempDir, ".gitignore"), "utf-8");
    expect(gitignore).toContain("universal-ai-config.overrides.*");

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

  it("does not create old hardcoded example files", async () => {
    await runCommand(initCommand, { rawArgs: ["--root", tempDir] });

    const templatesDir = join(tempDir, ".universal-ai-config");

    // The old hardcoded example.md should NOT exist
    await expect(stat(join(templatesDir, "instructions/example.md"))).rejects.toThrow();

    // The old hardcoded agents/code-reviewer.md should NOT exist
    await expect(stat(join(templatesDir, "agents/code-reviewer.md"))).rejects.toThrow();
  });
});
