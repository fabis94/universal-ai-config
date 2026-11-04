import { describe, it, expect, afterEach } from "vitest";
import { dirname, join } from "node:path";
import { mkdtemp, mkdir, rm, readFile, writeFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { generate } from "../../src/core/generate/index.js";
import { writeGeneratedFiles, cleanTargetFiles } from "../../src/core/writer.js";

const FIXTURES_DIR = join(import.meta.dirname, "../fixtures/basic-project");
const OVERRIDES_FIXTURE_DIR = join(import.meta.dirname, "../fixtures/codex-overrides-project");

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

  describe("type-scoped cleaning (--type + --clean)", () => {
    async function exists(path: string): Promise<boolean> {
      return access(path).then(
        () => true,
        () => false,
      );
    }

    it("cleans only the requested type, leaving other types intact", async () => {
      const tempDir = await createTempDir();
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["claude"],
        types: ["instructions", "skills", "agents"],
      });
      await writeGeneratedFiles(files, tempDir);

      // Sanity: all three type dirs exist
      expect(await exists(join(tempDir, ".claude/rules"))).toBe(true);
      expect(await exists(join(tempDir, ".claude/skills"))).toBe(true);
      expect(await exists(join(tempDir, ".claude/agents"))).toBe(true);

      await cleanTargetFiles(tempDir, ["claude"], ["skills"]);

      // Only skills removed; instructions + agents untouched
      expect(await exists(join(tempDir, ".claude/skills"))).toBe(false);
      expect(await exists(join(tempDir, ".claude/rules"))).toBe(true);
      expect(await exists(join(tempDir, ".claude/agents"))).toBe(true);
    });

    it("with no types specified still removes everything (back-compat)", async () => {
      const tempDir = await createTempDir();
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["claude"],
        types: ["instructions", "skills", "agents"],
      });
      await writeGeneratedFiles(files, tempDir);

      await cleanTargetFiles(tempDir, ["claude"]);

      expect(await exists(join(tempDir, ".claude/rules"))).toBe(false);
      expect(await exists(join(tempDir, ".claude/skills"))).toBe(false);
      expect(await exists(join(tempDir, ".claude/agents"))).toBe(false);
    });

    it("gates the Claude settings.json hooks special-case on the hooks type", async () => {
      const tempDir = await createTempDir();
      const settingsPath = join(tempDir, ".claude/settings.json");
      const { mkdir } = await import("node:fs/promises");
      await mkdir(join(tempDir, ".claude"), { recursive: true });
      const settings = { hooks: { PreToolUse: [] }, otherKey: "keep" };
      await writeFile(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf-8");

      // Cleaning a different type must not strip hooks
      await cleanTargetFiles(tempDir, ["claude"], ["skills"]);
      expect(JSON.parse(await readFile(settingsPath, "utf-8"))).toHaveProperty("hooks");

      // Cleaning hooks strips the hooks key (other keys preserved)
      await cleanTargetFiles(tempDir, ["claude"], ["hooks"]);
      const after = JSON.parse(await readFile(settingsPath, "utf-8"));
      expect(after).not.toHaveProperty("hooks");
      expect(after).toHaveProperty("otherKey", "keep");
    });
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

    it("type-scoped clean gates the config.toml mcp_servers special-case", async () => {
      const tempDir = await createTempDir();
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["codex"],
        types: ["mcp"],
      });
      await writeGeneratedFiles(files, tempDir);
      const configPath = join(tempDir, ".codex/config.toml");
      await expect(readFile(configPath, "utf-8")).resolves.toContain("[mcp_servers.");

      // Cleaning a non-mcp type leaves the mcp_servers table intact
      await cleanTargetFiles(tempDir, ["codex"], ["skills"]);
      await expect(readFile(configPath, "utf-8")).resolves.toContain("[mcp_servers.");

      // Cleaning mcp removes it
      await cleanTargetFiles(tempDir, ["codex"], ["mcp"]);
      await expect(readFile(configPath, "utf-8")).rejects.toThrow();
    });

    describe("glob-derived AGENTS.override.md cleanup", () => {
      async function exists(path: string): Promise<boolean> {
        return access(path).then(
          () => true,
          () => false,
        );
      }

      /** Hand-write a file that no template derives — i.e. an orphan. */
      async function writeFileAt(tempDir: string, rel: string): Promise<string> {
        const full = join(tempDir, rel);
        await mkdir(dirname(full), { recursive: true });
        await writeFile(full, "stale", "utf-8");
        return full;
      }

      it("generate writes plain nested AGENTS.md files, never overrides", async () => {
        const files = await generate({
          root: OVERRIDES_FIXTURE_DIR,
          targets: ["codex"],
          types: ["instructions"],
        });
        const paths = files.map((f) => f.path).sort();
        expect(paths).toEqual([
          "AGENTS.md",
          "packages/app/lib/tests/AGENTS.md",
          "packages/frontend/AGENTS.md",
        ]);
      });

      it("removes override files uac 2.x generated, at any depth", async () => {
        const tempDir = await createTempDir();
        await writeFileAt(tempDir, "packages/frontend/AGENTS.override.md");
        await writeFileAt(tempDir, "packages/app/lib/tests/AGENTS.override.md");

        const cleaned = await cleanTargetFiles(tempDir, ["codex"]);

        expect(await exists(join(tempDir, "packages/frontend/AGENTS.override.md"))).toBe(false);
        expect(await exists(join(tempDir, "packages/app/lib/tests/AGENTS.override.md"))).toBe(
          false,
        );
        expect(cleaned).toContain("packages/frontend/AGENTS.override.md");
        expect(cleaned).toContain("packages/app/lib/tests/AGENTS.override.md");
        // The directories themselves are user source — never removed
        expect(await exists(join(tempDir, "packages/frontend"))).toBe(true);
      });

      it("removes an orphan no template derives anymore", async () => {
        // The regression guard for the whole design: after a template's `globs`
        // change (or the template is deleted, or codex is dropped from
        // `targets`), the old path is no longer derivable from frontmatter.
        // Only a filesystem scan finds it.
        const tempDir = await createTempDir();
        const orphan = await writeFileAt(tempDir, "packages/legacy/AGENTS.override.md");

        const cleaned = await cleanTargetFiles(tempDir, ["codex"]);

        expect(await exists(orphan)).toBe(false);
        expect(cleaned).toEqual(["packages/legacy/AGENTS.override.md"]);
      });

      it("does not scan when instructions are out of --type scope", async () => {
        const tempDir = await createTempDir();
        const orphan = await writeFileAt(tempDir, "pkg/AGENTS.override.md");

        await cleanTargetFiles(tempDir, ["codex"], ["skills"]);

        expect(await exists(orphan)).toBe(true);
      });

      it("does not scan for a non-codex target", async () => {
        const tempDir = await createTempDir();
        const orphan = await writeFileAt(tempDir, "pkg/AGENTS.override.md");

        await cleanTargetFiles(tempDir, ["claude"]);

        expect(await exists(orphan)).toBe(true);
      });

      it("scans by default when no targets are given", async () => {
        const tempDir = await createTempDir();
        const orphan = await writeFileAt(tempDir, "pkg/AGENTS.override.md");

        await cleanTargetFiles(tempDir);

        expect(await exists(orphan)).toBe(false);
      });

      it("skips vendored copies inside node_modules", async () => {
        const tempDir = await createTempDir();
        const real = await writeFileAt(tempDir, "packages/app/AGENTS.override.md");
        const vendored = await writeFileAt(tempDir, "node_modules/some-dep/AGENTS.override.md");

        await cleanTargetFiles(tempDir, ["codex"]);

        expect(await exists(real)).toBe(false);
        expect(await exists(vendored)).toBe(true);
      });

      it("skips override files inside templatesDir, which are inputs not artifacts", async () => {
        const tempDir = await createTempDir();
        const template = await writeFileAt(
          tempDir,
          ".universal-ai-config/skills/x/AGENTS.override.md",
        );
        const artifact = await writeFileAt(tempDir, "pkg/AGENTS.override.md");

        await cleanTargetFiles(tempDir, ["codex"], undefined, {
          templatesDir: ".universal-ai-config",
        });

        expect(await exists(template)).toBe(true);
        expect(await exists(artifact)).toBe(false);
      });
    });
  });

  describe("preserveOnClean", () => {
    async function exists(path: string): Promise<boolean> {
      return access(path).then(
        () => true,
        () => false,
      );
    }

    it("keeps a hand-authored root AGENTS.md while removing the rest of codex output", async () => {
      const tempDir = await createTempDir();
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["codex"],
        types: ["instructions", "skills"],
      });
      await writeGeneratedFiles(files, tempDir);
      expect(await exists(join(tempDir, "AGENTS.md"))).toBe(true);

      const preserved: string[] = [];
      const cleaned = await cleanTargetFiles(tempDir, ["codex"], undefined, {
        preserveOnClean: ["AGENTS.md"],
        onPreserve: (p) => preserved.push(p),
      });

      expect(await exists(join(tempDir, "AGENTS.md"))).toBe(true);
      expect(await exists(join(tempDir, ".agents/skills/test-gen/SKILL.md"))).toBe(false);
      expect(cleaned).not.toContain("AGENTS.md");
      expect(preserved).toEqual(["AGENTS.md"]);
    });

    it("only reports preserved paths that actually exist", async () => {
      const tempDir = await createTempDir();
      const preserved: string[] = [];

      await cleanTargetFiles(tempDir, ["codex"], undefined, {
        preserveOnClean: ["AGENTS.md", "CLAUDE.md"],
        onPreserve: (p) => preserved.push(p),
      });

      expect(preserved).toEqual([]);
    });

    it("deletes a directory's other contents when a file inside it is preserved", async () => {
      const tempDir = await createTempDir();
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["claude"],
        types: ["skills"],
      });
      await writeGeneratedFiles(files, tempDir);

      // A skill the user maintains by hand next to the generated ones
      const manualDir = join(tempDir, ".claude/skills/manual");
      await mkdir(manualDir, { recursive: true });
      await writeFile(join(manualDir, "SKILL.md"), "hand-written", "utf-8");

      const preserved: string[] = [];
      await cleanTargetFiles(tempDir, ["claude"], undefined, {
        preserveOnClean: [".claude/skills/manual/**"],
        onPreserve: (p) => preserved.push(p),
      });

      expect(await exists(join(manualDir, "SKILL.md"))).toBe(true);
      expect(await exists(join(tempDir, ".claude/skills/test-gen"))).toBe(false);
      expect(preserved).toEqual([".claude/skills/manual/SKILL.md"]);
    });

    it("keeps hooks in a preserved settings.json", async () => {
      const tempDir = await createTempDir();
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["claude"],
        types: ["hooks"],
      });
      await writeGeneratedFiles(files, tempDir);
      const settingsPath = join(tempDir, ".claude/settings.json");
      expect(JSON.parse(await readFile(settingsPath, "utf-8"))).toHaveProperty("hooks");

      await cleanTargetFiles(tempDir, ["claude"], undefined, {
        preserveOnClean: [".claude/settings.json"],
      });

      expect(JSON.parse(await readFile(settingsPath, "utf-8"))).toHaveProperty("hooks");
    });

    it("keeps a preserved AGENTS.override.md found by the scan", async () => {
      const tempDir = await createTempDir();
      const keepPath = join(tempDir, "packages/keep/AGENTS.override.md");
      const dropPath = join(tempDir, "packages/drop/AGENTS.override.md");
      await mkdir(dirname(keepPath), { recursive: true });
      await mkdir(dirname(dropPath), { recursive: true });
      await writeFile(keepPath, "mine", "utf-8");
      await writeFile(dropPath, "generated", "utf-8");

      await cleanTargetFiles(tempDir, ["codex"], undefined, {
        preserveOnClean: ["packages/keep/**"],
      });

      expect(await exists(keepPath)).toBe(true);
      expect(await exists(dropPath)).toBe(false);
    });

    it("resolves per-target preserve patterns", async () => {
      const tempDir = await createTempDir();
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["codex"],
        types: ["instructions"],
      });
      await writeGeneratedFiles(files, tempDir);

      // Preserve only applies to claude — codex's AGENTS.md is still removed
      await cleanTargetFiles(tempDir, ["codex"], undefined, {
        preserveOnClean: { claude: ["AGENTS.md"] },
      });

      expect(await exists(join(tempDir, "AGENTS.md"))).toBe(false);
    });
  });

  describe("dry-run cleaning", () => {
    async function exists(path: string): Promise<boolean> {
      return access(path).then(
        () => true,
        () => false,
      );
    }

    it("reports paths without deleting anything", async () => {
      const tempDir = await createTempDir();
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["codex"],
        types: ["instructions", "skills", "agents"],
      });
      await writeGeneratedFiles(files, tempDir);
      const orphanDir = join(tempDir, "packages/legacy");
      await mkdir(orphanDir, { recursive: true });
      await writeFile(join(orphanDir, "AGENTS.override.md"), "stale", "utf-8");

      const cleaned = await cleanTargetFiles(tempDir, ["codex"], undefined, { dryRun: true });

      expect(cleaned).toContain("AGENTS.md");
      expect(cleaned).toContain(".agents/skills");
      expect(cleaned).toContain("packages/legacy/AGENTS.override.md");
      expect(await exists(join(tempDir, "AGENTS.md"))).toBe(true);
      expect(await exists(join(tempDir, ".agents/skills/test-gen/SKILL.md"))).toBe(true);
      expect(await exists(join(orphanDir, "AGENTS.override.md"))).toBe(true);
    });

    it("leaves hooks in settings.json untouched", async () => {
      const tempDir = await createTempDir();
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["claude"],
        types: ["hooks"],
      });
      await writeGeneratedFiles(files, tempDir);
      const settingsPath = join(tempDir, ".claude/settings.json");

      const cleaned = await cleanTargetFiles(tempDir, ["claude"], ["hooks"], { dryRun: true });

      expect(cleaned).toContain(join(".claude", "settings.json"));
      expect(JSON.parse(await readFile(settingsPath, "utf-8"))).toHaveProperty("hooks");
    });

    it("leaves the mcp_servers table in .codex/config.toml untouched", async () => {
      const tempDir = await createTempDir();
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["codex"],
        types: ["mcp"],
      });
      await writeGeneratedFiles(files, tempDir);
      const configPath = join(tempDir, ".codex/config.toml");

      await cleanTargetFiles(tempDir, ["codex"], ["mcp"], { dryRun: true });

      await expect(readFile(configPath, "utf-8")).resolves.toContain("[mcp_servers.");
    });
  });

  describe("outputDirs-aware cleaning", () => {
    async function exists(path: string): Promise<boolean> {
      return access(path).then(
        () => true,
        () => false,
      );
    }

    it("cleans the configured output dir rather than the target default", async () => {
      const tempDir = await createTempDir();
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["claude"],
        types: ["instructions"],
        overrides: { outputDirs: { claude: ".custom-claude" } },
      });
      await writeGeneratedFiles(files, tempDir);
      expect(await exists(join(tempDir, ".custom-claude/rules"))).toBe(true);

      await cleanTargetFiles(tempDir, ["claude"], undefined, {
        outputDirs: { claude: ".custom-claude" },
      });

      expect(await exists(join(tempDir, ".custom-claude/rules"))).toBe(false);
    });
  });
});
