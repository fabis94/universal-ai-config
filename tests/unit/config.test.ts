import { describe, it, expect } from "vitest";
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
