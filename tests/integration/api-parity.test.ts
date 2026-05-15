import { describe, it, expect, afterEach } from "vitest";
import { join } from "node:path";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { generate } from "../../src/core/generate.js";
import { writeGeneratedFiles, cleanTargetFiles } from "../../src/core/writer.js";

const FIXTURES_DIR = join(import.meta.dirname, "../fixtures/basic-project");

describe("programmatic API parity", () => {
  const tempDirs: string[] = [];

  async function createTempDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "uac-api-test-"));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(async () => {
    for (const dir of tempDirs) {
      await rm(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  it("generate + writeGeneratedFiles writes files to disk", async () => {
    const tempDir = await createTempDir();

    // Generate with default outputDirs (relative paths like ".claude")
    const files = await generate({
      root: FIXTURES_DIR,
      targets: ["claude"],
      types: ["instructions"],
    });
    expect(files.length).toBeGreaterThan(0);

    // Write to temp dir instead of fixture dir
    await writeGeneratedFiles(files, tempDir);

    for (const file of files) {
      const content = await readFile(join(tempDir, file.path), "utf-8");
      expect(content).toBe(file.content);
    }
  });

  it("cleanTargetFiles does not throw when nothing to clean", async () => {
    const tempDir = await createTempDir();
    await expect(cleanTargetFiles(tempDir, ["claude"])).resolves.toEqual([]);
  });

  it("cleanTargetFiles removes generated files", async () => {
    const tempDir = await createTempDir();

    // Generate and write files to temp dir
    const files = await generate({
      root: FIXTURES_DIR,
      targets: ["claude"],
      types: ["instructions"],
      overrides: {
        outputDirs: { claude: ".claude" },
      },
    });
    await writeGeneratedFiles(files, tempDir);

    // Verify at least one file was written
    const firstFile = files[0]!;
    await expect(readFile(join(tempDir, firstFile.path), "utf-8")).resolves.toBeTruthy();

    // Clean and verify removal
    await cleanTargetFiles(tempDir, ["claude"]);
    await expect(readFile(join(tempDir, firstFile.path), "utf-8")).rejects.toThrow();
  });

  it("full workflow without config file using only overrides", async () => {
    const files = await generate({
      root: FIXTURES_DIR,
      targets: ["claude"],
      types: ["instructions", "skills", "agents"],
      overrides: {
        exclude: ["agents/reviewer.md"],
      },
    });

    expect(files.length).toBeGreaterThan(0);
    // Agents should be excluded
    expect(files.find((f) => f.type === "agents")).toBeUndefined();
    // Instructions and skills should still be present
    expect(files.find((f) => f.type === "instructions")).toBeDefined();
    expect(files.find((f) => f.type === "skills")).toBeDefined();
  });

  describe("codex", () => {
    it("generate + writeGeneratedFiles writes codex files to disk", async () => {
      const tempDir = await createTempDir();
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["codex"],
        types: ["instructions", "skills", "agents", "hooks", "mcp"],
      });
      expect(files.length).toBeGreaterThan(0);

      await writeGeneratedFiles(files, tempDir);

      // Each file lands at the path declared on the GeneratedFile (root-relative).
      for (const file of files) {
        const fullPath = join(tempDir, file.path);
        await expect(readFile(fullPath, "utf-8")).resolves.toBeTruthy();
      }
    });

    it("cleanTargetFiles does not throw when codex has nothing to clean", async () => {
      const tempDir = await createTempDir();
      await expect(cleanTargetFiles(tempDir, ["codex"])).resolves.toEqual([]);
    });

    it("cleanTargetFiles removes codex outputs including .agents/skills/ and root AGENTS.md", async () => {
      const tempDir = await createTempDir();
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["codex"],
        types: ["instructions", "skills", "agents", "hooks", "mcp"],
      });
      await writeGeneratedFiles(files, tempDir);

      // Sanity: expected outputs exist on disk
      await expect(readFile(join(tempDir, "AGENTS.md"), "utf-8")).resolves.toBeTruthy();
      await expect(
        readFile(join(tempDir, ".agents/skills/test-gen/SKILL.md"), "utf-8"),
      ).resolves.toBeTruthy();
      await expect(
        readFile(join(tempDir, ".codex/agents/reviewer.toml"), "utf-8"),
      ).resolves.toBeTruthy();
      await expect(readFile(join(tempDir, ".codex/config.toml"), "utf-8")).resolves.toBeTruthy();
      await expect(readFile(join(tempDir, ".codex/hooks.json"), "utf-8")).resolves.toBeTruthy();

      await cleanTargetFiles(tempDir, ["codex"]);

      // Wholly-uac-managed files removed
      await expect(readFile(join(tempDir, "AGENTS.md"), "utf-8")).rejects.toThrow();
      await expect(
        readFile(join(tempDir, ".agents/skills/test-gen/SKILL.md"), "utf-8"),
      ).rejects.toThrow();
      await expect(
        readFile(join(tempDir, ".codex/agents/reviewer.toml"), "utf-8"),
      ).rejects.toThrow();
      await expect(readFile(join(tempDir, ".codex/hooks.json"), "utf-8")).rejects.toThrow();
      // config.toml had only mcp_servers (no user keys) so it gets removed too
      await expect(readFile(join(tempDir, ".codex/config.toml"), "utf-8")).rejects.toThrow();
    });

    it("partial cleanup: user-added keys in .codex/config.toml are preserved", async () => {
      const tempDir = await createTempDir();
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["codex"],
        types: ["mcp"],
      });
      await writeGeneratedFiles(files, tempDir);

      // User adds a [profiles.dev] section to config.toml after generate
      const { writeFile } = await import("node:fs/promises");
      const configPath = join(tempDir, ".codex/config.toml");
      const existing = await readFile(configPath, "utf-8");
      await writeFile(configPath, existing + '\n[profiles.dev]\nmodel = "gpt-5.4"\n', "utf-8");

      await cleanTargetFiles(tempDir, ["codex"]);

      // Config still exists; mcp_servers gone, profiles.dev preserved
      const after = await readFile(configPath, "utf-8");
      expect(after).not.toContain("[mcp_servers.");
      expect(after).toContain("[profiles.dev]");
      expect(after).toContain('model = "gpt-5.4"');
    });
  });
});
