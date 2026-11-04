import { afterEach, describe, it, expect } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { userConfigSchema, defineConfig } from "../../src/config/schema.js";
import { loadProjectConfig } from "../../src/config/loader.js";

const BASIC_FIXTURES_DIR = join(import.meta.dirname, "../fixtures/basic-project");
const VARIABLES_FIXTURES_DIR = join(import.meta.dirname, "../fixtures/variables-project");

describe("userConfigSchema", () => {
  it("validates a complete config", () => {
    const config = {
      templatesDir: ".my-templates",
      targets: ["claude", "copilot"] as const,
      types: ["instructions", "skills"] as const,
      variables: { projectName: "test" },
      outputDirs: { claude: ".claude-custom" },
    };
    const result = userConfigSchema.parse(config);
    expect(result.templatesDir).toBe(".my-templates");
    expect(result.targets).toEqual(["claude", "copilot"]);
  });

  it("validates an empty config", () => {
    const result = userConfigSchema.parse({});
    expect(result.templatesDir).toBeUndefined();
    expect(result.targets).toBeUndefined();
  });

  it("rejects invalid target names", () => {
    expect(() => userConfigSchema.parse({ targets: ["invalid"] })).toThrow();
  });

  it("rejects invalid type names", () => {
    expect(() => userConfigSchema.parse({ types: ["invalid"] })).toThrow();
  });

  it("validates exclude as array of strings", () => {
    const result = userConfigSchema.parse({ exclude: ["agents/**", "hooks/skip.json"] });
    expect(result.exclude).toEqual(["agents/**", "hooks/skip.json"]);
  });

  it("validates exclude as per-target object", () => {
    const result = userConfigSchema.parse({
      exclude: {
        claude: ["agents/**"],
        default: [],
      },
    });
    expect(result.exclude).toEqual({ claude: ["agents/**"], default: [] });
  });

  it("allows omitting exclude", () => {
    const result = userConfigSchema.parse({});
    expect(result.exclude).toBeUndefined();
  });

  it("rejects exclude with non-string array items", () => {
    expect(() => userConfigSchema.parse({ exclude: [123] })).toThrow();
  });

  it("validates preserveOnClean as array of strings", () => {
    const result = userConfigSchema.parse({ preserveOnClean: ["AGENTS.md", ".claude/**"] });
    expect(result.preserveOnClean).toEqual(["AGENTS.md", ".claude/**"]);
  });

  it("validates preserveOnClean as per-target object", () => {
    const result = userConfigSchema.parse({
      preserveOnClean: { codex: ["AGENTS.md"], default: [] },
    });
    expect(result.preserveOnClean).toEqual({ codex: ["AGENTS.md"], default: [] });
  });

  it("allows omitting preserveOnClean", () => {
    const result = userConfigSchema.parse({});
    expect(result.preserveOnClean).toBeUndefined();
  });

  it("rejects preserveOnClean with non-string array items", () => {
    expect(() => userConfigSchema.parse({ preserveOnClean: [123] })).toThrow();
  });

  it("validates additionalTemplateDirs as array of strings", () => {
    const result = userConfigSchema.parse({
      additionalTemplateDirs: ["~/.universal-ai-config", "/shared/templates"],
    });
    expect(result.additionalTemplateDirs).toEqual(["~/.universal-ai-config", "/shared/templates"]);
  });

  it("allows omitting additionalTemplateDirs", () => {
    const result = userConfigSchema.parse({});
    expect(result.additionalTemplateDirs).toBeUndefined();
  });

  it("rejects additionalTemplateDirs with non-string items", () => {
    expect(() => userConfigSchema.parse({ additionalTemplateDirs: [123] })).toThrow();
  });

  it("validates mcp config with flat arrays and booleans", () => {
    const result = userConfigSchema.parse({
      mcp: { forceOptIn: true, mcpServers: ["github", "playwright"] },
    });
    expect(result.mcp).toEqual({ forceOptIn: true, mcpServers: ["github", "playwright"] });
  });

  it("validates mcp config with per-target shapes", () => {
    const result = userConfigSchema.parse({
      mcp: {
        forceOptIn: { claude: true, default: false },
        mcpServers: { claude: ["github"], copilot: ["playwright"], default: [] },
      },
    });
    expect(result.mcp?.forceOptIn).toEqual({ claude: true, default: false });
    expect(result.mcp?.mcpServers).toEqual({
      claude: ["github"],
      copilot: ["playwright"],
      default: [],
    });
  });

  it("allows omitting mcp", () => {
    const result = userConfigSchema.parse({});
    expect(result.mcp).toBeUndefined();
  });

  it("allows partial mcp config (forceOptIn only)", () => {
    const result = userConfigSchema.parse({ mcp: { forceOptIn: true } });
    expect(result.mcp).toEqual({ forceOptIn: true });
  });

  it("rejects mcp.mcpServers with non-string items", () => {
    expect(() => userConfigSchema.parse({ mcp: { mcpServers: [123] } })).toThrow();
  });

  it("rejects mcp.forceOptIn as non-boolean", () => {
    expect(() => userConfigSchema.parse({ mcp: { forceOptIn: "yes" } })).toThrow();
  });
});

