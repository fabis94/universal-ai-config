import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { join } from "node:path";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { DEFAULT_CONFIG } from "../../src/config/defaults.js";
import { runSeed } from "../../src/commands/seed.js";
import { buildGitignoreBlock, gitignoreBlockState } from "../../src/seed-types/gitignore/index.js";
import { getTemplates as metaTemplates } from "../../src/seed-types/meta-instructions/index.js";
import { getTemplates as exampleTemplates } from "../../src/seed-types/examples/index.js";
import {
  metaInstructionsDrift,
  readSeedStamp,
} from "../../src/seed-types/meta-instructions/state.js";
import type { TemplateType } from "../../src/types.js";
import { UAC_VERSION } from "../../src/version.js";

const config = (types: TemplateType[], indexDir = ".agents/uac-instructions") => ({
  ...DEFAULT_CONFIG,
  types,
  agentsMd: { ...DEFAULT_CONFIG.agentsMd, indexDir },
});

const topDirs = (paths: string[]) => [...new Set(paths.map((p) => p.split("/")[0]))].sort();

describe("seed sets skip types left out of `types`", () => {
  it("meta-instructions keep the docs, drop the disabled types", () => {
    const paths = metaTemplates(".universal-ai-config", ["skills"]).map((t) => t.relativePath);
    expect(topDirs(paths)).toEqual(["docs", "skills"]);
  });

  it("examples seed only the enabled types", () => {
    const all = exampleTemplates(".universal-ai-config").map((t) => t.relativePath);
    expect(topDirs(all)).toEqual(["agents", "hooks", "instructions", "skills"]);
    const some = exampleTemplates(".universal-ai-config", ["agents", "hooks"]);
    expect(topDirs(some.map((t) => t.relativePath))).toEqual(["agents", "hooks"]);
  });

  it("the .gitignore block leaves out the outputs of disabled types", () => {
    const block = buildGitignoreBlock(config(["skills", "mcp"]));
    expect(block).toContain(".claude/skills/");
    expect(block).toContain(".agents/skills/");
    expect(block).toContain(".mcp.json");
    expect(block).toContain(".codex/config.toml");
    expect(block).toContain("/universal-ai-config.overrides.*");
    for (const pattern of [
      ".claude/rules/",
      "AGENTS.md",
      ".claude/settings.json",
      ".codex/agents/",
    ]) {
      expect(block).not.toContain(pattern);
    }
    // The index dir holds instructions
    expect(block).not.toContain("uac-instructions");
  });
});

describe("tmp project", () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "uac-seed-types-"));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  describe("gitignoreBlockState", () => {
    it("is missing without a uac block", async () => {
      expect(await gitignoreBlockState(root, config(["skills"]))).toEqual({ status: "missing" });
      await writeFile(join(root, ".gitignore"), "node_modules/\n");
      expect(await gitignoreBlockState(root, config(["skills"]))).toEqual({ status: "missing" });
    });

    it("is current right after seeding, and stale once the config changes what it ignores", async () => {
      await runSeed("gitignore", root, config(DEFAULT_CONFIG.types), { quiet: true });
      expect(await gitignoreBlockState(root, config(DEFAULT_CONFIG.types))).toEqual({
        status: "current",
      });

      const withoutHooks = config(["instructions", "skills", "agents", "mcp"]);
      expect(await gitignoreBlockState(root, withoutHooks)).toEqual({
        status: "stale",
        added: [],
        removed: [
          ".claude/settings.json",
          ".github/hooks/hooks.json",
          ".cursor/hooks.json",
          ".codex/hooks.json",
        ],
      });

      const movedIndex = config(DEFAULT_CONFIG.types, "docs/ai");
      expect(await gitignoreBlockState(root, movedIndex)).toEqual({
        status: "stale",
        added: ["/docs/ai/"],
        removed: ["/.agents/uac-instructions/"],
      });
    });

    it("re-seeding an up-to-date block leaves .gitignore untouched", async () => {
      await writeFile(join(root, ".gitignore"), "dist/\n");
      await runSeed("gitignore", root, config(["skills"]), { quiet: true });
      const first = await readFile(join(root, ".gitignore"), "utf-8");
      await runSeed("gitignore", root, config(["skills"]), { quiet: true });
      expect(await readFile(join(root, ".gitignore"), "utf-8")).toBe(first);
    });
  });

  describe("meta-instructions stamp and drift", () => {
    const seedConfig = { ...DEFAULT_CONFIG };

    it("seeding records the uac version", async () => {
      expect(await readSeedStamp(root, seedConfig.templatesDir)).toBeUndefined();
      await runSeed("meta-instructions", root, seedConfig, { quiet: true });
      expect(await readSeedStamp(root, seedConfig.templatesDir)).toBe(UAC_VERSION);
    });

    it("counts missing and differing seeded files", async () => {
      const total = metaTemplates(seedConfig.templatesDir).length;
      expect(await metaInstructionsDrift(root, seedConfig)).toEqual({
        missing: total,
        differ: 0,
        misplaced: 0,
      });

      await runSeed("meta-instructions", root, seedConfig, { quiet: true });
      expect(await metaInstructionsDrift(root, seedConfig)).toEqual({
        missing: 0,
        differ: 0,
        misplaced: 0,
      });

      const guide = join(root, seedConfig.templatesDir, "instructions/uac-template-guide.md");
      await writeFile(guide, "edited\n");
      await rm(join(root, seedConfig.templatesDir, "docs/uac/hooks.md"));
      expect(await metaInstructionsDrift(root, seedConfig)).toEqual({
        missing: 1,
        differ: 1,
        misplaced: 0,
      });
    });
  });
});
