import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { mkdtemp, rm, readFile, writeFile, stat, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { runCommand } from "citty";
import initCommand from "../../src/commands/init/index.js";
import { loadProjectConfig } from "../../src/config/loader.js";
import { UAC_VERSION } from "../../src/version.js";

// Tests have no terminal, so init runs its no-prompt path: flags answer every question.
describe("init command (no terminal)", () => {
  let tempDir: string;

  const init = (...args: string[]) =>
    runCommand(initCommand, { rawArgs: ["--root", tempDir, ...args] });
  const read = (rel: string) => readFile(join(tempDir, rel), "utf-8");
  const exists = (rel: string) =>
    stat(join(tempDir, rel)).then(
      () => true,
      () => false,
    );

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "uac-init-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("creates a config listing every target that loads without uac installed", async () => {
    await init();

    const configContent = await read("universal-ai-config.config.ts");
    expect(configContent).toContain('import type { UserConfig } from "universal-ai-config";');
    expect(configContent).toContain('targets: ["claude", "copilot", "cursor", "codex"]');
    // tmpdir has no node_modules: the type-only import must not need resolving
    const config = await loadProjectConfig({ root: tempDir });
    expect(config.targets).toEqual(["claude", "copilot", "cursor", "codex"]);
  });

  it("writes the .gitignore block for every output", async () => {
    await init();

    const gitignore = await read(".gitignore");
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
    // Only uac's hooks file — hook scripts in .github/hooks must stay committable
    expect(gitignore).toContain(".github/hooks/hooks.json");
    expect(gitignore).not.toContain(".github/hooks/\n");
    // Cursor output dirs
    expect(gitignore).toContain(".cursor/rules/");
    expect(gitignore).toContain(".cursor/skills/");
    expect(gitignore).toContain(".cursor/hooks.json");
    // Codex: uac's own files, not the whole .codex/ folder
    expect(gitignore).toContain(".codex/agents/");
    expect(gitignore).toContain(".codex/hooks.json");
    expect(gitignore).toContain(".codex/config.toml");
    expect(gitignore).not.toContain(".codex/\n");
    // Claude settings.json (hooks merge target)
    expect(gitignore).toContain(".claude/settings.json");
    // MCP output files (root-relative)
    expect(gitignore).toContain(".mcp.json");
    expect(gitignore).not.toContain(".vscode/mcp.json");
    expect(gitignore).toContain(".cursor/mcp.json");
    // AGENTS.md (every one) and the index variation's folder
    expect(gitignore).toContain("\nAGENTS.md\n");
    expect(gitignore).toContain("/.agents/uac-instructions/");
    // Should NOT gitignore entire dirs
    expect(gitignore).not.toContain(".github\n");
  });

  it("seeds the meta-instructions and records the uac version", async () => {
    await init();

    const guide = await read(".universal-ai-config/instructions/uac-template-guide.md");
    expect(guide).toContain(
      "description: Guide for creating and managing universal-ai-config templates",
    );
    // Reference docs are seeded alongside, for docPath() links to resolve
    expect(await read(".universal-ai-config/docs/uac/hooks.md")).toContain("# Hooks reference");
    expect((await read(".universal-ai-config/.uac-version")).trim()).toBe(UAC_VERSION);
  });

  it("does not overwrite an existing config file", async () => {
    await writeFile(join(tempDir, "universal-ai-config.config.ts"), "// my custom config\n");

    await init();

    expect(await read("universal-ai-config.config.ts")).toBe("// my custom config\n");
  });

  it("does not add a .ts config next to a config with another extension", async () => {
    await writeFile(join(tempDir, "universal-ai-config.config.json"), "{}\n");

    await init();

    expect(await exists("universal-ai-config.config.ts")).toBe(false);
  });

  it("appends the block to an existing .gitignore, preserving user content", async () => {
    await writeFile(join(tempDir, ".gitignore"), "node_modules/\n.env\n");

    await init();

    const gitignore = await read(".gitignore");
    expect(gitignore).toContain("node_modules/");
    expect(gitignore).toContain(".env");
    expect(gitignore).toContain("# >>> universal-ai-config >>>");
    expect(gitignore).toContain(".claude/rules/");
  });

  it("replaces the block on re-run instead of duplicating it", async () => {
    await init();
    await init();

    const second = await read(".gitignore");
    expect(second.match(/# >>> universal-ai-config >>>/g)?.length).toBe(1);
    expect(second.match(/# <<< universal-ai-config <<</g)?.length).toBe(1);
    expect(second).toContain(".claude/rules/");
  });

  it("adds example templates only with --examples", async () => {
    await init();
    expect(await exists(".universal-ai-config/agents/code-reviewer.md")).toBe(false);
    expect(await exists(".universal-ai-config/instructions/example.md")).toBe(false);

    await init("--examples");
    expect(await exists(".universal-ai-config/agents/code-reviewer.md")).toBe(true);
    expect(await exists(".universal-ai-config/instructions/example.md")).toBe(true);
  });

  it("keeps edited meta-instructions on re-run unless --reseed", async () => {
    await init();
    const guide = ".universal-ai-config/instructions/uac-template-guide.md";
    await writeFile(join(tempDir, guide), "my edit\n");

    await init();
    expect(await read(guide)).toBe("my edit\n");

    await init("--reseed");
    expect(await read(guide)).not.toBe("my edit\n");
  });

  it("follows the config's templatesDir and indexDir on re-run", async () => {
    await writeFile(
      join(tempDir, "universal-ai-config.config.json"),
      JSON.stringify({ templatesDir: "ai-templates", agentsMd: { indexDir: "docs/ai" } }),
    );

    await init();
    await init();

    expect(await exists("ai-templates/instructions/uac-usage.md")).toBe(true);
    expect(await exists(".universal-ai-config")).toBe(false);
    expect(await read(".gitignore")).toContain("\n/docs/ai/\n");
  });

  it("seeds and ignores only the types the config enables", async () => {
    await writeFile(
      join(tempDir, "universal-ai-config.config.json"),
      JSON.stringify({ types: ["skills"] }),
    );

    await init("--examples");

    const templates = await readdir(join(tempDir, ".universal-ai-config"));
    expect(templates.sort()).toEqual([".uac-version", "docs", "skills"]);
    const gitignore = await read(".gitignore");
    expect(gitignore).toContain(".claude/skills/");
    expect(gitignore).not.toContain(".claude/rules/");
    expect(gitignore).not.toContain("AGENTS.md");
    expect(gitignore).not.toContain(".claude/settings.json");
    expect(gitignore).not.toContain("uac-instructions");
    expect(gitignore).toContain("universal-ai-config.overrides.*");
  });

  describe("--target", () => {
    it("writes this machine's overrides file, which loads", async () => {
      await init("--target", "claude,cursor");

      expect(await read("universal-ai-config.overrides.ts")).toContain(
        'targets: ["claude", "cursor"]',
      );
      const config = await loadProjectConfig({ root: tempDir });
      expect(config.targets).toEqual(["claude", "cursor"]);
    });

    it("keeps an existing overrides file unless --force", async () => {
      await writeFile(
        join(tempDir, "universal-ai-config.overrides.json"),
        JSON.stringify({ targets: ["codex"] }),
      );

      await init("--target", "claude");
      expect(await exists("universal-ai-config.overrides.ts")).toBe(false);

      await init("--target", "claude", "--force");
      // The old spelling is removed: the loader reads only one overrides file
      expect(await exists("universal-ai-config.overrides.json")).toBe(false);
      expect((await loadProjectConfig({ root: tempDir })).targets).toEqual(["claude"]);
    });

    it("rejects unknown targets", async () => {
      await expect(init("--target", "zed")).rejects.toThrow('Unknown target "zed"');
    });
  });

  it("refreshes a stale .gitignore block on an existing project", async () => {
    await init();
    const stale = (await read(".gitignore")).replace(".claude/rules/\n", "");
    await writeFile(join(tempDir, ".gitignore"), stale);

    await init();

    expect(await read(".gitignore")).toContain(".claude/rules/");
  });
});