describe("defineConfig", () => {
  it("returns the config as-is (identity helper)", () => {
    const config = { targets: ["claude" as const], variables: { x: 1 } };
    expect(defineConfig(config)).toBe(config);
  });
});

describe("loadProjectConfig with inline overrides", () => {
  it("applies inline overrides above config file defaults", async () => {
    const config = await loadProjectConfig({
      root: BASIC_FIXTURES_DIR,
      inlineOverrides: {
        variables: { customVar: "hello" },
        templatesDir: ".custom-templates",
      },
    });
    expect(config.variables.customVar).toBe("hello");
    expect(config.templatesDir).toBe(".custom-templates");
  });

  it("CLI targets override inline overrides targets", async () => {
    const config = await loadProjectConfig({
      root: BASIC_FIXTURES_DIR,
      inlineOverrides: { targets: ["copilot"] },
      cliTargets: ["claude"],
    });
    expect(config.targets).toEqual(["claude"]);
  });

  it("inline overrides targets apply when no CLI targets given", async () => {
    const config = await loadProjectConfig({
      root: BASIC_FIXTURES_DIR,
      inlineOverrides: { targets: ["copilot"] },
    });
    expect(config.targets).toEqual(["copilot"]);
  });

  it("inline overrides variables deep-merge with config file variables", async () => {
    const config = await loadProjectConfig({
      root: VARIABLES_FIXTURES_DIR,
      inlineOverrides: { variables: { newVar: "new" } },
    });
    // Should have both the fixture's variables AND the inline ones
    expect(config.variables.newVar).toBe("new");
    expect(config.variables.apiHost).toBe("example.com");
  });

  it("inline overrides outputDirs deep-merge with defaults", async () => {
    const config = await loadProjectConfig({
      root: BASIC_FIXTURES_DIR,
      inlineOverrides: { outputDirs: { claude: ".custom-claude" } },
    });
    expect(config.outputDirs.claude).toBe(".custom-claude");
    // Other targets unchanged
    expect(config.outputDirs.copilot).toBe(".github");
    expect(config.outputDirs.cursor).toBe(".cursor");
  });

  it("validates inline overrides with Zod schema", async () => {
    await expect(
      loadProjectConfig({
        root: BASIC_FIXTURES_DIR,
        inlineOverrides: { targets: ["invalid" as "claude"] },
      }),
    ).rejects.toThrow();
  });

  it("merges mcp config field-by-field (overrides replace per-field)", async () => {
    const config = await loadProjectConfig({
      root: BASIC_FIXTURES_DIR,
      inlineOverrides: {
        mcp: { forceOptIn: true, mcpServers: [] },
      },
    });
    expect(config.mcp.forceOptIn).toBe(true);
    expect(config.mcp.mcpServers).toEqual([]);
  });

  it("partial mcp overrides preserve fields set by base config", async () => {
    // Simulates: base sets forceOptIn=true with empty list,
    // overrides bring in a per-target list and forceOptIn stays from base.
    let config = await loadProjectConfig({
      root: BASIC_FIXTURES_DIR,
      inlineOverrides: { mcp: { forceOptIn: true, mcpServers: [] } },
    });
    expect(config.mcp).toEqual({ forceOptIn: true, mcpServers: [] });

    config = await loadProjectConfig({
      root: BASIC_FIXTURES_DIR,
      inlineOverrides: {
        mcp: {
          forceOptIn: true,
          mcpServers: { claude: ["github"], copilot: ["playwright"], default: [] },
        },
      },
    });
    expect(config.mcp.forceOptIn).toBe(true);
    expect(config.mcp.mcpServers).toEqual({
      claude: ["github"],
      copilot: ["playwright"],
      default: [],
    });
  });

  it("ignores empty inline overrides", async () => {
    const withEmpty = await loadProjectConfig({
      root: BASIC_FIXTURES_DIR,
      inlineOverrides: {},
    });
    const without = await loadProjectConfig({
      root: BASIC_FIXTURES_DIR,
    });
    expect(withEmpty).toEqual(without);
  });
});

