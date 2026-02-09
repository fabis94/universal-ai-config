import { describe, it, expect } from "vitest";
import { userConfigSchema, defineConfig } from "../../src/config/schema.js";

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
});

describe("defineConfig", () => {
  it("returns the config as-is (identity helper)", () => {
    const config = { targets: ["claude" as const], variables: { x: 1 } };
    expect(defineConfig(config)).toBe(config);
  });
});