describe("agentsMd config", () => {
  it("defaults to the nested variation and .agents/uac-instructions, with enable unset", async () => {
    const config = await loadProjectConfig({ root: BASIC_FIXTURES_DIR });
    expect(config.agentsMd).toEqual({ variation: "nested", indexDir: ".agents/uac-instructions" });
  });

  it("merges field by field, like mcp", async () => {
    const config = await loadProjectConfig({
      root: BASIC_FIXTURES_DIR,
      inlineOverrides: { agentsMd: { variation: "index" } },
    });
    expect(config.agentsMd).toEqual({ variation: "index", indexDir: ".agents/uac-instructions" });

    const enabled = await loadProjectConfig({
      root: BASIC_FIXTURES_DIR,
      inlineOverrides: { agentsMd: { enable: false, indexDir: "docs/agents" } },
    });
    expect(enabled.agentsMd).toEqual({
      enable: false,
      variation: "nested",
      indexDir: "docs/agents",
    });
  });

  it("rejects an unknown variation", () => {
    expect(() => userConfigSchema.parse({ agentsMd: { variation: "flat" } })).toThrow();
  });

  const invalid: Array<[string, string]> = [
    ["", "empty"],
    ["   ", "empty"],
    ["/abs/dir", "relative"],
    [".", "project root"],
    ["./", "project root"],
    ["docs/../..", '".."'],
    [".universal-ai-config/notes", "templates dir"],
    [".universal-ai-config/instructions/scoped", "templates dir"],
    [".claude/rules/scoped", ".claude/rules"],
    [".cursor/rules", ".cursor/rules"],
    [".github/instructions/x", ".github/instructions"],
    [".github/skills/x", ".github/skills"],
    [".agents/skills/x", ".agents/skills"],
    [".claude/agents", ".claude/agents"],
  ];
  for (const [indexDir, reason] of invalid) {
    it(`rejects indexDir ${JSON.stringify(indexDir)} (${reason})`, async () => {
      await expect(
        loadProjectConfig({
          root: BASIC_FIXTURES_DIR,
          inlineOverrides: { agentsMd: { indexDir } },
        }),
      ).rejects.toThrow(/Invalid agentsMd\.indexDir/);
    });
  }

  it("rejects an indexDir that contains the templates dir (clean would delete it)", async () => {
    await expect(
      loadProjectConfig({
        root: BASIC_FIXTURES_DIR,
        inlineOverrides: { templatesDir: ".agents/templates", agentsMd: { indexDir: ".agents" } },
      }),
    ).rejects.toThrow(/templates dir/);
  });

  it("rejects an indexDir inside a configured output dir's instruction folder", async () => {
    await expect(
      loadProjectConfig({
        root: BASIC_FIXTURES_DIR,
        inlineOverrides: {
          outputDirs: { claude: ".ai/claude" },
          agentsMd: { indexDir: ".ai/claude/rules/scoped" },
        },
      }),
    ).rejects.toThrow(/\.ai\/claude\/rules/);
  });

  it("accepts safe index dirs, including next to a root-level templates dir", async () => {
    for (const indexDir of [".agents/uac-instructions", "docs/ai/scoped", ".claude/scoped"]) {
      await expect(
        loadProjectConfig({
          root: BASIC_FIXTURES_DIR,
          inlineOverrides: { agentsMd: { indexDir } },
        }),
      ).resolves.toBeDefined();
    }
    await expect(
      loadProjectConfig({
        root: BASIC_FIXTURES_DIR,
        inlineOverrides: { templatesDir: ".", agentsMd: { indexDir: "scoped-instructions" } },
      }),
    ).resolves.toBeDefined();
  });
});

describe("overrides file name", () => {
  const dirs: string[] = [];
  afterEach(async () => {
    for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
  });
  async function projectWith(file: string): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "uac-overrides-"));
    dirs.push(dir);
    await writeFile(join(dir, file), 'export default { targets: ["codex"] };\n', "utf-8");
    return dir;
  }

  it("loads the documented universal-ai-config.overrides.ts", async () => {
    const root = await projectWith("universal-ai-config.overrides.ts");
    expect((await loadProjectConfig({ root })).targets).toEqual(["codex"]);
  });

  it("still loads universal-ai-config.overrides.config.ts", async () => {
    const root = await projectWith("universal-ai-config.overrides.config.ts");
    expect((await loadProjectConfig({ root })).targets).toEqual(["codex"]);
  });
});
